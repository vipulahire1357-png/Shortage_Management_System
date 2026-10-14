@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title ABB Shortage Management System
set "PYTHON=%~dp0runtime\python.exe"
set "URL=http://127.0.0.1:8000"
set "LOGDIR=%~dp0logs"
set "PIDFILE=%~dp0backend.pid"

if not exist "%PYTHON%" (
  echo ERROR: Bundled Python runtime is missing.
  echo Extract the entire ZIP before running this file.
  pause
  exit /b 1
)

if not exist "%~dp0frontend\dist\index.html" (
  echo ERROR: Frontend build is missing.
  pause
  exit /b 1
)

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
  start "" "%URL%"
  echo The application is already running.
  echo The existing backend was not started by this launcher.
  pause
  exit /b 0
)

echo Starting ABB Shortage Management System...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\start_backend.ps1"
if errorlevel 1 (
  echo ERROR: Could not start the bundled backend.
  pause
  exit /b 1
)

set "WAIT=0"
:wait_loop
timeout /t 1 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 goto open_app
set /a WAIT+=1
if %WAIT% GEQ 30 goto startup_failed
goto wait_loop

:open_app
echo Application is ready. Opening %URL%
start "" "%URL%"
echo.
echo Keep this window open while using ABB Shortage Management System.
echo Press any key here when you want to close the application.
pause >nul
goto stop_backend

:startup_failed
echo.
echo ERROR: Backend did not become ready within 30 seconds.
echo Check the logs in: %LOGDIR%
goto stop_backend

:stop_backend
if exist "%PIDFILE%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$backendId = Get-Content -Raw '%PIDFILE%'; if ($backendId -match '^\d+$') { Stop-Process -Id ([int]$backendId) -Force -ErrorAction SilentlyContinue }"
  del "%PIDFILE%" >nul 2>&1
)
if "%WAIT%" GEQ "30" pause
exit /b 0
