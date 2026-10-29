using System.Diagnostics;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.UIA3;
using NUnit.Framework;

namespace CleanYourHarmony.Tests;

[TestFixture, NonParallelizable]
public sealed class DesktopEnvironmentTests
{
    [Test] public void IndependentWinUiWindowSupportsRealAutomation()
    {
        string executable = Environment.GetEnvironmentVariable("CYH_GUI_SMOKE_APP")
            ?? throw new InvalidOperationException("Run desktop/tests/windows.ps1 first");
        using var automation = new UIA3Automation();
        using var app = Application.Launch(new ProcessStartInfo(executable) { UseShellExecute = false });
        Window? window = null;
        void Wait(Func<bool> condition, string message)
        {
            var clock = Stopwatch.StartNew();
            while (clock.Elapsed < TimeSpan.FromSeconds(30))
            {
                if (app.HasExited) Assert.Fail($"WinUI preflight exited: 0x{app.ExitCode:X8}");
                if (condition()) return;
                Thread.Sleep(100);
            }
            Assert.Fail(message);
        }
        try
        {
            Wait(() => (window = app.GetAllTopLevelWindows(automation).FirstOrDefault(w => w.Name == "WinUI desktop preflight")) != null, "No independently created WinUI window was accessible");
            AutomationElement? button = null;
            Wait(() => (button = window!.FindFirstDescendant(c => c.ByAutomationId("smoke-invoke"))) != null, "WinUI button was not accessible");
            button!.Patterns.Invoke.Pattern.Invoke();
            Wait(() => window!.FindFirstDescendant(c => c.ByAutomationId("smoke-result"))?.Name == "Interaction confirmed", "The native button did not update its result");
            string output = Environment.GetEnvironmentVariable("CYH_UI_DIAGNOSTICS") ?? Path.GetTempPath();
            string screenshot = Path.Combine(output, "winui-preflight.png");
            window!.CaptureToFile(screenshot); TestContext.AddTestAttachment(screenshot);
        }
        finally
        {
            bool closed = app.Close(false);
            if (!closed) app.Kill();
            Assert.That(closed, Is.True, "Preflight window did not close normally");
        }
    }
}
