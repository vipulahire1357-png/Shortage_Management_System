@echo off
setlocal
cd /d "%~dp0"
title ABB Shortage and Vendor Management - Portable Project
if not exist "%~dp0backend\app\main.py" (
  echo ERROR: Backend is missing from this portable project folder.
  pause
  exit /b 1
)
if not exist "%~dp0backend\launcher.py" (
  echo ERROR: Dynamic port launcher is missing from this portable project folder.
  pause
  exit /b 1
)
if not exist "%~dp0frontend\dist\index.html" (
  echo ERROR: Built frontend is missing.
  pause
  exit /b 1
)
if not exist "%~dp0packaging\run_app.ps1" (
  echo ERROR: Portable project launcher is missing.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\run_app.ps1"
if errorlevel 1 (
  echo.
  echo This portable project's application could not be started. See logs\backend-error.log.
  pause
  exit /b 1
)
endlocal
