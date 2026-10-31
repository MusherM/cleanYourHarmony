param([switch]$Release, [switch]$Distributable, [string]$CertificateThumbprint, [string]$TimestampUrl = 'http://timestamp.digicert.com', [string]$DriverDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root 'build/runtime/win32-x64'
$manifest = Get-Content (Join-Path $runtime 'manifest.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files.PSObject.Properties) {
    if ((Get-FileHash (Join-Path $runtime $entry.Name) -Algorithm SHA256).Hash.ToLower() -ne $entry.Value) { throw "Runtime checksum mismatch: $($entry.Name)" }
}
if ($Release -and (!$manifest.redistributionReviewed -or !$CertificateThumbprint)) { throw 'Release requires reviewed tool provenance and a signing certificate thumbprint.' }
if ($Distributable -and !$manifest.redistributionReviewed) { throw 'Distribution requires verified tool provenance and licenses.' }
$destination = Join-Path $root 'dist/windows-x64'
New-Item -ItemType Directory -Force $destination | Out-Null
# Avoid stale publish files being included in a later installer.
$app = Join-Path $destination 'app'
if (Test-Path $app) { Remove-Item -Recurse -Force $app }
& dotnet publish (Join-Path $root 'desktop/windows/CleanYourHarmony.csproj') -c Release -r win-x64 -p:Platform=x64 --self-contained true -o $app
if ($LASTEXITCODE -ne 0) { throw 'Windows application build failed.' }
Copy-Item -Recurse $runtime (Join-Path $app 'runtime')
$engine = Join-Path $app 'engine'
& node (Join-Path $PSScriptRoot 'engine.mjs') $engine
if ($LASTEXITCODE -ne 0) { throw 'Shared engine packaging failed.' }
if ($DriverDirectory) {
    $driverManifest = Get-Content (Join-Path $DriverDirectory 'manifest.json') -Raw | ConvertFrom-Json
    if (!$driverManifest.redistributionReviewed -or !$driverManifest.hardwareIds -or !$driverManifest.inf) { throw 'Driver manifest requires redistribution review, hardware IDs and INF name.' }
    foreach ($entry in $driverManifest.files.PSObject.Properties) {
        if ([IO.Path]::GetFileName($entry.Name) -ne $entry.Name) { throw 'Invalid driver manifest path.' }
        if ((Get-FileHash (Join-Path $DriverDirectory $entry.Name) -Algorithm SHA256).Hash.ToLower() -ne $entry.Value) { throw 'Driver checksum mismatch.' }
    }
    $catalogs = Get-ChildItem $DriverDirectory -Filter *.cat
    if (!$catalogs -or ($catalogs | Where-Object { (Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid' })) { throw 'Driver catalogs must have valid trusted signatures.' }
    Copy-Item -Recurse $DriverDirectory (Join-Path $app 'driver')
    Copy-Item (Join-Path $PSScriptRoot 'install-driver.ps1') $app
}
if ($Release) {
    foreach ($file in @((Join-Path $app 'CleanYourHarmony.exe'))) {
        & signtool sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $file
        if ($LASTEXITCODE -ne 0) { throw 'App signing failed.' }
    }
}
& ISCC.exe "/DSourceDir=$app" "/DOutputDir=$destination" (Join-Path $PSScriptRoot 'windows-installer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed (Inno Setup 6 is required on build host).' }
if ($Release) {
    $installer = Join-Path $destination 'cleanYourHarmony-Setup.exe'
    & signtool sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $installer
    if ($LASTEXITCODE -ne 0) { throw 'Installer signing failed.' }
    & signtool verify /pa $installer
    if ($LASTEXITCODE -ne 0) { throw 'Installer signature verification failed.' }
}
Write-Output "Installer: $destination/cleanYourHarmony-Setup.exe"
