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
    [Test] public void InstalledApplicationLoadsRealCatalogAndReflectsDeviceDiscovery()
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
                var state = window?.FindFirstDescendant(c => c.ByAutomationId("device-status"))?.Properties.Name.ValueOrDefault;
                if (state is "未检测到手机" or "请选择目标手机" or "请解锁手机并允许 USB 调试") break;
                Thread.Sleep(100);
            }
            Assert.That(window, Is.Not.Null, "Installed window did not load");
            var status = window!.FindFirstDescendant(c => c.ByAutomationId("device-status")).Name;
            Assert.That(status, Is.AnyOf("未检测到手机", "请选择目标手机", "请解锁手机并允许 USB 调试"), "Real HDC discovery must finish without a tool error");
            Assert.That(window!.FindAllDescendants(c => c.ByControlType(ControlType.CheckBox)).Count(e => e.AutomationId.StartsWith("select-")), Is.EqualTo(20));
            Assert.That(window.FindFirstDescendant(c => c.ByAutomationId("execute")).IsEnabled, Is.False);
            window.FindFirstDescendant(c => c.ByAutomationId("clear-all")).Patterns.Invoke.Pattern.Invoke();
            deadline.Restart();
            while (deadline.Elapsed < TimeSpan.FromSeconds(10) && window.FindFirstDescendant(c => c.ByAutomationId("selection-count")).Name != "已选 0 项") Thread.Sleep(100);
            Assert.That(window.FindFirstDescendant(c => c.ByAutomationId("selection-count")).Name, Is.EqualTo("已选 0 项"));
            var screenshot = Path.Combine(Environment.GetEnvironmentVariable("CYH_PACKAGE_RESULTS")!, "installed-app.png");
            window.CaptureToFile(screenshot); TestContext.AddTestAttachment(screenshot);
            Assert.That(app.Close(false), Is.True, "Installed app did not close normally");
            VerifyDiscovery(Path.GetDirectoryName(executable!)!, status).GetAwaiter().GetResult();
        }
        finally
        {
            try
            {
                if (!app.HasExited && window != null)
                    TestContext.Progress.WriteLine("Device status: " + window.FindFirstDescendant(c => c.ByAutomationId("device-status"))?.Properties.Name.ValueOrDefault);
                string log = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cleanYourHarmony", "desktop.log");
                if (File.Exists(log))
                {
                    using var stream = new FileStream(log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                    using var reader = new StreamReader(stream);
                    var contents = reader.ReadToEnd();
                    TestContext.Progress.WriteLine(contents.Length > 8192 ? contents[^8192..] : contents);
                }
            }
            catch (Exception error) { TestContext.Progress.WriteLine("Diagnostics: " + error.Message); }
            finally { if (!app.HasExited) app.Kill(); }
        }
    }

    private static async Task VerifyDiscovery(string root, string displayed)
    {
        var data = Path.Combine(Path.GetTempPath(), "cyh-discovery-" + Guid.NewGuid());
        var client = new EngineClient();
        var ready = new TaskCompletionSource(); var exited = new TaskCompletionSource();
        client.Event += value => { if (value["event"]?.GetValue<string>() == "ready") ready.TrySetResult(); };
        client.Exited += () => exited.TrySetResult();
        try
        {
            client.Start(root, data); await ready.Task.WaitAsync(TimeSpan.FromSeconds(15));
            var reply = await client.Request("devices").WaitAsync(TimeSpan.FromSeconds(20));
            var devices = reply["result"]!.AsArray();
            TestContext.Progress.WriteLine("Real HDC enumeration: " + devices.ToJsonString());
            Assert.That(devices.Any(d => d!["status"]!.GetValue<string>() == "Connected"), Is.False, "CI must not use a connected phone");
            var expected = devices.Count == 0 ? "未检测到手机" : devices.Count > 1 ? "请选择目标手机" : "请解锁手机并允许 USB 调试";
            Assert.That(displayed, Is.EqualTo(expected), "Installed GUI must reflect the real bundled host's enumeration");
        }
        finally
        {
            if (client.Running) await client.Request("shutdown").WaitAsync(TimeSpan.FromSeconds(20));
            await exited.Task.WaitAsync(TimeSpan.FromSeconds(20));
            if (Directory.Exists(data)) Directory.Delete(data, true);
        }
    }
}
