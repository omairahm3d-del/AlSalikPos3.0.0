@echo off
:: ============================================================
::  Al Salik Restaurant v3.0.0 — Windows Installer Build
::  Produces: desktop-installer\dist\Al Salik Restaurant Setup 3.0.0.exe
::
::  Requirements:
::    1. Node.js 18+  — https://nodejs.org
::    2. pnpm         — npm install -g pnpm
::    3. NSIS 3.x     — https://nsis.sourceforge.io/Download
::       (needed for the custom installer script)
::       If NSIS is NOT installed, the script falls back to
::       electron-builder's built-in NSIS (still functional).
::
::  Usage:
::    build-windows.bat           — 64-bit installer (Windows 10/11)
::    build-windows.bat --32      — 32-bit installer (Windows 7 SP1+)
:: ============================================================

setlocal EnableDelayedExpansion
set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set BUILD_32=0
set USE_BUILTIN_NSIS=0

if /i "%~1"=="--32" set BUILD_32=1

echo.
echo  ============================================================
echo   Al Salik Restaurant v3.0.0 — Windows Installer Build
echo  ============================================================
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found.
    echo         Download: https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  Node.js: %%v

:: ── Check pnpm ────────────────────────────────────────────────────────────────
where pnpm >nul 2>&1
if errorlevel 1 (
    echo  ERROR: pnpm not found. Run: npm install -g pnpm
    pause & exit /b 1
)

:: ── Detect makensis ───────────────────────────────────────────────────────────
set MAKENSIS=
where makensis >nul 2>&1 && set MAKENSIS=makensis
if "!MAKENSIS!"=="" if exist "C:\Program Files (x86)\NSIS\makensis.exe" (
    set "MAKENSIS=C:\Program Files (x86)\NSIS\makensis.exe"
)
if "!MAKENSIS!"=="" if exist "C:\Program Files\NSIS\makensis.exe" (
    set "MAKENSIS=C:\Program Files\NSIS\makensis.exe"
)
if "!MAKENSIS!"=="" (
    echo.
    echo  NSIS not found. Options:
    echo   [A] Install NSIS from https://nsis.sourceforge.io/Download
    echo       (free, adds makensis.exe — recommended for full custom installer)
    echo   [B] Use electron-builder's built-in NSIS (simpler, still works)
    echo.
    set /p "CHOICE=  Use built-in NSIS and continue? [Y/N]: "
    if /i "!CHOICE!" neq "Y" (
        echo  Aborted. Install NSIS and re-run.
        pause & exit /b 1
    )
    set USE_BUILTIN_NSIS=1
)

:: ── Install workspace dependencies ───────────────────────────────────────────
echo.
echo  Step 1: Installing workspace dependencies...
cd /d "%ROOT%"
call pnpm install
if errorlevel 1 ( echo  FAILED: pnpm install & pause & exit /b 1 )

:: ── Export Expo web build ─────────────────────────────────────────────────────
echo.
echo  Step 2: Exporting Expo web app (Al Salik Restaurant mode)...
cd /d "%ROOT%\artifacts\pos-app"
call pnpm exec expo export --platform web --output-dir ..\..\desktop-installer\www-new --clear
if errorlevel 1 ( echo  FAILED: expo export & pause & exit /b 1 )

:: ── Stage web files ───────────────────────────────────────────────────────────
cd /d "%ROOT%\desktop-installer"
if exist www rmdir /s /q www
rename www-new www
if errorlevel 1 ( echo  FAILED: rename www-new to www & pause & exit /b 1 )
call node shorten-paths.js

:: ── Install desktop-installer dependencies ────────────────────────────────────
echo.
echo  Step 3: Installing desktop-installer dependencies...
call pnpm install
if errorlevel 1 ( echo  FAILED: desktop-installer pnpm install & pause & exit /b 1 )

:: Get version number
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set APP_VER=%%v
echo  Version: %APP_VER%

if "!USE_BUILTIN_NSIS!"=="1" (
    :: ── electron-builder full build (built-in NSIS) ──────────────────────────
    echo.
    echo  Step 4: Building Electron + installer (electron-builder NSIS)...
    set CSC_IDENTITY_AUTO_DISCOVERY=false
    if "%BUILD_32%"=="1" (
        call npx electron-builder --win --ia32 --config electron-builder.win7.json
    ) else (
        call npx electron-builder --win --x64
    )
    if errorlevel 1 ( echo  FAILED: electron-builder & pause & exit /b 1 )
    echo.
    echo  ============================================================
    echo   BUILD COMPLETE
    if "%BUILD_32%"=="1" (
        echo   Installer: desktop-installer\dist-32\*.exe
    ) else (
        echo   Installer: desktop-installer\dist\*.exe
    )
    echo  ============================================================
    pause & exit /b 0
)

:: ── electron-builder (directory only) then custom NSIS ───────────────────────
echo.
echo  Step 4: Building Electron app (unpacked directory)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
if "%BUILD_32%"=="1" (
    call npx electron-builder --win --ia32 --config electron-builder.win7.json --dir
    if errorlevel 1 ( echo  FAILED: electron-builder (32-bit) & pause & exit /b 1 )

    echo.
    echo  Step 5: Staging web assets (32-bit)...
    mkdir dist-32\win-ia32-unpacked\resources\app 2>nul
    robocopy www dist-32\win-ia32-unpacked\resources\app\www /E /NFL /NDL >nul
    copy /y main.js     dist-32\win-ia32-unpacked\resources\app\main.js     >nul
    copy /y preload.js  dist-32\win-ia32-unpacked\resources\app\preload.js  >nul
    copy /y api-config.json dist-32\win-ia32-unpacked\resources\app\api-config.json >nul

    echo.
    echo  Step 6: Building 32-bit NSIS installer...
    "!MAKENSIS!" /V2 /DAPP_VERSION=%APP_VER% installer-32.nsi
    if errorlevel 1 ( echo  FAILED: NSIS installer-32 & pause & exit /b 1 )

    echo.
    echo  ============================================================
    echo   BUILD COMPLETE (32-bit)
    echo   Installer: desktop-installer\dist-32\Al Salik Restaurant Setup %APP_VER% (32-bit).exe
    echo  ============================================================

) else (
    call npx electron-builder --win --x64 --dir
    if errorlevel 1 ( echo  FAILED: electron-builder (64-bit) & pause & exit /b 1 )

    echo.
    echo  Step 5: Staging web assets (64-bit)...
    mkdir dist\win-unpacked\resources\app 2>nul
    robocopy www dist\win-unpacked\resources\app\www /E /NFL /NDL >nul
    copy /y main.js     dist\win-unpacked\resources\app\main.js     >nul
    copy /y preload.js  dist\win-unpacked\resources\app\preload.js  >nul
    copy /y api-config.json dist\win-unpacked\resources\app\api-config.json >nul

    echo.
    echo  Step 6: Building 64-bit NSIS installer...
    "!MAKENSIS!" /V2 /DAPP_VERSION=%APP_VER% installer.nsi
    if errorlevel 1 ( echo  FAILED: NSIS installer & pause & exit /b 1 )

    echo.
    echo  ============================================================
    echo   BUILD COMPLETE (64-bit)
    echo   Installer: desktop-installer\dist\Al Salik Restaurant Setup %APP_VER%.exe
    echo  ============================================================
)

echo.
pause
