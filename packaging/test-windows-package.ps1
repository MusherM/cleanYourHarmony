param([string]$Results = (Join-Path $env:TEMP 'cyh-package-results'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Results | Out-Null
$install = Join-Path $env:TEMP ('cyh 安装验证 ' + [guid]::NewGuid())
$installer = (Resolve-Path 'dist/windows-x64/cleanYourHarmony-Setup.exe').Path
$result = Start-Process $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$install`"","/LOG=`"$Results/install.log`"") -PassThru
if (!$result.WaitForExit(120000)) { $result.Kill($true); throw 'Installation timed out' }
if ($result.ExitCode -ne 0 -or !(Test-Path "$install/CleanYourHarmony.exe")) { throw 'Installer failed' }
try {
    & node packaging/verify-package.mjs $install 2>&1 | Tee-Object "$Results/runtime.log"
    if ($LASTEXITCODE -ne 0) { throw 'Installed runtime verification failed' }
    $env:CYH_INSTALLED_APP = "$install/CleanYourHarmony.exe"
    $env:CYH_PACKAGE_RESULTS = $Results
    & dotnet test desktop/windows.tests/Desktop.Tests.csproj --filter FullyQualifiedName~InstalledPackageTests --logger 'trx;LogFileName=installed.trx' --results-directory $Results 2>&1 | Tee-Object "$Results/installed-ui.log"
    if ($LASTEXITCODE -ne 0) { throw 'Installed app GUI test failed' }
} finally {
    $diagnostic = Start-Process "$install/runtime/hdc.exe" -ArgumentList 'list','targets','-v' -PassThru -NoNewWindow -RedirectStandardOutput "$Results/hdc-discovery.log" -RedirectStandardError "$Results/hdc-discovery-error.log"
    if (!$diagnostic.WaitForExit(15000)) { $diagnostic.Kill(); Write-Output 'HDC diagnostic timed out after 15 seconds' }
    Get-Content "$Results/hdc-discovery.log", "$Results/hdc-discovery-error.log"
    Remove-Item Env:CYH_INSTALLED_APP, Env:CYH_PACKAGE_RESULTS -ErrorAction SilentlyContinue
    # This server belongs to the isolated CI installation, never a user's SDK.
    $stop = Start-Process "$install/runtime/hdc.exe" -ArgumentList 'kill' -PassThru -NoNewWindow
    if (!$stop.WaitForExit(15000)) { $stop.Kill(); throw 'HDC cleanup timed out' }
    $result = Start-Process "$install/unins000.exe" -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -PassThru
    if (!$result.WaitForExit(60000)) { $result.Kill($true); throw 'Uninstall timed out' }
    if ($result.ExitCode -ne 0 -or (Test-Path "$install/CleanYourHarmony.exe")) { throw 'Uninstall verification failed' }
}
Write-Output 'PASS: install, bundled runtime, real GUI, graceful close and uninstall'
