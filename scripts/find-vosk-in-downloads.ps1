# Locate vosk-model-small-es-0.42 in the user's Downloads folder (or other common
# locations) and stage it into backend\models\ so the dev server finds it without
# re-downloading.
#
# Exit codes:
#   0 — model staged or already present (no further action needed)
#   1 — not found anywhere; caller should fall back to a fresh download
#   2 — found candidate but copy/extract failed
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\find-vosk-in-downloads.ps1

$ErrorActionPreference = 'Stop'
$ModelName = 'vosk-model-small-es-0.42'
$RepoRoot  = Split-Path -Parent $PSScriptRoot
$DestRoot  = Join-Path $RepoRoot 'backend\models'
$TargetDir = Join-Path $DestRoot $ModelName
$Sentinel  = Join-Path $TargetDir 'conf\model.conf'

function Write-Info($msg) { Write-Host "[vosk-find] $msg" }

# 1. Already installed? — sentinel file present means a complete extraction.
if (Test-Path -LiteralPath $Sentinel) {
    Write-Info "model already present at $TargetDir"
    exit 0
}

# Search roots — Downloads first, then a few common spots.
$SearchRoots = @(
    [Environment]::GetFolderPath('UserProfile') + '\Downloads',
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('UserProfile')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

# 2. Look for an ALREADY-EXTRACTED folder named vosk-model-small-es-0.42 with the
#    sentinel inside. -Recurse -Depth 4 keeps the scan bounded.
foreach ($root in $SearchRoots) {
    Write-Info "scanning $root for extracted model..."
    $hit = Get-ChildItem -LiteralPath $root -Recurse -Depth 4 -Directory `
            -Filter $ModelName -ErrorAction SilentlyContinue |
           Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'conf\model.conf') } |
           Select-Object -First 1
    if ($hit) {
        Write-Info "found extracted model: $($hit.FullName)"
        if (-not (Test-Path -LiteralPath $DestRoot)) {
            New-Item -ItemType Directory -Path $DestRoot | Out-Null
        }
        try {
            if (Test-Path -LiteralPath $TargetDir) {
                Remove-Item -LiteralPath $TargetDir -Recurse -Force
            }
            Copy-Item -LiteralPath $hit.FullName -Destination $TargetDir -Recurse -Force
            Write-Info "copied to $TargetDir"
            exit 0
        } catch {
            Write-Warning "copy failed: $($_.Exception.Message)"
            exit 2
        }
    }
}

# 3. Look for a ZIP. The official archive is "<ModelName>.zip" but browsers may
#    rename to "<ModelName> (1).zip" etc. — match $ModelName*.zip.
foreach ($root in $SearchRoots) {
    Write-Info "scanning $root for ${ModelName}*.zip..."
    $zip = Get-ChildItem -LiteralPath $root -Recurse -Depth 4 -File `
            -Filter "$ModelName*.zip" -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending |
           Select-Object -First 1
    if ($zip) {
        Write-Info "found zip: $($zip.FullName)"
        if (-not (Test-Path -LiteralPath $DestRoot)) {
            New-Item -ItemType Directory -Path $DestRoot | Out-Null
        }
        try {
            # Expand-Archive places "<ModelName>" folder inside $DestRoot, which is
            # exactly what we want — same shape the npm setup script produces.
            Expand-Archive -LiteralPath $zip.FullName -DestinationPath $DestRoot -Force
            if (Test-Path -LiteralPath $Sentinel) {
                Write-Info "extracted to $TargetDir"
                exit 0
            } else {
                Write-Warning "extraction did not produce expected layout at $TargetDir"
                exit 2
            }
        } catch {
            Write-Warning "extract failed: $($_.Exception.Message)"
            exit 2
        }
    }
}

Write-Info "no local copy found in Downloads / Desktop / UserProfile"
exit 1
