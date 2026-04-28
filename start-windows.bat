@echo off
setlocal EnableDelayedExpansion
title Movement - Windows Launcher

cd /d "%~dp0"

REM ── Flags ─────────────────────────────────────────────────────────────────
REM   --download  permit network download of the Vosk model when not found locally
REM Voice mode is always on. Script searches Downloads for the Vosk model and
REM stages it; if not found, warns (and only fetches when --download is set).
set "WITH_DOWNLOAD=0"
for %%A in (%*) do (
  if /I "%%~A"=="--download"     set "WITH_DOWNLOAD=1"
  if /I "%%~A"=="-d"             set "WITH_DOWNLOAD=1"
  if /I "%%~A"=="--download-vosk" set "WITH_DOWNLOAD=1"
)

echo ================================================
echo   Movement - first-run setup + dev launcher
if "%WITH_DOWNLOAD%"=="1" (
  echo   Download mode: ON  ^(will fetch ~40 MB model if not found locally^)
) else (
  echo   Download mode: OFF ^(pass --download to allow network fetch^)
)
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
echo [setup] Installing JS deps...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

set "VOSK_MODEL_NAME=vosk-model-small-es-0.42"

echo.
echo [setup] Looking for an existing Vosk model in Downloads...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\find-vosk-in-downloads.ps1"
set "FIND_RESULT=!errorlevel!"

if "!FIND_RESULT!"=="0" (
  echo [setup] Vosk model staged from local copy.
) else (
  if "%WITH_DOWNLOAD%"=="1" (
    echo [setup] No local Vosk model found. Downloading small model ^(~40 MB^)...
    call npm run setup
    if errorlevel 1 (
      echo [ERROR] Vosk model download failed.
      pause
      exit /b 1
    )
  ) else (
    echo [WARN]  No local Vosk model found and --download not set.
    echo [WARN]  Voice features will fail until you either:
    echo [WARN]    a^) place vosk-model-small-es-0.42^(.zip^) in your Downloads folder, or
    echo [WARN]    b^) re-run with: start-windows.bat --download
  )
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
