using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
namespace CleanYourHarmony;

internal sealed class EngineClient
{
    private Process? process;
    private readonly SemaphoreSlim writeLock = new(1, 1);
    private readonly Dictionary<string, TaskCompletionSource<JsonObject>> pending = new();
    public event Action<JsonObject>? Event;
    public event Action? Exited;
    public bool Running => process is { HasExited: false };
    public string DataRoot { get; private set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cleanYourHarmony");
    public void Start(string? applicationRoot = null, string? dataRoot = null)
    {
        string root = applicationRoot ?? AppContext.BaseDirectory;
        if (dataRoot != null) DataRoot = dataRoot;
        string node = Path.Combine(root, "runtime", "node.exe"), hdc = Path.Combine(root, "runtime", "hdc.exe");
        string host = Path.Combine(root, "engine", "scripts", "desktop-host.mjs");
        if (new[] { node, hdc, host }.Any(p => !File.Exists(p))) throw new InvalidOperationException("应用工具包不完整，请重新安装完整应用。");
        Directory.CreateDirectory(DataRoot);
        var info = new ProcessStartInfo(node) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8, WorkingDirectory = root };
        info.Environment.Remove("NODE_OPTIONS"); info.Environment.Remove("NODE_PATH");
        foreach (string value in new[] { host, "--hdc", hdc, "--data-dir", DataRoot }) info.ArgumentList.Add(value);
        process = new Process { StartInfo = info };
        process.Start();
        var errors = ReadErrors(process);
        _ = ReadOutput(process, errors);
    }
    private async Task ReadOutput(Process child, Task errors)
    {
        try
        {
            while (await child.StandardOutput.ReadLineAsync() is { } line)
            {
                if (JsonNode.Parse(line) is not JsonObject message) continue;
                if (message["id"]?.GetValue<string>() is { } id)
                {
                    TaskCompletionSource<JsonObject>? completion;
                    lock (pending) { pending.Remove(id, out completion); }
                    completion?.TrySetResult(message);
                }
                else Event?.Invoke(message);
            }
        }
        catch (Exception e) { Event?.Invoke(new JsonObject { ["event"] = "transportError", ["error"] = e.Message }); }
        finally
        {
            lock (pending) { foreach (var completion in pending.Values) completion.TrySetException(new IOException("执行器连接已断开")); pending.Clear(); }
            await Task.WhenAll(child.WaitForExitAsync(), errors);
            Exited?.Invoke();
        }
    }
    private async Task ReadErrors(Process child)
    {
        try { await using var log = new StreamWriter(Path.Combine(DataRoot, "desktop.log"), true, Encoding.UTF8); while (await child.StandardError.ReadLineAsync() is { } line) { await log.WriteLineAsync(line); await log.FlushAsync(); } }
        catch (IOException) { /* stdout still carries structured business results. */ }
    }
    public async Task<JsonObject> Request(string method, JsonObject? parameters = null)
    {
        if (!Running) throw new InvalidOperationException("执行器未连接");
        string id = Guid.NewGuid().ToString();
        var completion = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (pending) pending.Add(id, completion);
        try
        {
            await writeLock.WaitAsync();
            try { await process!.StandardInput.WriteLineAsync(new JsonObject { ["id"] = id, ["method"] = method, ["params"] = parameters ?? new() }.ToJsonString()); await process.StandardInput.FlushAsync(); }
            finally { writeLock.Release(); }
        }
        catch { lock (pending) pending.Remove(id); throw; }
        var reply = await completion.Task;
        if (reply["error"]?.GetValue<string>() is { } error) throw new InvalidOperationException(error);
        return reply;
    }
}
