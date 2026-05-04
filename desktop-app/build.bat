@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set POS_APP_DIR=%SCRIPT_DIR%..\artifacts\pos-app

echo ============================================
echo   POS System Desktop Build (Windows)
echo ============================================
echo.

if not exist "%POS_APP_DIR%" (
    echo ERROR: POS app not found at %POS_APP_DIR%
    exit /b 1
)

echo [1/4] Installing POS app dependencies...
cd /d "%POS_APP_DIR%"
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install POS app dependencies
    exit /b 1
)

echo.
echo [2/4] Building web version...
call npx expo export --platform web --output-dir "%SCRIPT_DIR%web-build"
if errorlevel 1 (
    echo ERROR: Failed to build web version
    exit /b 1
)

echo.
echo [3/4] Installing Electron dependencies...
cd /d "%SCRIPT_DIR%"
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install Electron dependencies
    exit /b 1
)

echo.
echo [4/4] Building Windows installer...
call npm run build:win
if errorlevel 1 (
    echo ERROR: Failed to build Windows installer
    exit /b 1
)

echo.
echo ============================================
echo   Build complete!
echo   Output: %SCRIPT_DIR%dist\
echo ============================================
pause
