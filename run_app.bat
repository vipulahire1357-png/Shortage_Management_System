@echo off
setlocal
cd /d "%~dp0"
title ABB Shortage and Vendor Management - Project Checkout
set "PYTHON=%~dp0.venv\Scripts\python.exe"
set "URL=http://127.0.0.1:8000"
set "PIDFILE=%~dp0backend.pid"
if not exist "%PYTHON%" (
  echo ERROR: This project checkout needs its own .venv. See README.md.
  pause
  exit /b 1
)
if not exist "%~dp0backend\app\main.py" (echo ERROR: Backend is missing from this project folder.& pause & exit /b 1)
if not exist "%~dp0frontend\dist\index.html" (echo ERROR: Built frontend is missing. Run npm run build in frontend.& pause & exit /b 1)
if not exist "%~dp0logs" mkdir "%~dp0logs"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root=[IO.Path]::GetFullPath('%~dp0'); $python=Join-Path $root '.venv\Scripts\python.exe'; $logs=Join-Path $root 'logs'; $proc=Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','backend.app.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'root-backend.log') -RedirectStandardError (Join-Path $logs 'root-backend-error.log'); Set-Content -LiteralPath (Join-Path $root 'backend.pid') -Value $proc.Id -Encoding ascii"
if errorlevel 1 (echo ERROR: Could not start the backend for this project folder.& pause & exit /b 1)
echo Waiting for this project's backend to become ready...
set /a ATTEMPTS=0
:wait_for_api
powershell.exe -NoProfile -Command "$expected=[IO.Path]::GetFullPath('%~dp0').TrimEnd([char]'\'); try {$h=Invoke-RestMethod -Uri '%URL%/api/health' -TimeoutSec 2; if ([IO.Path]::GetFullPath($h.project_root).TrimEnd([char]'\') -ieq $expected) {exit 0}} catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto ready
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 30 goto startup_failed
timeout /t 1 /nobreak >nul
goto wait_for_api
:ready
start "" "%URL%"
echo.
echo ABB Shortage and Vendor Management from this project folder is running.
echo Keep this window open while using the application.
echo Press a key here to stop this project's backend.
pause >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-Content -LiteralPath '%PIDFILE%' -ErrorAction SilentlyContinue; if($p){ Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '%PIDFILE%' -Force -ErrorAction SilentlyContinue }"
exit /b 0
:startup_failed
echo ERROR: This project's backend did not start. Check logs\root-backend-error.log.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-Content -LiteralPath '%PIDFILE%' -ErrorAction SilentlyContinue; if($p){ Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '%PIDFILE%' -Force -ErrorAction SilentlyContinue }"
pause
exit /b 1
