# Al Salik POS v3.0.0 — Local Build Guide

Build all 4 Android APKs and the Windows installer entirely on your Windows
laptop. No cloud services required after the initial dependency download.

---

## Table of Contents

1. [Software to Install](#1-software-to-install)
2. [Get the Project](#2-get-the-project)
3. [Android APK Builds (all 4 modes)](#3-android-apk-builds)
4. [Windows Installer Build](#4-windows-installer-build)
5. [Output File Locations](#5-output-file-locations)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Software to Install

Install **all** of these on your Windows laptop before building.

### Required for Both Builds

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18 or later (LTS) | https://nodejs.org |
| **pnpm** | any | `npm install -g pnpm` after Node.js |

### Required for Android APKs

| Software | Notes | Download |
|----------|-------|----------|
| **EAS CLI** | Runs the local Android build pipeline | `npm install -g eas-cli` |
| **JDK 17** | Temurin/OpenJDK — do not use JDK 8 or 11 | https://adoptium.net/temurin/releases/?version=17 |
| **Android Studio** | Installs Android SDK, ADB | https://developer.android.com/studio |

After installing Android Studio open it and go to:

**SDK Manager → SDK Platforms** — install **Android 13 (API 33)** or later

**SDK Manager → SDK Tools** — install:
- Android SDK Build-Tools (latest)
- Android SDK Command-line Tools

Then set these in **System Properties → Advanced → Environment Variables**:

| Variable | Example value |
|----------|--------------|
| `ANDROID_HOME` | `C:\Users\YourName\AppData\Local\Android\Sdk` |
| `JAVA_HOME` | `C:\Program Files\Eclipse Adoptium\jdk-17.0.x.x-hotspot` |

Also add to **Path**: `%ANDROID_HOME%\platform-tools` and `%JAVA_HOME%\bin`.

Restart Command Prompt after setting variables, then verify:
```bat
java -version
adb version
```

### Required for Windows Installer

| Software | Notes | Download |
|----------|-------|----------|
| **NSIS 3.x** | Custom installer script | https://nsis.sourceforge.io/Download |

> NSIS is optional — if you skip it, `build-windows.bat` falls back to
> electron-builder's built-in NSIS which still produces a working installer.

---

## 2. Get the Project

Clone or copy the project to your Windows laptop, then:

```bat
pnpm install
```

Run this once before any build, and again whenever `package.json` files change.

### EAS Login (one-time per machine)

```bat
eas login
```

Use your Expo account credentials. This only needs to be done once.

---

## 3. Android APK Builds

v3.0.0 produces **4 separate APKs** — one per business mode. Each has its
own display name, Android package ID, and icon so all 4 can be sideloaded
simultaneously on the same device for testing.

### 3a. Build All 4 Modes at Once

Double-click **`build-android.bat`** or run from Command Prompt:

```bat
build-android.bat
```

This builds all four profiles in sequence:

| Step | Profile | App name | Package ID |
|------|---------|----------|------------|
| 1/4 | `standard` | **Al Salik Restaurant** | `com.alsalikcomputers.pos` |
| 2/4 | `saloon` | **Al Salik Saloon** | `com.alsalikcomputers.pos.saloon` |
| 3/4 | `laundry` | **Al Salik Laundry** | `com.alsalikcomputers.pos.laundry` |
| 4/4 | `retail` | **Al Salik Retail** | `com.alsalikcomputers.pos.retail` |

Each build takes 10–30 minutes depending on machine speed. EAS local build
downloads the Gradle toolchain on the first run only.

### 3b. Build a Single Mode

```bat
build-android.bat restaurant    :: Al Salik Restaurant
build-android.bat saloon        :: Al Salik Saloon
build-android.bat laundry       :: Al Salik Laundry
build-android.bat retail        :: Al Salik Retail
```

### 3c. Manual pnpm Commands (Alternative)

From `artifacts\pos-app\`:

```bat
eas build --local --platform android --profile standard   :: Restaurant
eas build --local --platform android --profile saloon
eas build --local --platform android --profile laundry
eas build --local --platform android --profile retail
```

### 3d. Install on a Device

Connect your Android device via USB, enable USB Debugging, then:

```bat
adb install -r dist\AlSalik-Restaurant-3.0.0.apk
adb install -r dist\AlSalik-Saloon-3.0.0.apk
adb install -r dist\AlSalik-Laundry-3.0.0.apk
adb install -r dist\AlSalik-Retail-3.0.0.apk
```

Or copy each `.apk` to the device and tap to install manually.

### 3e. USB Thermal Printer

Each build automatically applies two USB printing fixes:
- **Permission pre-check** — device grants USB access synchronously if already approved
- **Android 13+ compatibility** — `RECEIVER_NOT_EXPORTED` flag prevents SecurityException

These are applied by `artifacts/pos-app/plugins/withUsbPrinter.js` during the
EAS local build — no manual steps needed.

---

## 4. Windows Installer Build

The Windows installer wraps the **Al Salik Restaurant** (standard) mode in an
Electron shell. Output: `Al Salik Restaurant Setup 3.0.0.exe`

### 4a. Build the 64-bit Installer (Windows 10/11)

Double-click **`build-windows.bat`** or run:

```bat
build-windows.bat
```

Steps performed automatically:
1. `pnpm install` — workspace dependencies
2. `expo export --platform web` — builds Expo web into `desktop-installer\www\`
3. `electron-builder --win --x64 --dir` — packages Electron (unpacked)
4. Web assets copied into the Electron package
5. NSIS compiles `installer.nsi` → `.exe`

**Output:** `desktop-installer\dist\Al Salik Restaurant Setup 3.0.0.exe`

### 4b. Build the 32-bit Installer (Windows 7 SP1+)

```bat
build-windows.bat --32
```

**Output:** `desktop-installer\dist-32\Al Salik Restaurant Setup 3.0.0 (32-bit).exe`

### 4c. Fast Web-Only Update

When you only changed JavaScript/UI (no native dependencies), skip the Electron
rebuild and just update the web assets:

```bat
cd desktop-installer

pnpm run export-web
pnpm run rebuild-web
pnpm run build:installer
```

This is significantly faster than a full build.

### 4d. API Server URL

The Windows app connects to:

```
https://retail-hub-omairahm3d.replit.app
```

Configured in `desktop-installer\api-config.json`. After installation the file
lives next to the `.exe` and can be edited without reinstalling.

---

## 5. Output File Locations

| Build | Output path |
|-------|------------|
| Al Salik Restaurant APK | `dist\AlSalik-Restaurant-3.0.0.apk` |
| Al Salik Saloon APK | `dist\AlSalik-Saloon-3.0.0.apk` |
| Al Salik Laundry APK | `dist\AlSalik-Laundry-3.0.0.apk` |
| Al Salik Retail APK | `dist\AlSalik-Retail-3.0.0.apk` |
| Windows 64-bit installer | `desktop-installer\dist\Al Salik Restaurant Setup 3.0.0.exe` |
| Windows 32-bit installer | `desktop-installer\dist-32\Al Salik Restaurant Setup 3.0.0 (32-bit).exe` |

---

## 6. Environment Variables Reference

### Android Build

| Variable | Required | Description |
|----------|----------|-------------|
| `ANDROID_HOME` | Yes | Path to Android SDK |
| `JAVA_HOME` | Yes | Path to JDK 17+ |
| `EXPO_PUBLIC_API_BASE` | Auto | API server URL (default: Replit cloud) |

### Windows Build

| Variable | Required | Description |
|----------|----------|-------------|
| `WIN_CSC_LINK` | Optional | Path to `.pfx` file for code signing |
| `WIN_CSC_KEY_PASSWORD` | Optional | Password for the `.pfx` file |

---

## 7. Troubleshooting

### Android build: `SDK location not found`

Set `ANDROID_HOME` in your environment (System Properties → Environment Variables)
and restart Command Prompt. The build toolchain reads this variable to find the SDK.

### Android build: `Unsupported class file major version`

Wrong Java version. Ensure `JAVA_HOME` points to JDK 17:

```bat
echo %JAVA_HOME%
java -version
```

If `java -version` shows a different version, move `%JAVA_HOME%\bin` to the
**top** of the PATH variable list and restart Command Prompt.

### Android build: `Task :app:processDebugMainManifest FAILED`

Missing Android SDK component. Open Android Studio → SDK Manager and install:
- Android SDK Build-Tools 35 (or latest)
- Android 13 (API 33) platform

### Android build: first run takes very long

The EAS local build downloads the Gradle toolchain (~500 MB) on first run. This
is a one-time download and subsequent builds are much faster.

### Windows build: `makensis not found`

Either install NSIS from https://nsis.sourceforge.io/Download (adds `makensis.exe`),
or answer **Y** when `build-windows.bat` asks to use the built-in NSIS fallback.

### Windows build: Expo export fails

Ensure internet is available on first run. If it fails with a module error:

```bat
pnpm install
```

Then retry the build.

### `pnpm: command not found`

```bat
npm install -g pnpm
```

Restart your terminal after installing.

---

## Quick Reference

```bat
:: Install everything (run once)
pnpm install

:: EAS login (run once per machine)
cd artifacts\pos-app
eas login
cd ..\..

:: Build all 4 Android APKs
build-android.bat

:: Build one specific APK
build-android.bat restaurant
build-android.bat saloon
build-android.bat laundry
build-android.bat retail

:: Build Windows 64-bit installer
build-windows.bat

:: Build Windows 32-bit installer (Windows 7+)
build-windows.bat --32
```

---

*Al Salik POS v3.0.0 — Restaurant · Saloon · Laundry · Retail*
