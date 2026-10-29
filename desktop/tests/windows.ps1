param([string]$Results = (Join-Path $env:TEMP 'cyh-windows-test-results'))
$ErrorActionPreference = 'Stop'
$started = Get-Date
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$work = Join-Path $env:TEMP ('cyh 测试 ' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $work, $Results | Out-Null
Remove-Item (Join-Path $Results 'desktop.trx'), (Join-Path $Results 'protocol.trx'), (Join-Path $Results 'ui.trx') -ErrorAction SilentlyContinue
function Check-Exit([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE" } }
Push-Location $root
try {
    $env:CYH_UI_DIAGNOSTICS = $Results
    $smoke = Join-Path $work 'desktop-preflight'
    New-Item -ItemType Directory -Force $smoke | Out-Null
    Copy-Item desktop/windows/CleanYourHarmony.csproj, desktop/windows/App.xaml, desktop/windows/app.manifest $smoke
    Copy-Item desktop/tests/WinUiSmokeApp.cs (Join-Path $smoke 'App.xaml.cs')
    & dotnet publish (Join-Path $smoke 'CleanYourHarmony.csproj') -c Release -r win-x64 -p:Platform=x64 --self-contained true -o (Join-Path $smoke 'published') 2>&1 | Tee-Object (Join-Path $Results 'desktop-build.log')
    Check-Exit 'Independent WinUI window build'
    $env:CYH_GUI_SMOKE_APP = Join-Path $smoke 'published/CleanYourHarmony.exe'
    & dotnet test desktop/windows.tests/Desktop.Tests.csproj --filter FullyQualifiedName~DesktopEnvironmentTests --logger 'trx;LogFileName=desktop.trx' --results-directory $Results 2>&1 | Tee-Object (Join-Path $Results 'desktop.log')
    Check-Exit 'Native GUI environment preflight'
    & node --test scripts/runner.test.mjs scripts/desktop.test.mjs 2>&1 | Tee-Object (Join-Path $Results 'engine.log')
    Check-Exit 'Engine tests'
    & dotnet publish desktop/windows/CleanYourHarmony.csproj -c Release -r win-x64 -p:Platform=x64 --self-contained true -o (Join-Path $work 'app') 2>&1 | Tee-Object (Join-Path $Results 'build.log')
    Check-Exit 'Native app build'
    $app = Join-Path $work 'app'
    $runtime = Join-Path $app 'runtime'
    $engine = Join-Path $app 'engine'
    New-Item -ItemType Directory -Force $runtime, (Join-Path $engine 'scripts') | Out-Null
    Copy-Item (Get-Command node).Source (Join-Path $runtime 'node.exe')
    # Only a file-presence placeholder for the UI fixture; never used as HDC.
    Copy-Item (Get-Command node).Source (Join-Path $runtime 'hdc.exe')
    Copy-Item scripts/*.mjs (Join-Path $engine 'scripts')
    Copy-Item operations.json $engine
    $env:CYH_PROTOCOL_APP = $app
    & dotnet test desktop/windows.tests/Desktop.Tests.csproj --filter FullyQualifiedName~ProtocolTests --logger 'trx;LogFileName=protocol.trx' --results-directory $Results 2>&1 | Tee-Object (Join-Path $Results 'protocol.log')
    Check-Exit 'Real host protocol tests'
    Copy-Item desktop/tests/ui-host-fixture.mjs (Join-Path $engine 'scripts/desktop-host.mjs') -Force
    $env:CYH_UI_APP = Join-Path $app 'CleanYourHarmony.exe'
    $env:CYH_UI_APP | Set-Content (Join-Path $Results 'test-app.txt')
    & dotnet test desktop/windows.tests/Desktop.Tests.csproj --filter FullyQualifiedName~UiTests --logger 'trx;LogFileName=ui.trx' --results-directory $Results 2>&1 | Tee-Object (Join-Path $Results 'ui.log')
    Check-Exit 'Native UI automation'
} finally {
    foreach ($name in @('app-crash.log', 'desktop.log')) {
        $log = Join-Path $env:LOCALAPPDATA "cleanYourHarmony/$name"
        if (Test-Path $log) { Copy-Item $log (Join-Path $Results "app-$name") }
    }
    Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=$started} -ErrorAction SilentlyContinue |
        Where-Object { $_.ProviderName -in @('.NET Runtime', 'Application Error', 'Windows Error Reporting') } |
        Format-List TimeCreated, ProviderName, Id, Message | Out-File (Join-Path $Results 'application-events.log')
    Pop-Location
    Remove-Item Env:CYH_UI_APP, Env:CYH_PROTOCOL_APP, Env:CYH_UI_DIAGNOSTICS, Env:CYH_GUI_SMOKE_APP -ErrorAction SilentlyContinue
    # Keep failed test binaries for diagnosis; temporary and outside the repo.
    Write-Output "Test workspace: $work"
    Write-Output "Test results: $Results"
}
