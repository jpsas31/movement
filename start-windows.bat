@echo off
setlocal EnableDelayedExpansion
title Movement - Windows Launcher

cd /d "%~dp0"

echo ================================================
echo   Movement - first-run setup + dev launcher
echo ================================================
echo.

where winget >nul 2>&1
if errorlevel 1 (
  echo [ERROR] winget not found.
  echo Update Windows, or install "App Installer" from Microsoft Store, then rerun.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [setup] Installing Node.js LTS via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  if errorlevel 1 (
    echo [ERROR] Node.js install failed.
    pause
    exit /b 1
  )
  call :refresh_path
)

where uv >nul 2>&1
if errorlevel 1 (
  echo [setup] Installing uv (Python manager) via winget...
  winget install -e --id astral-sh.uv --accept-source-agreements --accept-package-agreements --silent
  if errorlevel 1 (
    echo [ERROR] uv install failed.
    pause
    exit /b 1
  )
  call :refresh_path
)

echo.
echo [setup] Installing JS deps + small Vosk model (~40 MB)...
set "VOSK_MODEL_NAME=vosk-model-small-es-0.42"
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo ================================================
echo   Starting dev server.
echo   Open http://localhost:5173 in your browser.
echo   Press Ctrl+C in this window to stop.
echo ================================================
echo.
call npm run dev:small
pause
exit /b 0

:refresh_path
set "_user="
set "_sys="
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "_user=%%B"
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "_sys=%%B"
set "PATH=%_sys%;%_user%"
exit /b 0
