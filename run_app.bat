@echo off
setlocal enabledelayedexpansion

:: ─────────────────────────────────────────────────────────────────────
:: ABB Shortage Management System — One-Click Launcher
:: Double-click this file to start the application.
:: Requirements: Python virtual environment in .venv\  at the project root.
::               Frontend production build in frontend\dist\.
:: ─────────────────────────────────────────────────────────────────────

set "ROOT=%~dp0"
set "VENV=%ROOT%.venv"
set "PYTHON=%VENV%\Scripts\python.exe"
set "UVICORN=%VENV%\Scripts\uvicorn.exe"
set "DIST=%ROOT%frontend\dist"
set "PORT=8000"
set "APP_URL=http://127.0.0.1:%PORT%"
set "LOG=%ROOT%logs\app_launcher.log"

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   ABB Shortage Management System             ║
echo  ║   Starting application launcher…            ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: ── 1. Check Python virtual environment ─────────────────────────────
if not exist "%PYTHON%" (
    echo  [ERROR] Python virtual environment not found.
    echo          Expected: %PYTHON%
    echo.
    echo  To set up the environment, open a terminal in this folder and run:
    echo    python -m venv .venv
    echo    .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

:: ── 2. Check frontend production build ──────────────────────────────
if not exist "%DIST%\index.html" (
    echo  [ERROR] Frontend production build not found.
    echo          Expected: %DIST%\index.html
    echo.
    echo  To build the frontend (requires Node.js on this machine once):
    echo    cd frontend
    echo    npm install
    echo    npm run build
    echo.
    pause
    exit /b 1
)

:: ── 3. Ensure logs directory exists ─────────────────────────────────
if not exist "%ROOT%logs" mkdir "%ROOT%logs"

:: ── 4. Prevent duplicate backend process on port 8000 ───────────────
echo  Checking for existing process on port %PORT%…
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTEN"') do (
    set "EXISTING_PID=%%P"
)
if defined EXISTING_PID (
    echo  [INFO] Port %PORT% is already in use (PID: !EXISTING_PID!).
    echo         Checking if it is a previous ABB app instance…
    :: Only kill if the process was started from our own .venv python
    tasklist /fi "pid eq !EXISTING_PID!" 2>nul | findstr /i "python uvicorn" >nul
    if !errorlevel! == 0 (
        echo  [INFO] Stopping previous instance (PID: !EXISTING_PID!)…
        taskkill /pid !EXISTING_PID! /f >nul 2>&1
        timeout /t 2 /nobreak >nul
    ) else (
        echo  [WARN] Port %PORT% is occupied by a different application.
        echo         Please free port %PORT% and try again.
        pause
        exit /b 1
    )
)

:: ── 5. Start the FastAPI backend ─────────────────────────────────────
echo  Starting FastAPI backend on %APP_URL% …
start "ABB-Backend" /min cmd /c ^
    ""%PYTHON%" -m uvicorn backend.app.main:app --host 127.0.0.1 --port %PORT% >> "%LOG%" 2>&1"

:: ── 6. Wait until the API health endpoint responds ──────────────────
echo  Waiting for backend to be ready…
set "MAX_WAIT=30"
set "WAIT=0"
:wait_loop
timeout /t 1 /nobreak >nul
set /a WAIT+=1
curl -s -o nul -w "%%{http_code}" "%APP_URL%/api/health" 2>nul | findstr "200" >nul
if !errorlevel! == 0 goto :backend_ready
if !WAIT! GEQ %MAX_WAIT% (
    echo.
    echo  [ERROR] Backend did not become ready within %MAX_WAIT% seconds.
    echo          Check %LOG% for errors.
    pause
    exit /b 1
)
goto :wait_loop

:backend_ready
echo  [OK] Backend is ready.
echo.

:: ── 7. Open the application in the default browser ──────────────────
echo  Opening %APP_URL% in your default browser…
start "" "%APP_URL%"

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  ABB Shortage Management System is running  ║
echo  ║  URL : %APP_URL%                    ║
echo  ║  Log : logs\app_launcher.log               ║
echo  ║                                              ║
echo  ║  Close this window to stop the server.      ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Keep console open so closing it terminates the server window via its PID.
:: The user can close this window when done.
pause
echo  Stopping ABB backend…
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTEN"') do (
    taskkill /pid %%P /f >nul 2>&1
)
echo  Done. Goodbye.
endlocal
