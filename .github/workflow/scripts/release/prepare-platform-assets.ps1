param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("win_x64")]
  [string]$ReleaseTarget,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseAssetsDir,
  [Parameter(Mandatory = $true)]
  [string]$ToolsPackDir,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseNamespace,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseVersion,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseAssetSuffix,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseChannel,
  [Parameter(Mandatory = $true)]
  [string]$ReleasePublicOrigin,
  [string]$ReleaseVersionPrefix = "",
  [string]$ReleaseNotes = "",
  [bool]$IncludeZip = $true
)

$ErrorActionPreference = "Stop"

if ($ReleaseTarget -ne "win_x64") {
  throw "prepare-platform-assets.ps1 only supports win_x64"
}

New-Item -ItemType Directory -Force -Path $ReleaseAssetsDir | Out-Null

$builderDir = Join-Path $ToolsPackDir "out\win\namespaces\$ReleaseNamespace\builder"
$sourceInstaller = Join-Path $builderDir "Open Design-$ReleaseNamespace-setup.exe"
$sourceZip = Join-Path $builderDir "Open Design-$ReleaseNamespace-portable.zip"
if (-not (Test-Path -LiteralPath $sourceInstaller)) {
  throw "expected installer not found at $sourceInstaller"
}
if ($IncludeZip -and -not (Test-Path -LiteralPath $sourceZip)) {
  throw "expected portable zip not found at $sourceZip"
}

$versionedInstaller = "open-design-$ReleaseVersion$ReleaseAssetSuffix-win-x64-setup.exe"
$versionedZip = "open-design-$ReleaseVersion$ReleaseAssetSuffix-win-x64-portable.zip"
$installerPath = Join-Path $ReleaseAssetsDir $versionedInstaller
Copy-Item -LiteralPath $sourceInstaller -Destination $installerPath -Force
$installerHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$installerHash  $versionedInstaller" | Set-Content -Path "$installerPath.sha256" -Encoding utf8

if ($IncludeZip) {
  $zipPath = Join-Path $ReleaseAssetsDir $versionedZip
  Copy-Item -LiteralPath $sourceZip -Destination $zipPath -Force
  $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  "$zipHash  $versionedZip" | Set-Content -Path "$zipPath.sha256" -Encoding utf8
}

$installerBytes = [System.IO.File]::ReadAllBytes($installerPath)
$installerSha512 = [System.Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash($installerBytes))
$installerSize = (Get-Item -LiteralPath $installerPath).Length
$publicOrigin = $ReleasePublicOrigin.TrimEnd("/")
$versionPrefix = if ([string]::IsNullOrWhiteSpace($ReleaseVersionPrefix)) {
  "$ReleaseChannel/versions/$ReleaseVersion$ReleaseAssetSuffix"
} else {
  $ReleaseVersionPrefix
}
$installerUrl = "$publicOrigin/$versionPrefix/$versionedInstaller"
$releaseDate = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$notes = if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) {
  "Open Design $ReleaseVersion$ReleaseAssetSuffix"
} else {
  $ReleaseNotes
}

@(
  "version: `"$ReleaseVersion`""
  "files:"
  "  - url: `"$installerUrl`""
  "    sha512: `"$installerSha512`""
  "    size: $installerSize"
  "path: `"$installerUrl`""
  "sha512: `"$installerSha512`""
  "releaseDate: `"$releaseDate`""
  "releaseNotes: `"$notes`""
) | Set-Content -Path (Join-Path $ReleaseAssetsDir "latest.yml") -Encoding utf8

