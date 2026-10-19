@echo off
setlocal
cd /d "%~dp0"
title ABB Shortage and Vendor Management
set "PYTHON=%~dp0runtime\python.exe"
set "STARTER=%~dp0packaging\start_backend.ps1"
set "URL=http://127.0.0.1:8000"
set "PIDFILE=%~dp0backend.pid"
if not exist "%PYTHON%" (echo ERROR: Bundled Python runtime is missing.& pause & exit /b 1)
if not exist "%~dp0frontend\dist\index.html" (echo ERROR: Built frontend is missing.& pause & exit /b 1)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%STARTER%"
if errorlevel 1 (echo ERROR: Backend could not be started.& pause & exit /b 1)
echo Waiting for the application to become ready...
set /a ATTEMPTS=0
:wait_for_api
powershell.exe -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%URL%/api/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto ready
set /a ATTEMPTS+=1
if %ATTEMPTS% GEQ 30 goto startup_failed
timeout /t 1 /nobreak >nul
goto wait_for_api
:ready
start "" "%URL%"
echo.
echo ABB Shortage and Vendor Management is running.
echo Keep this window open while using the application.
echo Press any key here to stop the application.
pause >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-Content -LiteralPath '%PIDFILE%' -ErrorAction SilentlyContinue; if($p){ Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '%PIDFILE%' -Force -ErrorAction SilentlyContinue }"
exit /b 0
:startup_failed
echo ERROR: Application did not start. Check logs\portable-backend.log.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Get-Content -LiteralPath '%PIDFILE%' -ErrorAction SilentlyContinue; if($p){ Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '%PIDFILE%' -Force -ErrorAction SilentlyContinue }"
pause
exit /b 1
