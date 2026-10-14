$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "runtime\python.exe"
$logs = Join-Path $root "logs"

if (-not (Test-Path $python)) {
    throw "Bundled Python was not found: $python"
}

New-Item -ItemType Directory -Force -Path $logs | Out-Null
$process = Start-Process -FilePath $python -ArgumentList @("-m","uvicorn","backend.app.main:app","--host","127.0.0.1","--port","8000") -WorkingDirectory $root -PassThru -RedirectStandardOutput (Join-Path $logs "portable_backend.log") -RedirectStandardError (Join-Path $logs "portable_backend_error.log")
Set-Content -Path (Join-Path $root "backend.pid") -Value $process.Id -Encoding ASCII
Write-Output "Started ABB backend with PID $($process.Id)"
