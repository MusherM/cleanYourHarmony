using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Automation;
using Windows.Graphics;
namespace CleanYourHarmony;

internal sealed class Setting
{
    public required string Id, Name, Category;
    public bool Selected;
    public required JsonNode Target { get; init; }
    public string Result = "", Detail = "";
    public string? Evidence;
}
public sealed class MainWindow : Window
{
    private readonly EngineClient engine = new();
    private readonly List<Setting> settings = [];
    private readonly NavigationView navigation = new() { IsBackButtonVisible = NavigationViewBackButtonVisible.Collapsed, IsSettingsVisible = false, PaneDisplayMode = NavigationViewPaneDisplayMode.Left, OpenPaneLength = 250, IsPaneToggleButtonVisible = false };
    private readonly ComboBox devicePicker = new() { PlaceholderText = "选择手机", HorizontalAlignment = HorizontalAlignment.Stretch };
    private readonly TextBlock modelLabel = Label("未连接手机", 17), softwareLabel = Label("", 13), connectionLabel = Label("未就绪", 13);
    private readonly TextBlock heading = Label("手机设置", 30), message = Label("正在准备设备工具…", 14), dnd = Label("", 13), selectionLabel = Label("已选 20 项", 15);
    private readonly StackPanel rows = new(), recoveryPanel = new() { Orientation = Orientation.Horizontal, Spacing = 10 };
    private readonly ScrollViewer scroll = new() { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
    private readonly List<(string Id, string Name)> categories = [];
    private readonly Dictionary<string, FrameworkElement> sectionHeaders = [];
    private readonly ProgressBar progress = new() { Visibility = Visibility.Collapsed, Minimum = 0, Maximum = 20 };
    private readonly Button execute = new() { Content = "执行所选项目", Padding = new Thickness(24, 10, 24, 10) }, stop = new() { Content = "停止执行", Visibility = Visibility.Collapsed };
    private readonly List<Button> editButtons = [];
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(5) };
    private JsonArray devices = [], recoverable = [];
    private string deviceId = "", directory = "";
    private bool working, discovering, ready, closing, allowClose, rendering, hasRunOutcome;
    private readonly Dictionary<string, TextBlock> resultLabels = [];
    public MainWindow()
    {
        Title = "cleanYourHarmony";
        AppWindow.Resize(new SizeInt32(1180, 880));
        BuildLayout();
        if (Microsoft.UI.Composition.SystemBackdrops.MicaController.IsSupported()) SystemBackdrop = new MicaBackdrop();
        engine.Event += data => DispatcherQueue.TryEnqueue(() => OnEvent(data));
        engine.Exited += () => DispatcherQueue.TryEnqueue(() => { ready = false; working = false; discovering = false; message.Text = "执行器已退出；重新打开应用可检查未完成任务。"; UpdateControls(); if (closing) { allowClose = true; Close(); } });
        AppWindow.Closing += (sender, e) => { if (allowClose || !engine.Running) return; e.Cancel = true; closing = true; timer.Stop(); _ = CloseSafely(); };
        timer.Tick += async (_, _) => await Refresh();
        try { engine.Start(); timer.Start(); } catch (Exception e) { message.Text = e.Message; }
    }
    private static TextBlock Label(string text, double size) => new() { Text = text, FontSize = size, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
    private Button Action(string title, Action action, bool editing = true)
    {
        var button = new Button { Content = title };
        button.Click += (_, _) => action(); if (editing) editButtons.Add(button); return button;
    }
    private void BuildLayout()
    {
        var sidebar = new StackPanel { Spacing = 10, Margin = new Thickness(18, 22, 18, 24) };
        sidebar.Children.Add(Label("cleanYourHarmony", 20)); sidebar.Children.Add(devicePicker); sidebar.Children.Add(modelLabel); sidebar.Children.Add(softwareLabel); sidebar.Children.Add(connectionLabel);
        devicePicker.SelectionChanged += (_, _) => { if (rendering) return; deviceId = (devicePicker.SelectedItem as ComboBoxItem)?.Tag as string ?? ""; ShowDevice(); UpdateControls(); ShowRecovery(); };
        navigation.PaneHeader = sidebar;
        var guidance = new StackPanel { Spacing = 12, Margin = new Thickness(18) };
        guidance.Children.Add(Label("解锁手机并用 USB 数据线连接。在开发者选项中开启 USB 调试，然后在手机上允许此电脑。", 13));
        guidance.Children.Add(Action("重新检测", () => _ = Refresh(), false)); navigation.PaneFooter = guidance;
        navigation.ItemInvoked += (_, e) => {
            if (e.InvokedItemContainer is NavigationViewItem item && sectionHeaders.TryGetValue((string)item.Tag, out var section))
                section.StartBringIntoView(new BringIntoViewOptions { AnimationDesired = true, VerticalAlignmentRatio = 0 });
        };
        var content = new Grid { Padding = new Thickness(28) };
        foreach (var size in new[] { GridLength.Auto, GridLength.Auto, new GridLength(1, GridUnitType.Star), GridLength.Auto, GridLength.Auto }) content.RowDefinitions.Add(new RowDefinition { Height = size });
        var header = new Grid { Margin = new Thickness(0, 8, 0, 24) };
        header.Children.Add(heading); content.Children.Add(header);
        var columns = new Grid { Padding = new Thickness(16, 12, 16, 12), Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent) };
        columns.ColumnDefinitions.Add(new() { Width = new GridLength(60) }); columns.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        columns.Children.Add(Label("执行", 13)); var settingTitle = Label("设置项目", 13); Grid.SetColumn(settingTitle, 1); columns.Children.Add(settingTitle); Grid.SetRow(columns, 1); content.Children.Add(columns);
        scroll.Content = rows; AutomationProperties.SetAutomationId(scroll, "settings-list"); Grid.SetRow(scroll, 2); content.Children.Add(scroll);
        AutomationProperties.SetAutomationId(message, "device-status");
        var status = new StackPanel { Spacing = 10, Margin = new Thickness(0, 18, 0, 18) }; status.Children.Add(progress); status.Children.Add(message); status.Children.Add(dnd); status.Children.Add(recoveryPanel); Grid.SetRow(status, 3); content.Children.Add(status);
        var footer = new Grid(); footer.Children.Add(selectionLabel);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, HorizontalAlignment = HorizontalAlignment.Right };
        var selectAll = Action("全选", () => SetSelection(true)); AutomationProperties.SetAutomationId(selectAll, "select-all"); actions.Children.Add(selectAll);
        var clearAll = Action("全不选", () => SetSelection(false)); AutomationProperties.SetAutomationId(clearAll, "clear-all"); actions.Children.Add(clearAll);
        AutomationProperties.SetAutomationId(selectionLabel, "selection-count"); AutomationProperties.SetAutomationId(execute, "execute"); AutomationProperties.SetAutomationId(stop, "stop");
        execute.Style = (Style)Application.Current.Resources["AccentButtonStyle"]; execute.Click += async (_, _) => await StartRun();
        stop.Click += async (_, _) => { stop.IsEnabled = false; message.Text = "正在停止并恢复勿扰…"; await TryRequest("cancel"); };
        actions.Children.Add(stop); actions.Children.Add(execute); footer.Children.Add(actions); Grid.SetRow(footer, 4); content.Children.Add(footer);
        navigation.Content = content; Content = navigation; UpdateControls();
    }
    private void SetSelection(bool selected, string? group = null) { foreach (var item in settings.Where(i => group == null || i.Category == group)) item.Selected = selected; RenderRows(); UpdateControls(); }
    private void RenderRows()
    {
        double offset = scroll.VerticalOffset;
        rows.Children.Clear(); resultLabels.Clear(); sectionHeaders.Clear();
        foreach (var group in categories)
        {
            var header = new Grid { Padding = new Thickness(16, 24, 16, 12) };
            var title = Label(group.Name, 18); AutomationProperties.SetHeadingLevel(title, Microsoft.UI.Xaml.Automation.Peers.AutomationHeadingLevel.Level2); header.Children.Add(title);
            var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right };
            var selectGroup = Action("全选本组", () => SetSelection(true, group.Id), false); AutomationProperties.SetAutomationId(selectGroup, "select-group-" + group.Id); actions.Children.Add(selectGroup);
            var clearGroup = Action("取消本组", () => SetSelection(false, group.Id), false); AutomationProperties.SetAutomationId(clearGroup, "clear-group-" + group.Id); actions.Children.Add(clearGroup);
            selectGroup.IsEnabled = clearGroup.IsEnabled = !working;
            header.Children.Add(actions); sectionHeaders[group.Id] = header; rows.Children.Add(header);
        foreach (var item in settings.Where(i => i.Category == group.Id))
        {
            var row = new Grid { Padding = new Thickness(16, 14, 16, 14), MinHeight = 60 };
            row.ColumnDefinitions.Add(new() { Width = new GridLength(60) }); row.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
            var check = new CheckBox { IsChecked = item.Selected, IsEnabled = !working, VerticalAlignment = VerticalAlignment.Center };
            AutomationProperties.SetName(check, "执行 " + item.Name); AutomationProperties.SetAutomationId(check, "select-" + item.Id); row.Children.Add(check);
            var text = new StackPanel { Spacing = 4, VerticalAlignment = VerticalAlignment.Center }; text.Children.Add(Label(item.Name, 16));
            var result = Label(item.Result + (item.Detail.Length > 0 ? "：" + item.Detail : ""), 12); resultLabels[item.Id] = result; text.Children.Add(result);
            if (item.Evidence is { } evidence) text.Children.Add(Action("查看现场证据", () => OpenEvidence(evidence), false));
            Grid.SetColumn(text, 1); row.Children.Add(text);
            RoutedEventHandler onSelection = (_, _) => { item.Selected = check.IsChecked == true; UpdateControls(); };
            check.Checked += onSelection; check.Unchecked += onSelection;
            rows.Children.Add(row);
        }
        }
        rows.UpdateLayout(); scroll.ChangeView(null, offset, null, true);
    }
    private async void OnEvent(JsonObject data)
    {
        switch (data["event"]?.GetValue<string>())
        {
            case "ready":
                ready = true; recoverable = data["recoverable"]?.DeepClone() as JsonArray ?? [];
                var response = await TryRequest("catalog");
                if (response?["result"] is JsonObject catalog)
                {
                    foreach (var c in catalog["categories"]!.AsArray()) { string id = c!["id"]!.GetValue<string>(), name = c["name"]!.GetValue<string>(); categories.Add((id, name)); var item = new NavigationViewItem { Content = name, Tag = id, Icon = new SymbolIcon(id switch { "browser" => Symbol.World, "assistant" => Symbol.AllApps, "notifications" => Symbol.Message, _ => Symbol.Setting }) }; AutomationProperties.SetAutomationId(item, "nav-" + id); navigation.MenuItems.Add(item); }
                    navigation.SelectedItem = navigation.MenuItems.FirstOrDefault();
                    foreach (var o in catalog["operations"]!.AsArray()) { var control = o!["control"]!; settings.Add(new Setting { Id = o["id"]!.GetValue<string>(), Name = o["name"]!.GetValue<string>(), Category = o["category"]!.GetValue<string>(), Selected = o["selected"]!.GetValue<bool>(), Target = control["default"]!.DeepClone() }); }
                    RenderRows(); UpdateControls(); await Refresh();
                }
                break;
            case "progress": directory = data["directory"]!.GetValue<string>(); ShowProgress(data["progress"]!.AsObject()); break;
            case "idle": working = false; discovering = false; recoverable = data["recoverable"]?.DeepClone() as JsonArray ?? []; RenderRows(); UpdateControls(); ShowRecovery(); if (closing) await TryRequest("shutdown"); break;
            case "transportError": message.Text = data["error"]?.GetValue<string>(); break;
        }
    }
    private async Task<JsonObject?> TryRequest(string method, JsonObject? parameters = null)
    {
        try { return await engine.Request(method, parameters); } catch (Exception e) { message.Text = e.Message; return null; }
    }
    private async Task Refresh()
    {
        if (!ready || working || discovering || closing) return;
        discovering = true; UpdateControls(); var reply = await TryRequest("devices");
        if (reply is null) { devices = []; discovering = false; UpdateControls(); return; }
        devices = reply["result"]?.DeepClone() as JsonArray ?? [];
        if (!devices.Any(d => d?["id"]?.GetValue<string>() == deviceId)) deviceId = devices.Count == 1 ? devices[0]!["id"]!.GetValue<string>() : "";
        rendering = true; devicePicker.Items.Clear();
        foreach (var device in devices) { var item = new ComboBoxItem { Content = device!["model"]?.GetValue<string>() is { Length: > 0 } name ? name : device["id"]!.GetValue<string>(), Tag = device["id"]!.GetValue<string>() }; devicePicker.Items.Add(item); if ((string)item.Tag == deviceId) devicePicker.SelectedItem = item; }
        rendering = false; discovering = false; ShowDevice(); UpdateControls(); ShowRecovery();
    }
    private JsonNode? Device => devices.FirstOrDefault(d => d?["id"]?.GetValue<string>() == deviceId);
    private bool DeviceReady => Device?["status"]?.GetValue<string>() == "Connected" && Device?["error"] == null && Device?["model"]?.GetValue<string>() is { Length: > 0 };
    private JsonNode? Pending => recoverable.FirstOrDefault(r => r?["deviceId"]?.GetValue<string>() == deviceId && r?["restorePending"]?.GetValue<bool>() == true) ?? recoverable.FirstOrDefault(r => r?["deviceId"]?.GetValue<string>() == deviceId);
    private void ShowDevice()
    {
        modelLabel.Text = Device?["model"]?.GetValue<string>() is { Length: > 0 } name ? name : "未连接手机";
        softwareLabel.Text = Device?["software"]?.GetValue<string>() ?? "";
        connectionLabel.Text = DeviceReady ? "已连接" : Device?["status"]?.GetValue<string>() == "Unauthorized" ? "等待手机授权" : "未就绪";
        if (!DeviceReady) message.Text = Device?["error"]?.GetValue<string>() ?? (devices.Count == 0 ? "未检测到手机" : deviceId.Length == 0 ? "请选择目标手机" : "请解锁手机并允许 USB 调试");
        else if (!hasRunOutcome) message.Text = "已连接";
    }
    private void UpdateControls()
    {
        selectionLabel.Text = $"已选 {settings.Count(i => i.Selected)} 项";
        execute.IsEnabled = ready && DeviceReady && !working && !discovering && settings.Any(i => i.Selected) && Pending?["restorePending"]?.GetValue<bool>() != true;
        execute.Visibility = working ? Visibility.Collapsed : Visibility.Visible; stop.Visibility = working ? Visibility.Visible : Visibility.Collapsed;
        devicePicker.IsEnabled = !working && !discovering; foreach (var b in editButtons) b.IsEnabled = !working;
    }
    private void ShowRecovery()
    {
        recoveryPanel.Children.Clear(); if (Pending is not { } pending || working) return;
        string dir = pending["directory"]!.GetValue<string>();
        recoveryPanel.Children.Add(Label(pending["restorePending"]?.GetValue<bool>() == true ? "上次任务的勿扰尚未恢复" : "有未完成的任务", 13));
        foreach (string method in pending["restorePending"]?.GetValue<bool>() == true ? new[] { "recover", "resume" } : new[] { "resume" })
        { var button = Action(method == "recover" ? "恢复勿扰" : "继续原任务", () => _ = StartRun(method, dir), false); button.IsEnabled = DeviceReady && !discovering; recoveryPanel.Children.Add(button); }
    }
    private async Task StartRun(string method = "execute", string? resume = null)
    {
        if (working || discovering || !DeviceReady) return;
        JsonObject parameters;
        if (method == "execute") { var selection = new JsonArray(); foreach (var item in settings.Where(i => i.Selected)) selection.Add(new JsonObject { ["id"] = item.Id, ["target"] = item.Target.DeepClone() }); parameters = new() { ["request"] = new JsonObject { ["deviceId"] = deviceId, ["selection"] = selection } }; }
        else parameters = new() { ["deviceId"] = deviceId, ["directory"] = resume };
        hasRunOutcome = true; working = true; stop.IsEnabled = true; directory = ""; dnd.Text = ""; message.Text = "正在检查设备…";
        foreach (var item in settings) { item.Result = ""; item.Detail = ""; item.Evidence = null; }
        RenderRows(); UpdateControls(); ShowRecovery(); var reply = await TryRequest(method, parameters);
        if (reply is null) { working = false; RenderRows(); UpdateControls(); }
        else if (reply["result"] is JsonObject result) { directory = result["directory"]!.GetValue<string>(); ShowProgress(result["progress"]!.AsObject()); }
    }
    private void ShowProgress(JsonObject data)
    {
        string state = data["status"]?.GetValue<string>() ?? "";
        var selected = data["selected"]!.AsArray().Select(x => x!.GetValue<string>()).ToHashSet(); var records = data["items"]!.AsObject();
        var labels = new Dictionary<string,string> { ["passed"]="已修改", ["unchanged"]="无需修改", ["failed"]="失败", ["not_found"]="未找到", ["incomplete"]="未完成", ["pending"]="执行中" };
        int processed = 0;
        foreach (var item in settings)
        {
            var record = records[item.Id]; string status = record?["status"]?.GetValue<string>() ?? "";
            item.Result = labels.GetValueOrDefault(status, selected.Contains(item.Id) ? "未完成" : ""); item.Detail = record?["error"]?.GetValue<string>() ?? record?["reason"]?.GetValue<string>() ?? "";
            item.Evidence = record?["evidence"]?.AsArray().LastOrDefault()?["path"]?.GetValue<string>();
            if (new[] { "passed", "unchanged", "failed", "not_found" }.Contains(status)) processed++;
            if (resultLabels.TryGetValue(item.Id, out var label)) label.Text = item.Result + (item.Detail.Length > 0 ? "：" + item.Detail : "");
        }
        progress.Visibility = state == "running" ? Visibility.Visible : Visibility.Collapsed; progress.Maximum = Math.Max(selected.Count, 1); progress.Value = processed;
        message.Text = state switch { "completed" => "全部所选项目已验证", "completed_with_missing" => "执行结束，部分应用未找到", "completed_with_failures" => "执行结束，部分项目失败", "running" => $"已处理 {processed} / {selected.Count} 项 · {settings.FirstOrDefault(i => i.Id == data["currentItem"]?.GetValue<string>())?.Name ?? "准备执行"}", _ => "执行未完成" };
        if (state != "running" && data["stopReason"]?.GetValue<string>() is { } reason) message.Text += "：" + reason;
        if (data["dnd"] is JsonObject d) dnd.Text = d["restorePending"]?.GetValue<bool>() == true ? "勿扰待恢复" : d["enableError"] != null ? "勿扰准备失败：" + d["enableError"]!.GetValue<string>() : d["restored"] != null ? "勿扰已恢复原状态" : d["original"]?.GetValue<bool>() == true ? "勿扰原已开启，保持开启" : "勿扰已临时开启";
    }
    private void OpenEvidence(string name)
    {
        string root = Path.GetFullPath(directory) + Path.DirectorySeparatorChar, file = Path.GetFullPath(Path.Combine(directory, name));
        if (file.StartsWith(root, StringComparison.OrdinalIgnoreCase) && File.Exists(file)) Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
    }
    private async Task CloseSafely() { if (working || discovering) { stop.IsEnabled = false; message.Text = "正在停止并恢复勿扰…"; await TryRequest("cancel"); } else await TryRequest("shutdown"); }
}
