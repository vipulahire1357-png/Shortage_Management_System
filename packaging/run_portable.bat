@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title ABB Shortage Management System
set "PYTHON=%~dp0runtime\python.exe"
set "URL=http://127.0.0.1:8000"
set "LOGDIR=%~dp0logs"
set "LOG=%LOGDIR%\portable_backend.log"

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

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$u='%URL%'; try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $u'/api/health'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  start "" "%URL%"
  echo The application is already running.
  echo Close the existing backend process when finished.
  pause
  exit /b 0
)

echo Starting ABB Shortage Management System...
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath '%PYTHON%' -ArgumentList @('-m','uvicorn','backend.app.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory '%~dp0' -WindowStyle Hidden -RedirectStandardOutput '%LOG%' -RedirectStandardError '%LOGDIR%\portable_backend_error.log' -PassThru; $p.Id"') do set "BACKEND_PID=%%P"

if not defined BACKEND_PID (
  echo ERROR: Could not start the bundled backend.
  echo Check logs in: %LOGDIR%
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Process -Id %BACKEND_PID% -Force -ErrorAction SilentlyContinue"
echo Application stopped.
exit /b 0

:startup_failed
echo.
echo ERROR: Backend did not become ready within 30 seconds.
echo Backend log: %LOG%
echo Backend error log: %LOGDIR%\portable_backend_error.log
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Process -Id %BACKEND_PID% -Force -ErrorAction SilentlyContinue"
pause
exit /b 1
