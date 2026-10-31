using System.Text.Json.Nodes;
using NUnit.Framework;

namespace CleanYourHarmony.Tests;

[TestFixture, NonParallelizable]
public sealed class ProtocolTests
{
    [Test] public async Task RealNodeHostSupportsConcurrentRequestsUtf8ErrorsAndGracefulShutdown()
    {
        var root = Environment.GetEnvironmentVariable("CYH_PROTOCOL_APP");
        Assert.That(root, Is.Not.Null.And.Not.Empty, "Run desktop/tests/windows.ps1 first");
        string data = Path.Combine(Path.GetTempPath(), "cyh 协议 " + Guid.NewGuid());
        var client = new EngineClient();
        var ready = new TaskCompletionSource();
        var exited = new TaskCompletionSource();
        client.Event += value => { if (value["event"]?.GetValue<string>() == "ready") ready.TrySetResult(); };
        client.Exited += () => exited.TrySetResult();
        try
        {
            client.Start(root, data);
            await ready.Task.WaitAsync(TimeSpan.FromSeconds(15));
            var replies = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => client.Request("catalog"))).WaitAsync(TimeSpan.FromSeconds(15));
            foreach (var reply in replies)
            {
                Assert.That(reply["result"]!["operations"]!.AsArray().Count, Is.EqualTo(22));
                Assert.That(reply["result"]!["categories"]![0]!["name"]!.GetValue<string>(), Is.EqualTo("浏览器"));
            }
            Assert.ThrowsAsync<InvalidOperationException>(async () => await client.Request("plan", new JsonObject { ["selection"] = new JsonArray() }).WaitAsync(TimeSpan.FromSeconds(10)));
            Assert.ThrowsAsync<InvalidOperationException>(async () => await client.Request("unsupported-method").WaitAsync(TimeSpan.FromSeconds(10)));
            Assert.That(client.Running, Is.True);
            await client.Request("shutdown").WaitAsync(TimeSpan.FromSeconds(10));
            await exited.Task.WaitAsync(TimeSpan.FromSeconds(10));
            for (int attempt = 0; attempt < 100 && client.Running; attempt++) await Task.Delay(50);
            Assert.That(client.Running, Is.False, "Host closed stdout but did not exit");
        }
        finally
        {
            if (client.Running) await client.Request("shutdown").WaitAsync(TimeSpan.FromSeconds(10));
            if (Directory.Exists(data)) Directory.Delete(data, true);
        }
    }
}
