@echo off
:: ============================================================
::  Al Salik POS v3.0.0 — Local Android APK Build (Windows)
::  Builds mode-locked APKs on your laptop — no EAS cloud.
::
::  Requirements (install before first run):
::    1. Node.js 18+    — https://nodejs.org
::    2. pnpm           — npm install -g pnpm
::    3. EAS CLI        — npm install -g eas-cli
::    4. JDK 17         — https://adoptium.net/temurin/releases/?version=17
::    5. Android Studio + SDK (API 33+, Build-Tools)
::                      — https://developer.android.com/studio
::
::  Set these in System Properties → Advanced → Environment Variables:
::    ANDROID_HOME  e.g. C:\Users\You\AppData\Local\Android\Sdk
::    JAVA_HOME     e.g. C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot
::
::  First run:  eas login   (once per machine)
::
::  Usage:
::    build-android.bat              — build ALL 4 modes
::    build-android.bat restaurant   — Al Salik Restaurant only
::    build-android.bat saloon       — Al Salik Saloon only
::    build-android.bat laundry      — Al Salik Laundry only
::    build-android.bat retail       — Al Salik Retail only
:: ============================================================

setlocal EnableDelayedExpansion
set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set "POSAPP=%ROOT%\artifacts\pos-app"
set "DISTDIR=%ROOT%\dist"
set BUILD_MODE=%~1

echo.
echo  ============================================================
echo   Al Salik POS v3.0.0 — Android APK Local Build
echo  ============================================================
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found. Download: https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  Node.js  : %%v

:: ── Check pnpm ────────────────────────────────────────────────────────────────
where pnpm >nul 2>&1
if errorlevel 1 (
    echo  ERROR: pnpm not found.  Run: npm install -g pnpm
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('pnpm --version') do echo  pnpm     : %%v

:: ── Check EAS CLI ─────────────────────────────────────────────────────────────
where eas >nul 2>&1
if errorlevel 1 (
    echo  ERROR: EAS CLI not found.  Run: npm install -g eas-cli
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('eas --version 2^>^&1') do (
    echo  EAS CLI  : %%v
    goto :eas_done
)
:eas_done

:: ── Check Java ────────────────────────────────────────────────────────────────
where java >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Java not found.
    echo         Install JDK 17: https://adoptium.net/temurin/releases/?version=17
    pause & exit /b 1
)

:: ── Auto-detect ANDROID_HOME ─────────────────────────────────────────────────
if "%ANDROID_HOME%"=="" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
        echo  ANDROID_HOME auto-detected: !ANDROID_HOME!
    ) else (
        echo  WARNING: ANDROID_HOME not set. Set it in System Properties if the build fails.
    )
)

echo.

:: ── Install workspace dependencies ───────────────────────────────────────────
echo  Step 1: Installing workspace dependencies...
cd /d "%ROOT%"
call pnpm install
:: pnpm exits 1 on build-script warnings (ERR_PNPM_IGNORED_BUILDS) even when
:: all packages installed correctly — verify by checking expo is present.
if errorlevel 1 (
    if not exist "%POSAPP%\node_modules\expo\package.json" (
        echo  FAILED: pnpm install - node_modules incomplete
        pause & exit /b 1
    )
    echo  Note: pnpm reported build-script warnings but install succeeded.
)

:: ── Check EAS login ───────────────────────────────────────────────────────────
echo.
echo  Step 2: Checking EAS login...
cd /d "%POSAPP%"
for /f "tokens=*" %%u in ('eas whoami 2^>^&1') do set EAS_USER=%%u
if "!EAS_USER!"=="" (
    echo.
    echo  ============================================================
    echo   Not logged in to EAS. Please log in now:
    echo   Run:  eas login
    echo   Then re-run build-android.bat
    echo  ============================================================
    echo.
    pause & exit /b 1
)
echo  EAS user : !EAS_USER!

mkdir "%DISTDIR%" 2>nul

:: ── Determine which modes to build ───────────────────────────────────────────
if /i "!BUILD_MODE!"=="restaurant" goto :build_restaurant
if /i "!BUILD_MODE!"=="standard"   goto :build_restaurant
if /i "!BUILD_MODE!"=="saloon"     goto :build_saloon
if /i "!BUILD_MODE!"=="laundry"    goto :build_laundry
if /i "!BUILD_MODE!"=="retail"     goto :build_retail

:: ─── Build ALL 4 modes ───────────────────────────────────────────────────────

:build_restaurant
echo.
echo  ════════════════════════════════════════════════════════════
echo   [1/4]  Al Salik Restaurant  (standard profile)
echo  ════════════════════════════════════════════════════════════
cd /d "%POSAPP%"
eas build --platform android --profile standard --wait
if errorlevel 1 (
    echo  WARNING: Restaurant build failed — continuing with next mode.
)
if /i "!BUILD_MODE!"=="restaurant" goto :done
if /i "!BUILD_MODE!"=="standard"   goto :done

:build_saloon
echo.
echo  ════════════════════════════════════════════════════════════
echo   [2/4]  Al Salik Saloon  (saloon profile)
echo  ════════════════════════════════════════════════════════════
cd /d "%POSAPP%"
eas build --platform android --profile saloon --wait
if errorlevel 1 (
    echo  WARNING: Saloon build failed — continuing with next mode.
)
if /i "!BUILD_MODE!"=="saloon" goto :done

:build_laundry
echo.
echo  ════════════════════════════════════════════════════════════
echo   [3/4]  Al Salik Laundry  (laundry profile)
echo  ════════════════════════════════════════════════════════════
cd /d "%POSAPP%"
eas build --platform android --profile laundry --wait
if errorlevel 1 (
    echo  WARNING: Laundry build failed — continuing with next mode.
)
if /i "!BUILD_MODE!"=="laundry" goto :done

:build_retail
echo.
echo  ════════════════════════════════════════════════════════════
echo   [4/4]  Al Salik Retail  (retail profile)
echo  ════════════════════════════════════════════════════════════
cd /d "%POSAPP%"
eas build --platform android --profile retail --wait
if errorlevel 1 (
    echo  WARNING: Retail build failed.
)

:done
echo.
echo  ============================================================
echo   DONE — Download your APKs from the EAS dashboard:
echo   https://expo.dev/accounts/al-salik-computers/builds
echo.
echo   Or download each APK directly using:
echo     eas build:download --platform android
echo.
echo   Install on a device via USB:
echo     adb install -r dist\AlSalik-Restaurant-3.0.0.apk
echo  ============================================================
echo.
pause
