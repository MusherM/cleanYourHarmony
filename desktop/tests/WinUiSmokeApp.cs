using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;

namespace CleanYourHarmony;

// A standalone WinUI window used only to verify the test host's GUI capability.
public partial class App : Application
{
    private Window? window;
    public App() { InitializeComponent(); }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        window = new Window { Title = "WinUI desktop preflight" };
        var result = new TextBlock { Text = "Waiting" };
        var button = new Button { Content = "Verify interaction" };
        AutomationProperties.SetAutomationId(result, "smoke-result");
        AutomationProperties.SetAutomationId(button, "smoke-invoke");
        button.Click += (_, _) => result.Text = "Interaction confirmed";
        var content = new StackPanel { Spacing = 16, Padding = new Thickness(24) };
        content.Children.Add(button); content.Children.Add(result);
        window.Content = content;
        window.AppWindow.Resize(new Windows.Graphics.SizeInt32(540, 360));
        window.Activate();
    }
}
