using Microsoft.UI.Xaml;
namespace CleanYourHarmony;
public partial class App : Application
{
    private MainWindow? window;
    public App()
    {
        UnhandledException += (_, e) =>
        {
            try
            {
                string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cleanYourHarmony");
                Directory.CreateDirectory(directory);
                File.WriteAllText(Path.Combine(directory, "app-crash.log"), $"{DateTimeOffset.UtcNow:O}\n{e.Exception}");
            }
            catch (IOException) { }
        };
        InitializeComponent();
    }
    internal static void StartupTrace(string message)
    {
        string? directory = Environment.GetEnvironmentVariable("CYH_UI_DIAGNOSTICS");
        if (string.IsNullOrEmpty(directory)) return;
        Directory.CreateDirectory(directory);
        File.AppendAllText(Path.Combine(directory, "startup.log"), $"{DateTimeOffset.UtcNow:O} {message}\n");
    }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            StartupTrace("Constructing MainWindow");
            window = new MainWindow();
            StartupTrace("Activating MainWindow");
            window.Activate();
            StartupTrace("MainWindow activated");
        }
        catch (Exception e) { StartupTrace(e.ToString()); throw; }
    }
}
