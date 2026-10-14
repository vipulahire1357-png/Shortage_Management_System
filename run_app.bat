@echo off
setlocal
cd /d "%~dp0"

title ABB Shortage Management System

set "PYTHON=%~dp0.venv\Scripts\python.exe"
set "DIST=%~dp0frontend\dist"
set "PORT=8000"
set "URL=http://127.0.0.1:8000"
set "LOGDIR=%~dp0logs"
set "LOG=%~dp0logs\app_launcher.log"

echo.
echo ============================================
echo    ABB Shortage Management System
echo    Starting application...
echo ============================================
echo.

if not exist "%PYTHON%" goto no_python
if not exist "%DIST%\index.html" goto no_frontend

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo Checking whether the application is already running...
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if not errorlevel 1 goto open_app

echo Starting FastAPI backend...
start "ABB Backend" /min cmd.exe /d /c ""%PYTHON%" -m uvicorn backend.app.main:app --host 127.0.0.1 --port %PORT% >> "%LOG%" 2>&1"

set "WAIT=0"
:wait_loop
timeout /t 1 /nobreak >nul

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if not errorlevel 1 goto open_app

set /a WAIT+=1
if %WAIT% GEQ 40 goto startup_failed
goto wait_loop

:open_app
echo.
echo Application is ready.
echo Opening browser: %URL%
start "" "%URL%"
echo.
echo Keep the backend running while using the application.
echo Close this launcher window when finished.
echo Backend log: %LOG%
echo.
pause
goto end

:no_python
echo ERROR: Python virtual environment not found.
echo Expected: %PYTHON%
echo Create the environment and install project dependencies first.
pause
goto end

:no_frontend
echo ERROR: Production frontend build not found.
echo Expected: %DIST%\index.html
echo Build the React frontend on the development machine first.
pause
goto end

:startup_failed
echo.
echo ERROR: Backend did not become ready within 40 seconds.
echo Check the backend log:
echo %LOG%
echo.
type "%LOG%"
pause
goto end

:end
endlocal
