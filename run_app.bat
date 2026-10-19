@echo off
setlocal
cd /d "%~dp0"
title ABB Shortage and Vendor Management

set "BOOTSTRAP=%~dp0packaging\bootstrap_portable.ps1"
if not exist "%BOOTSTRAP%" (
  echo ERROR: The launcher setup file is missing.
  echo Extract or clone the complete project before running this file.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BOOTSTRAP%"
if errorlevel 1 (
  echo.
  echo The portable application could not be prepared or started.
  pause
  exit /b 1
)
endlocal
