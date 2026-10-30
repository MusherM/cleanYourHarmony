[Setup]
AppId=app.cleanyourharmony.desktop
AppName=cleanYourHarmony
AppVersion=1.1.0
DefaultDirName={localappdata}\Programs\cleanYourHarmony
DefaultGroupName=cleanYourHarmony
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
OutputDir={#OutputDir}
OutputBaseFilename=cleanYourHarmony-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\CleanYourHarmony.exe
CloseApplications=yes
[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\cleanYourHarmony"; Filename: "{app}\CleanYourHarmony.exe"
[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-driver.ps1"""; Flags: waituntilterminated; Check: FileExists(ExpandConstant('{app}\install-driver.ps1'))
Filename: "{app}\CleanYourHarmony.exe"; Description: "启动 cleanYourHarmony"; Flags: nowait postinstall skipifsilent
