$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$portableRoot = Join-Path $repositoryRoot "portable_windows"
$portablePackage = Join-Path $portableRoot "ABB_Shortage_System"
$portableLauncher = Join-Path $portablePackage "run_app.bat"
$archivePath = Join-Path $env:TEMP "ABB_Shortage_System_Portable_Windows.zip"
$downloadUrl = "https://github.com/vipulahire1357-png/Shortage_Management_System/releases/latest/download/ABB_Shortage_System_Portable_Windows.zip"

if (-not (Test-Path -LiteralPath $portableLauncher)) {
    Write-Host "Downloading the portable Windows runtime from the latest GitHub release..."
    New-Item -ItemType Directory -Force -Path $portableRoot | Out-Null
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $archivePath
        Expand-Archive -LiteralPath $archivePath -DestinationPath $portableRoot -Force
    }
    finally {
        Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path -LiteralPath $portableLauncher)) {
    throw "The downloaded release did not contain ABB_Shortage_System\run_app.bat."
}

Write-Host "Starting ABB Shortage and Vendor Management..."
Push-Location $portablePackage
try {
    & $portableLauncher
    if ($LASTEXITCODE -ne 0) {
        throw "The portable application launcher exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
