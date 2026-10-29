$ErrorActionPreference = 'Stop'
$directory = Join-Path $PSScriptRoot 'driver'
$manifest = Get-Content (Join-Path $directory 'manifest.json') -Raw | ConvertFrom-Json
# Only repair matching connected devices that currently report a driver problem.
$devices = Get-PnpDevice -PresentOnly | Where-Object { $_.Status -ne 'OK' }
$needsDriver = $false
foreach ($device in $devices) {
    $ids = (Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue).Data
    if ($ids | Where-Object { $_ -in $manifest.hardwareIds }) { $needsDriver = $true }
}
if (!$needsDriver) { exit 0 }
if ([IO.Path]::GetFileName($manifest.inf) -ne $manifest.inf) { throw 'Invalid INF path.' }
foreach ($entry in $manifest.files.PSObject.Properties) {
    if ([IO.Path]::GetFileName($entry.Name) -ne $entry.Name -or (Get-FileHash (Join-Path $directory $entry.Name) -Algorithm SHA256).Hash.ToLower() -ne $entry.Value) { throw 'Driver checksum mismatch.' }
}
$catalogs = Get-ChildItem $directory -Filter *.cat
if (!$catalogs -or ($catalogs | Where-Object { (Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid' })) { throw 'Untrusted driver catalog.' }
$inf = Join-Path $directory $manifest.inf
$process = Start-Process -FilePath "$env:SystemRoot\System32\pnputil.exe" -ArgumentList @('/add-driver', "`"$inf`"", '/install') -Verb RunAs -Wait -PassThru
if ($process.ExitCode -ne 0 -and $process.ExitCode -ne 3010) { throw "Driver installation failed: $($process.ExitCode)" }
if ($process.ExitCode -eq 3010) { Write-Output 'Driver installation requires a restart.' }
