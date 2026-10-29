param([string]$Results = (Join-Path $env:TEMP 'cyh-windows-test-results'))
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$work = Join-Path $env:TEMP ('cyh 测试 ' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $work, $Results | Out-Null
Remove-Item (Join-Path $Results 'protocol.trx'), (Join-Path $Results 'ui.trx') -ErrorAction SilentlyContinue
function Check-Exit([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE" } }
Push-Location $root
try {
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
    $env:CYH_UI_DIAGNOSTICS = $Results
    & dotnet test desktop/windows.tests/Desktop.Tests.csproj --filter FullyQualifiedName~UiTests --logger 'trx;LogFileName=ui.trx' --results-directory $Results 2>&1 | Tee-Object (Join-Path $Results 'ui.log')
    Check-Exit 'Native UI automation'
} finally {
    Pop-Location
    Remove-Item Env:CYH_UI_APP, Env:CYH_PROTOCOL_APP, Env:CYH_UI_DIAGNOSTICS -ErrorAction SilentlyContinue
    # Keep failed test binaries for diagnosis; temporary and outside the repo.
    Write-Output "Test workspace: $work"
    Write-Output "Test results: $Results"
}
