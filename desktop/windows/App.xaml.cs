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
    protected override void OnLaunched(LaunchActivatedEventArgs args) { window = new MainWindow(); window.Activate(); }
}
