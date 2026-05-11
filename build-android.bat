@echo off
:: ============================================================
::  Al Salik POS — Local Android APK Build (Windows)
::  No cloud, no EAS — builds entirely on your machine.
:: ============================================================
::
::  Requirements (install before first run):
::    1. Node.js 18+  — https://nodejs.org
::    2. pnpm         — npm install -g pnpm
::    3. JDK 17       — https://adoptium.net/temurin/releases/?version=17
::    4. Android Studio + Android SDK
::                    — https://developer.android.com/studio
::
::  Environment variables this script uses (auto-detected when possible):
::    ANDROID_HOME   — Path to Android SDK (e.g. C:\Users\you\AppData\Local\Android\Sdk)
::    JAVA_HOME      — Path to JDK 17      (e.g. C:\Program Files\Eclipse Adoptium\jdk-17...)
::
::  Usage:
::    build-android.bat           — debug APK (no signing needed)
::    build-android.bat --release — signed release APK (set keystore vars below)
::
::  For release builds, set these variables before running:
::    set ANDROID_KEYSTORE_PATH=C:\path\to\alsalik-release.jks
::    set ANDROID_KEYSTORE_PASSWORD=yourpassword
::    set ANDROID_KEY_ALIAS=alsalik
::    set ANDROID_KEY_PASSWORD=yourpassword
:: ============================================================

setlocal EnableDelayedExpansion
set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set RELEASE_FLAG=

:: Pass --release through if provided
if /i "%~1"=="--release" set RELEASE_FLAG=--release

echo.
echo  ============================================================
echo   Al Salik POS — Android APK Local Build
echo  ============================================================
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found.
    echo         Download: https://nodejs.org
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  Node.js: %%v

:: ── Check pnpm ────────────────────────────────────────────────────────────────
where pnpm >nul 2>&1
if errorlevel 1 (
    echo  ERROR: pnpm not found.
    echo         Install: npm install -g pnpm
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('pnpm --version') do echo  pnpm:    %%v

:: ── Auto-detect ANDROID_HOME ─────────────────────────────────────────────────
if "%ANDROID_HOME%"=="" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
        echo  ANDROID_HOME auto-detected: !ANDROID_HOME!
    ) else (
        echo  WARNING: ANDROID_HOME is not set and could not be auto-detected.
        echo           The build script will attempt to detect it, but you may
        echo           need to set it manually:
        echo             set ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
    )
)

:: ── Auto-detect JAVA_HOME ────────────────────────────────────────────────────
if "%JAVA_HOME%"=="" (
    where java >nul 2>&1
    if errorlevel 1 (
        echo  ERROR: Java not found. Install JDK 17 from:
        echo         https://adoptium.net/temurin/releases/?version=17
        pause & exit /b 1
    )
    echo  JAVA_HOME not set — Java found in PATH. Build may still work.
)

echo.
echo  ── Step 1: Installing dependencies ──────────────────────────
cd /d "%ROOT%"
call pnpm install
if errorlevel 1 (
    echo  ERROR: pnpm install failed.
    pause & exit /b 1
)

echo.
echo  ── Step 2: Building Android APK ─────────────────────────────
node artifacts\pos-app\scripts\build-local-android.js %RELEASE_FLAG%
if errorlevel 1 (
    echo.
    echo  ERROR: Android build failed.
    echo         See output above for details.
    pause & exit /b 1
)

echo.
echo  Done. APK is in the dist\ folder.
echo.
pause
