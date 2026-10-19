$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "runtime\python.exe"
$logDirectory = Join-Path $root "logs"
$pidFile = Join-Path $root "backend.pid"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Bundled Python was not found at $python"
}

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$process = Start-Process -FilePath $python `
    -ArgumentList @("-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000") `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory "portable-backend.log") `
    -RedirectStandardError (Join-Path $logDirectory "portable-backend-error.log")

Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
