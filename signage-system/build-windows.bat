@echo off
echo.
echo ============================================
echo   Signage System - Windows Build
echo ============================================
echo.

where node >/dev/null 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install: https://nodejs.org
    pause
    exit /b 1
)

echo [1/5] Installing server...
cd server
call npm install
if errorlevel 1 goto error
cd ..

echo [2/5] Installing client...
cd client
call npm install
if errorlevel 1 goto error
cd ..

echo [3/5] Installing player...
cd player
call npm install
if errorlevel 1 goto error
cd ..

echo [4/5] Installing Electron + native modules...
cd electron
call npm run install-deps
if errorlevel 1 goto error

echo [5/5] Building Windows installer...
call npm run build:win
if errorlevel 1 goto error
cd ..

echo.
echo BUILD COMPLETE! Opening output folder...
explorer dist-desktop
pause
exit /b 0

:error
echo BUILD FAILED.
cd ..
pause
exit /b 1
