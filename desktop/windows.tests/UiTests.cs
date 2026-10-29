using System.Diagnostics;
using System.Text.Json.Nodes;
using System.Threading;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;
using NUnit.Framework;
using Application = FlaUI.Core.Application;

namespace CleanYourHarmony.Tests;

[TestFixture, NonParallelizable, Apartment(ApartmentState.MTA)]
public sealed class UiTests
{
    private Application app = null!;
    private UIA3Automation automation = null!;
    private Window window = null!;
    private string capture = "";
    private string? startupFailure;
    private AutomationElement Find(string id) => window.FindFirstDescendant(c => c.ByAutomationId(id)) ?? throw new AssertionException("Missing control: " + id);
    private static void Until(Func<bool> check, string reason)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < TimeSpan.FromSeconds(60)) { if (check()) return; Thread.Sleep(100); }
        Assert.Fail(reason);
    }
    private void Invoke(string id) => Find(id).Patterns.Invoke.Pattern.Invoke();
    private double ScrollPosition => Find("settings-list").Patterns.Scroll.Pattern.VerticalScrollPercent.Value;
    [SetUp] public void Start()
    {
        Assert.That(startupFailure, Is.Null, "A previous launch failed; see its UI tree and engine log instead of repeating the same launch.");
        try
        {
        string? executable = Environment.GetEnvironmentVariable("CYH_UI_APP");
        Assert.That(executable, Is.Not.Null.And.Not.Empty, "Run desktop/tests/windows.ps1 to prepare an isolated UI fixture app.");
        capture = Path.Combine(Path.GetTempPath(), "cyh-ui-" + Guid.NewGuid() + ".json");
        var info = new ProcessStartInfo(executable!) { UseShellExecute = false };
        info.Environment["CYH_UI_CAPTURE"] = capture;
        automation = new UIA3Automation(); app = Application.Launch(info);
        Until(() => {
            if (app.HasExited) Assert.Fail($"App exited before showing settings: 0x{app.ExitCode:X8}");
            return (window = app.GetAllTopLevelWindows(automation).FirstOrDefault(w =>
                w.Name == "cleanYourHarmony" && w.FindFirstDescendant(c => c.ByAutomationId("settings-list")) != null)!) != null;
        },
            "App did not expose its settings window");
        Until(() => window.FindFirstDescendant(c => c.ByAutomationId("select-B01")) != null, "Catalog was not rendered");
        Until(() => Find("execute").IsEnabled, "Fixture device did not become ready");
        }
        catch (Exception e) { startupFailure = e.Message; throw; }
    }
    [TearDown] public void Stop()
    {
        bool closedNormally = true;
        if (TestContext.CurrentContext.Result.Outcome.Status == NUnit.Framework.Interfaces.TestStatus.Failed)
        {
            try
            {
                string output = Environment.GetEnvironmentVariable("CYH_UI_DIAGNOSTICS") ?? Path.GetTempPath();
                Directory.CreateDirectory(output);
                var lines = new List<string> { $"Interactive={Environment.UserInteractive}; testSession={Process.GetCurrentProcess().SessionId}" };
                var candidates = new List<AutomationElement>();
                if (app != null && automation != null)
                {
                    lines.Add($"App pid={app.ProcessId} exited={app.HasExited} hwnd={app.MainWindowHandle}");
                    if (app.HasExited) lines.Add($"Exit code=0x{app.ExitCode:X8}");
                    foreach (var top in automation.GetDesktop().FindAllChildren())
                        lines.Add($"Desktop child pid={top.Properties.ProcessId.Value} type={top.ControlType} name={top.Name} class={top.ClassName}");
                    candidates.AddRange(app.GetAllTopLevelWindows(automation));
                    if (app.MainWindowHandle != IntPtr.Zero) candidates.Add(automation.FromHandle(app.MainWindowHandle));
                }
                foreach (var candidate in candidates)
                {
                    lines.Add($"Window name={candidate.Name} class={candidate.ClassName} bounds={candidate.BoundingRectangle} offscreen={candidate.IsOffscreen}");
                    foreach (var element in candidate.FindAllDescendants())
                        lines.Add($"UIA {element.ControlType} id={element.AutomationId} name={element.Name} offscreen={element.IsOffscreen}");
                    if (!candidate.IsOffscreen && candidate.ActualWidth > 0 && candidate.ActualHeight > 0)
                    {
                        string screenshot = Path.Combine(output, $"{TestContext.CurrentContext.Test.Name}-{Guid.NewGuid():N}.png");
                        try { candidate.CaptureToFile(screenshot); TestContext.AddTestAttachment(screenshot); }
                        catch (Exception e) { lines.Add("Screenshot failed: " + e.Message); }
                    }
                }
                string log = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cleanYourHarmony", "desktop.log");
                if (File.Exists(log)) lines.Add("Engine log:\n" + File.ReadAllText(log));
                string diagnostics = Path.Combine(output, TestContext.CurrentContext.Test.Name + ".txt");
                File.WriteAllLines(diagnostics, lines); TestContext.AddTestAttachment(diagnostics);
            }
            catch (Exception e) { TestContext.Progress.WriteLine("Diagnostics unavailable: " + e.Message); }
        }
        try { if (app != null && !app.HasExited && !(closedNormally = app.Close(false))) app.Kill(); }
        finally { automation?.Dispose(); app?.Dispose(); automation = null!; app = null!; window = null!; if (File.Exists(capture)) File.Delete(capture); }
        Assert.That(closedNormally, Is.True, "Application did not close gracefully");
    }
    [Test] public void AllTwentyRowsRemainInOneScrollableDocumentAndNavigationPreservesEdits()
    {
        Assert.That(window.FindAllDescendants(c => c.ByControlType(ControlType.CheckBox)).Count(e => e.AutomationId.StartsWith("select-")), Is.EqualTo(20));
        Find("select-B02").AsCheckBox().IsChecked = false;
        Until(() => Find("selection-count").Name == "已选 19 项", "Checkbox action did not update the plan");
        Find("nav-system").Click(); Until(() => ScrollPosition > 70, "System jump did not scroll");
        Assert.That(Find("select-P01").IsOffscreen, Is.False);
        Find("nav-browser").Click(); Until(() => ScrollPosition < 1, "Browser jump did not return to the top");
        Assert.That(Find("select-B02").AsCheckBox().IsChecked, Is.False);
        Find("settings-list").Patterns.Scroll.Pattern.SetScrollPercent(-1, 100);
        Until(() => !Find("select-P01").IsOffscreen, "Continuous scroll did not reach the final row");
        Assert.That(window.FindAllDescendants(c => c.ByControlType(ControlType.CheckBox)).Count(e => e.AutomationId.StartsWith("select-")), Is.EqualTo(20));
        Find("nav-browser").Click(); Until(() => ScrollPosition < 1, "Repeated category click did not jump");
    }
    [Test] public void GroupSelectionAndEmptySelectionAreIndependent()
    {
        Invoke("clear-group-browser");
        Until(() => Find("selection-count").Name == "已选 17 项", "Group deselection count incorrect");
        Assert.That(window.FindAllDescendants().Any(e => e.AutomationId.StartsWith("target-")), Is.False);
        Assert.That(Find("select-F01").AsCheckBox().IsChecked, Is.True);
        Invoke("clear-all"); Until(() => !Find("execute").IsEnabled, "Empty selection can execute");
        Invoke("select-group-browser");
        Until(() => Find("selection-count").Name == "已选 3 项", "Group selection count incorrect");
        Invoke("select-all"); Until(() => Find("selection-count").Name == "已选 20 项", "Global selection failed");
    }
    [Test] public void ExecutionFreezesEditingAndReportsPartialFailure()
    {
        Invoke("clear-all"); Invoke("select-group-browser");
        Invoke("execute");
        Until(() => window.FindFirstDescendant(c => c.ByAutomationId("stop")) != null, "Execution never started");
        Assert.That(Find("select-B01").IsEnabled, Is.False); Assert.That(Find("clear-all").IsEnabled, Is.False);
        Until(() => window.FindFirstDescendant(c => c.ByName("执行结束，部分项目失败")) != null, "Partial failure was not displayed");
        Assert.That(window.FindFirstDescendant(c => c.ByName("勿扰已恢复原状态")), Is.Not.Null);
        var request = JsonNode.Parse(File.ReadAllText(capture))!;
        Assert.That(request["selection"]!.AsArray().Select(x => x!["id"]!.GetValue<string>()), Is.EquivalentTo(new[] { "B01", "B02", "B03" }));
        Assert.That(request["selection"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == "B01")!["target"]!.GetValue<string>(), Is.EqualTo("simple"));
        Assert.That(request["selection"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == "B02")!["target"]!.GetValue<bool>(), Is.False);
        Until(() => Find("execute").IsEnabled, "Controls did not unlock after the first run");
        Invoke("execute");
        Until(() => !Find("select-B01").IsEnabled, "A second execution did not start");
        Invoke("stop");
        Until(() => window.FindFirstDescendant(c => c.ByName("执行未完成")) != null, "Second execution did not stop cleanly");
    }
    [Test] public void StopWaitsForCleanupAndNeverReportsFullSuccess()
    {
        Invoke("execute"); Until(() => window.FindFirstDescendant(c => c.ByAutomationId("stop")) != null, "Execution never started");
        Invoke("stop");
        Until(() => window.FindFirstDescendant(c => c.ByName("执行未完成")) != null, "Cancelled run was not incomplete");
        Assert.That(window.FindFirstDescendant(c => c.ByName("勿扰已恢复原状态")), Is.Not.Null);
        Until(() => Find("execute").IsEnabled, "Controls did not unlock after cleanup");
    }
}
