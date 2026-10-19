@echo off
setlocal
title MindLox Task Manager - Dev Server

cd /d "%~dp0"

REM Prisma's background version-check can stall a cold start; skip it.
set CHECKPOINT_DISABLE=1
set PRISMA_HIDE_UPDATE_MESSAGE=1

echo ============================================
echo   MindLox Task Manager - starting app (UI + API)
echo ============================================
echo.

REM --- Node present? ----------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not on your PATH.
  echo         Install the LTS build from https://nodejs.org/ and run this again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [ok]    Node %%v

REM --- .env on first run ------------------------------------------------
if not exist ".env" (
  if not exist ".env.example" (
    echo [ERROR] Missing both .env and .env.example - cannot configure the app.
    pause
    exit /b 1
  )
  echo [setup] Creating .env from .env.example
  copy /y ".env.example" ".env" >nul
  echo [warn]  Set a real AUTH_SECRET in .env before using this for real work.
)

REM --- Dependencies on first run ----------------------------------------
if not exist "node_modules" (
  echo [setup] Installing dependencies - the first run takes a few minutes...
  call npm install
  if errorlevel 1 goto :failed_install
) else (
  echo [ok]    Dependencies installed
)

REM --- Database on first run --------------------------------------------
if not exist "prisma\dev.db" (
  echo [setup] No database yet - creating, migrating and seeding it...
  call npm run setup
  if errorlevel 1 goto :failed_db
) else (
  echo [ok]    Database ready
)

REM --- Is something already holding port 3000? -------------------------
REM If so, Next.js falls back to the next free port, so don't open 3000.
set "PORT_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP .*:3000 .*LISTENING"') do set "PORT_PID=%%p"

echo.
echo ============================================
if defined PORT_PID (
  echo   Port 3000 is taken by process %PORT_PID%, so the app
  echo   starts on the next free port - open the URL
  echo   that Next.js prints below.
  echo.
  echo   If that is an old MindLox Task Manager window, close it, or run:
  echo       taskkill /pid %PORT_PID% /f
) else (
  echo   Starting on http://localhost:3000
  echo   Your browser opens in a few seconds.
)
echo.
echo   Keep this window open; Ctrl+C stops the server.
echo ============================================
echo.

REM --- Open the browser once the server has had time to boot ------------
if not defined PORT_PID start "" /min cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:3000"

REM --- UI and API are one Next.js process ------------------------------
call npm run dev

echo.
echo [stopped] Dev server exited.
pause
exit /b 0

:failed_install
echo.
echo [ERROR] npm install failed - scroll up for the reason.
pause
exit /b 1

:failed_db
echo.
echo [ERROR] Database setup failed - scroll up for the reason.
echo         You can retry it by hand with:  npm run setup
pause
exit /b 1
