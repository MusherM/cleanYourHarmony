param([Parameter(Mandatory=$true)][string]$Results)
$ErrorActionPreference = 'Stop'
$diagnostics = Get-ChildItem $Results -File | Where-Object { $_.Extension -in @('.txt', '.log') }
if (!($diagnostics | Select-String -Pattern 'C000027B' -Quiet)) { exit 0 }
$cdb = "${env:ProgramFiles(x86)}/Windows Kits/10/Debuggers/x64/cdb.exe"
if (!(Test-Path $cdb)) {
    $installer = Join-Path $env:TEMP 'cyh-debuggers-setup.exe'
    Invoke-WebRequest 'https://go.microsoft.com/fwlink/?linkid=2382321' -OutFile $installer
    $signature = Get-AuthenticodeSignature $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'Invalid Microsoft SDK installer signature' }
    $setup = Start-Process $installer -ArgumentList '/features OptionId.WindowsDesktopDebuggers /quiet /norestart' -Wait -PassThru
    if ($setup.ExitCode -notin @(0, 3010) -or !(Test-Path $cdb)) { throw "Debugger installation failed: $($setup.ExitCode)" }
}
$app = (Get-Content (Join-Path $Results 'test-app.txt') -Raw).Trim()
$env:CYH_UI_DIAGNOSTICS = $Results
$commands = Join-Path $Results 'debugger-commands.txt'
'sxe -c ".exr -1; !analyze -v; k; q" 0xc000027b; g' | Set-Content $commands
$symbols = "srv*$(Join-Path $env:TEMP 'cyh-symbols')*https://msdl.microsoft.com/download/symbols"
$debugger = Start-Process $cdb -ArgumentList @('-G', '-y', "`"$symbols`"", '-cf', "`"$commands`"", "`"$app`"") -PassThru -RedirectStandardOutput (Join-Path $Results 'native-debug.log') -RedirectStandardError (Join-Path $Results 'native-debug-stderr.log')
if (!$debugger.WaitForExit(180000)) { Stop-Process -Id $debugger.Id -Force; throw 'Native crash diagnosis timed out; inspect the partial debugger log' }
