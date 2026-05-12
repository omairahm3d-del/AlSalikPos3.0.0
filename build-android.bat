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
if errorlevel 1 ( echo  FAILED: pnpm install & pause & exit /b 1 )

:: ── Check EAS login ───────────────────────────────────────────────────────────
echo.
echo  Step 2: Checking EAS login...
cd /d "%POSAPP%"
eas whoami >nul 2>&1
if errorlevel 1 (
    echo  Not logged in. Running: eas login
    eas login
    if errorlevel 1 ( echo  FAILED: eas login & pause & exit /b 1 )
)

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
eas build --local --platform android --profile standard --non-interactive
if errorlevel 1 (
    echo  WARNING: Restaurant build failed — continuing with next mode.
    goto :next_after_restaurant
)
:: EAS local places the APK inside artifacts/pos-app/  — find it
for /f "delims=" %%f in ('dir /s /b "%POSAPP%\*.apk" 2^>nul') do (
    copy /y "%%f" "%DISTDIR%\AlSalik-Restaurant-3.0.0.apk" >nul
    echo  Output: dist\AlSalik-Restaurant-3.0.0.apk
    del /f /q "%%f" >nul 2>&1
    goto :next_after_restaurant
)
:next_after_restaurant
if /i "!BUILD_MODE!"=="restaurant" goto :done
if /i "!BUILD_MODE!"=="standard"   goto :done

:build_saloon
echo.
echo  ════════════════════════════════════════════════════════════
echo   [2/4]  Al Salik Saloon  (saloon profile)
echo  ════════════════════════════════════════════════════════════
cd /d "%POSAPP%"
eas build --local --platform android --profile saloon --non-interactive
if errorlevel 1 (
    echo  WARNING: Saloon build failed — continuing with next mode.
    goto :next_after_saloon
)
for /f "delims=" %%f in ('dir /s /b "%POSAPP%\*.apk" 2^>nul') do (
    copy /y "%%f" "%DISTDIR%\AlSalik-Saloon-3.0.0.apk" >nul
    echo  Output: dist\AlSalik-Saloon-3.0.0.apk
    del /f /q "%%f" >nul 2>&1
    goto :next_after_saloon
)
:next_after_saloon
if /i "!BUILD_MODE!"=="saloon" goto :done

:build_laundry
echo.
echo  ════════════════════════════════════════════════════════════
echo   [3/4]  Al Salik Laundry  (laundry profile)
echo  ════════════════════════════════════════════════════════════
cd /d "%POSAPP%"
eas build --local --platform android --profile laundry --non-interactive
if errorlevel 1 (
    echo  WARNING: Laundry build failed — continuing with next mode.
    goto :next_after_laundry
)
for /f "delims=" %%f in ('dir /s /b "%POSAPP%\*.apk" 2^>nul') do (
    copy /y "%%f" "%DISTDIR%\AlSalik-Laundry-3.0.0.apk" >nul
    echo  Output: dist\AlSalik-Laundry-3.0.0.apk
    del /f /q "%%f" >nul 2>&1
    goto :next_after_laundry
)
:next_after_laundry
if /i "!BUILD_MODE!"=="laundry" goto :done

:build_retail
echo.
echo  ════════════════════════════════════════════════════════════
echo   [4/4]  Al Salik Retail  (retail profile)
echo  ════════════════════════════════════════════════════════════
cd /d "%POSAPP%"
eas build --local --platform android --profile retail --non-interactive
if errorlevel 1 (
    echo  WARNING: Retail build failed.
    goto :done
)
for /f "delims=" %%f in ('dir /s /b "%POSAPP%\*.apk" 2^>nul') do (
    copy /y "%%f" "%DISTDIR%\AlSalik-Retail-3.0.0.apk" >nul
    echo  Output: dist\AlSalik-Retail-3.0.0.apk
    del /f /q "%%f" >nul 2>&1
    goto :done
)

:done
echo.
echo  ============================================================
echo   DONE — APKs are in the dist\ folder:
echo.
echo   dist\AlSalik-Restaurant-3.0.0.apk
echo   dist\AlSalik-Saloon-3.0.0.apk
echo   dist\AlSalik-Laundry-3.0.0.apk
echo   dist\AlSalik-Retail-3.0.0.apk
echo.
echo   Install on a device via USB:
echo     adb install -r dist\AlSalik-Restaurant-3.0.0.apk
echo  ============================================================
echo.
pause
