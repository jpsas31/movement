@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Movement - Windows Launcher

cd /d "%~dp0"

REM --- Flags --------------------------------------------------------------
REM   --download    permit network download of the Vosk model when not found locally
REM   --no-browser  skip auto-opening Chrome at http://localhost:5173
REM Voice mode is always on. Script searches Downloads for the Vosk model and
REM stages it; if not found, warns (and only fetches when --download is set).
set "WITH_DOWNLOAD=0"
set "OPEN_BROWSER=1"
for %%A in (%*) do (
  if /I "%%~A"=="--download"      set "WITH_DOWNLOAD=1"
  if /I "%%~A"=="-d"              set "WITH_DOWNLOAD=1"
  if /I "%%~A"=="--download-vosk" set "WITH_DOWNLOAD=1"
  if /I "%%~A"=="--no-browser"    set "OPEN_BROWSER=0"
)

echo ================================================
echo   Movement - first-run setup + dev launcher
if "%WITH_DOWNLOAD%"=="1" (
  echo   Download mode: ON  ^(will fetch ~40 MB model if not found locally^)
) else (
  echo   Download mode: OFF ^(pass --download to allow network fetch^)
)
if "%OPEN_BROWSER%"=="1" (
  echo   Auto-open browser: ON  ^(localhost:5173 in Chrome after server boots^)
) else (
  echo   Auto-open browser: OFF ^(--no-browser^)
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

where git >nul 2>&1
if errorlevel 1 (
  echo [setup] Installing Git via winget...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements --silent
  if errorlevel 1 (
    echo [ERROR] Git install failed.
    pause
    exit /b 1
  )
  call :refresh_path
)

REM --- Auto-update from origin/main (destructive, main-only) --------------
REM   If .git missing (e.g. extracted from GitHub ZIP), bootstrap by init +
REM   remote add + fetch + reset --hard origin/main. Converts a ZIP-extracted
REM   directory into a tracked clone in place. Subsequent runs auto-update.
set "MOVEMENT_REPO_URL=https://github.com/jpsas31/movement.git"
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [update] No .git found ^(ZIP install?^). Bootstrapping clone in place...
  git init -b main
  if errorlevel 1 (
    echo [WARN]  git init failed. Skipping auto-update.
    goto :after_update
  )
  git remote add origin "%MOVEMENT_REPO_URL%" >nul 2>&1
  git fetch origin main
  if errorlevel 1 (
    echo [WARN]  git fetch failed ^(offline?^). Skipping auto-update.
    goto :after_update
  )
  echo [update] Resetting working tree to origin/main ^(destructive^)...
  git reset --hard origin/main
  if errorlevel 1 (
    echo [WARN]  git reset failed. Continuing with local copy.
    goto :after_update
  )
  git branch --set-upstream-to=origin/main main >nul 2>&1
  goto :after_update
)
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CUR_BRANCH=%%B"
if /I "!CUR_BRANCH!"=="main" (
  echo [update] Fetching origin/main...
  git fetch origin main
  if errorlevel 1 (
    echo [WARN]  git fetch failed ^(offline?^). Continuing with local copy.
  ) else (
    echo [update] Resetting working tree to origin/main ^(destructive^)...
    git reset --hard origin/main
    if errorlevel 1 (
      echo [WARN]  git reset failed. Continuing with local copy.
    )
  )
) else (
  echo [update] On branch '!CUR_BRANCH!' ^(not main^). Skipping auto-update.
)
:after_update

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
  echo [setup] Installing uv ^(Python manager^) via winget...
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
echo   http://localhost:5173 will open automatically.
echo   Press Ctrl+C in this window to stop.
echo ================================================
echo.

REM Schedule a background helper that polls port 5173 until vite is accepting
REM connections, then opens the browser at /static/ (matches vite.config base).
REM Falls back to system default browser if Chrome isn't on PATH.
if "%OPEN_BROWSER%"=="1" (
  start "movement-browser" /min powershell -NoProfile -WindowStyle Hidden -Command "$deadline = (Get-Date).AddSeconds(90); while ((Get-Date) -lt $deadline) { try { $c = New-Object Net.Sockets.TcpClient('localhost', 5173); $c.Close(); break } catch { Start-Sleep -Milliseconds 400 } }; $url = 'http://localhost:5173/static/'; try { Start-Process -FilePath 'chrome' -ArgumentList $url -ErrorAction Stop } catch { Start-Process $url }"
)

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
