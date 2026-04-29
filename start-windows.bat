@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Movement - Windows Launcher

cd /d "%~dp0"

REM --- Flags --------------------------------------------------------------
REM   --download         permit network download of Vosk model (~1.4 GB) and
REM                      (template mode only) ESC-50 noise corpus (~600 MB)
REM   --no-browser       skip auto-opening Chrome at http://localhost:5173
REM   --recognizer vosk|template|hybrid     (default vosk)
REM   --vosk             alias of --recognizer vosk
REM   --small-model      use vosk-model-small-es-0.42 (~40 MB) instead of the big model
set "WITH_DOWNLOAD=0"
set "OPEN_BROWSER=1"
set "RECOGNIZER=vosk"
set "VOSK_MODEL_NAME=vosk-model-es-0.42"
set "_NEXT_IS_RECOGNIZER=0"
for %%A in (%*) do (
  if "!_NEXT_IS_RECOGNIZER!"=="1" (
    set "RECOGNIZER=%%~A"
    set "_NEXT_IS_RECOGNIZER=0"
  ) else (
    if /I "%%~A"=="--download"      set "WITH_DOWNLOAD=1"
    if /I "%%~A"=="-d"              set "WITH_DOWNLOAD=1"
    if /I "%%~A"=="--download-vosk" set "WITH_DOWNLOAD=1"
    if /I "%%~A"=="--no-browser"    set "OPEN_BROWSER=0"
    if /I "%%~A"=="--vosk"          set "RECOGNIZER=vosk"
    if /I "%%~A"=="--recognizer"    set "_NEXT_IS_RECOGNIZER=1"
    if /I "%%~A"=="--small-model"   set "VOSK_MODEL_NAME=vosk-model-small-es-0.42"
  )
)

echo ================================================
echo   Movement - first-run setup + dev launcher
echo   Recognizer: %RECOGNIZER%
echo   Vosk model: %VOSK_MODEL_NAME%
if "%WITH_DOWNLOAD%"=="1" (
  echo   Download mode: ON  ^(may fetch ~1.4 GB Vosk model + 600 MB noise if template mode^)
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

echo.
echo [setup] Syncing Python deps ^(uv sync^)...
call uv sync
if errorlevel 1 (
  echo [ERROR] uv sync failed.
  pause
  exit /b 1
)

REM ----- Stage Vosk model (needed by all recognizer paths: vosk runs it,
REM       template/hybrid still use it via build_grammar.py to autobuild
REM       the trigger map from enrollment audio).
echo.
echo [setup] Looking for an existing Vosk model in Downloads ^(%VOSK_MODEL_NAME%^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\find-vosk-in-downloads.ps1" -ModelName %VOSK_MODEL_NAME%
set "FIND_RESULT=!errorlevel!"
if "!FIND_RESULT!"=="0" (
  echo [setup] Vosk model staged from local copy.
) else (
  if "%WITH_DOWNLOAD%"=="1" (
    echo [setup] No local Vosk model found. Downloading %VOSK_MODEL_NAME% ^(~1.4 GB for big, ~40 MB for small^)...
    set "VOSK_MODEL_NAME=%VOSK_MODEL_NAME%"
    call npm run setup
    if errorlevel 1 (
      echo [ERROR] Vosk model download failed.
      pause
      exit /b 1
    )
  ) else (
    echo [WARN]  No local Vosk model found and --download not set.
    echo [WARN]  Re-run with: start-windows.bat --download
    echo [WARN]  Or place %VOSK_MODEL_NAME%^(.zip^) in your Downloads folder.
    pause
    exit /b 1
  )
)

REM ----- Build observed-vocabulary grammar from enrollment audio.
REM       Transcribes backend\enroll\audio\<phrase_key>\*.wav with open Vosk ASR
REM       and writes backend\templates\grammar.json. main.py merges those
REM       observed phrasings into the runtime grammar so misheards route too.
echo.
echo [setup] Building observed-vocabulary grammar ^(transcribing enrollment audio^)...
call uv run python backend/build_grammar.py
if errorlevel 1 (
  echo [WARN]  build_grammar.py failed - continuing with hardcoded TRIGGERS only.
)

REM ----- Template/hybrid mode extras: noise corpus + speaker enrollment.
if /I "%RECOGNIZER%"=="template" goto :stage_extras
if /I "%RECOGNIZER%"=="hybrid"   goto :stage_extras
goto :launch

:stage_extras
echo.
echo [setup] [%RECOGNIZER%] Checking enrollment artifacts...
if exist "backend\templates\speaker.npy" (
  echo [setup] [%RECOGNIZER%] Templates present.
  goto :launch
)
if "%WITH_DOWNLOAD%"=="1" (
  echo [setup] [%RECOGNIZER%] No templates. Downloading noise corpus ^(ESC-50 ~600 MB^)...
  call uv run python backend/download_noise.py
  if errorlevel 1 (
    echo [WARN]  noise download failed; enrolling clean-only.
    call uv run python backend/enroll.py --no-augment
  ) else (
    echo [setup] [%RECOGNIZER%] Enrolling templates...
    call uv run python backend/enroll.py
  )
  if not exist "backend\templates\speaker.npy" (
    echo [ERROR] Enrollment failed - templates not produced.
    pause
    exit /b 1
  )
) else (
  echo [WARN]  No enrollment templates found and --download not set.
  echo [WARN]  Re-run with: start-windows.bat --recognizer %RECOGNIZER% --download
  echo [WARN]  Or fall back to vosk: start-windows.bat
  pause
  exit /b 1
)

:launch
echo.
echo ================================================
echo   Starting dev server  ^(recognizer=%RECOGNIZER%, model=%VOSK_MODEL_NAME%^).
echo   http://localhost:5173 will open automatically.
echo   Press Ctrl+C in this window to stop.
echo ================================================
echo.

if "%OPEN_BROWSER%"=="1" (
  start "movement-browser" /min powershell -NoProfile -WindowStyle Hidden -Command "$deadline = (Get-Date).AddSeconds(90); while ((Get-Date) -lt $deadline) { try { $c = New-Object Net.Sockets.TcpClient('localhost', 5173); $c.Close(); break } catch { Start-Sleep -Milliseconds 400 } }; $url = 'http://localhost:5173/static/'; try { Start-Process -FilePath 'chrome' -ArgumentList $url -ErrorAction Stop } catch { Start-Process $url }"
)

set "RECOGNIZER=%RECOGNIZER%"
set "VOSK_MODEL=backend/models/%VOSK_MODEL_NAME%"
call npm run dev
pause
exit /b 0

:refresh_path
set "_user="
set "_sys="
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "_user=%%B"
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "_sys=%%B"
set "PATH=%_sys%;%_user%"
exit /b 0
