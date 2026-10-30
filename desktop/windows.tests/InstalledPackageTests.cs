using System.Diagnostics;
using System.Threading;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;
using NUnit.Framework;
using Application = FlaUI.Core.Application;

namespace CleanYourHarmony.Tests;

[TestFixture, NonParallelizable, Apartment(ApartmentState.MTA)]
public sealed class InstalledPackageTests
{
    [Test] public void InstalledApplicationLoadsRealCatalogAndHandlesNoDevice()
    {
        var executable = Environment.GetEnvironmentVariable("CYH_INSTALLED_APP");
        Assert.That(executable, Is.Not.Null.And.Not.Empty, "Run packaging/test-windows-package.ps1");
        using var automation = new UIA3Automation();
        using var app = Application.Launch(new ProcessStartInfo(executable!) { UseShellExecute = false });
        Window? window = null;
        try
        {
            var deadline = Stopwatch.StartNew();
            while (deadline.Elapsed < TimeSpan.FromSeconds(60))
            {
                Assert.That(app.HasExited, Is.False, "Installed app exited during startup");
                window = app.GetAllTopLevelWindows(automation).FirstOrDefault(w => w.Name == "cleanYourHarmony" &&
                    w.FindFirstDescendant(c => c.ByAutomationId("settings-list")) != null);
                if (window?.FindFirstDescendant(c => c.ByName("未检测到手机")) != null) break;
                Thread.Sleep(100);
            }
            Assert.That(window, Is.Not.Null, "Installed window did not load");
            Assert.That(window!.FindFirstDescendant(c => c.ByName("未检测到手机")), Is.Not.Null, "Real bundled HDC did not complete device discovery");
            Assert.That(window!.FindAllDescendants(c => c.ByControlType(ControlType.CheckBox)).Count(e => e.AutomationId.StartsWith("select-")), Is.EqualTo(20));
            Assert.That(window.FindFirstDescendant(c => c.ByAutomationId("execute")).IsEnabled, Is.False);
            window.FindFirstDescendant(c => c.ByAutomationId("clear-all")).Patterns.Invoke.Pattern.Invoke();
            Assert.That(window.FindFirstDescendant(c => c.ByAutomationId("selection-count")).Name, Is.EqualTo("已选 0 项"));
            var screenshot = Path.Combine(Environment.GetEnvironmentVariable("CYH_PACKAGE_RESULTS")!, "installed-app.png");
            window.CaptureToFile(screenshot); TestContext.AddTestAttachment(screenshot);
            Assert.That(app.Close(false), Is.True, "Installed app did not close normally");
        }
        finally
        {
            if (TestContext.CurrentContext.Result.Outcome.Status == NUnit.Framework.Interfaces.TestStatus.Failed)
            {
                if (window != null)
                    foreach (var element in window.FindAllDescendants())
                        TestContext.Progress.WriteLine($"UIA {element.ControlType} id={element.Properties.AutomationId.ValueOrDefault} name={element.Name}");
                string log = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cleanYourHarmony", "desktop.log");
                if (File.Exists(log)) TestContext.Progress.WriteLine(File.ReadAllText(log));
            }
            if (!app.HasExited) app.Kill();
        }
    }
}
