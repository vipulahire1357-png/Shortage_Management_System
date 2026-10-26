@echo off
setlocal
cd /d "%~dp0"
title ABB Shortage and Vendor Management - Project Checkout
if not exist "%~dp0packaging\run_app.ps1" (
  echo ERROR: This project folder is missing packaging\run_app.ps1.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\run_app.ps1"
if errorlevel 1 (
  echo.
  echo This project's application could not be started. See logs\backend-error.log.
  pause
  exit /b 1
)
endlocal
