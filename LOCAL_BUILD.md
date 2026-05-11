# Al Salik POS — Local Build Guide

Build the Android APK and Windows installer entirely on your own machine.
No cloud services, no EAS, no internet required after initial dependency download.

---

## Table of Contents

1. [Software to Install](#1-software-to-install)
2. [Get the Project](#2-get-the-project)
3. [Android APK Build](#3-android-apk-build)
4. [Windows Installer Build](#4-windows-installer-build)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Output File Locations](#6-output-file-locations)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Software to Install

Install **all** of these on your Windows laptop before building.

### Required for Both Builds

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18 or later (LTS) | https://nodejs.org |
| **pnpm** | any | `npm install -g pnpm` after Node.js |

### Required for Android APK

| Software | Notes | Download |
|----------|-------|----------|
| **JDK 17** | Temurin/OpenJDK — do not use JDK 8 or 11 | https://adoptium.net/temurin/releases/?version=17 |
| **Android Studio** | Installs Android SDK, emulator, ADB | https://developer.android.com/studio |

After installing Android Studio, open it and go to:

**SDK Manager → SDK Platforms** → install **Android 13 (API 33)** (or later)

**SDK Manager → SDK Tools** → install:
- Android SDK Build-Tools (latest)
- Android SDK Command-line Tools
- Android Emulator (optional, for testing without a device)

### Required for Windows Installer

| Software | Notes | Download |
|----------|-------|----------|
| **NSIS 3.x** | For the custom installer script | https://nsis.sourceforge.io/Download |

> NSIS is optional — if you skip it, the Windows build script falls back to
> electron-builder's built-in NSIS, which produces a working installer with
> slightly different branding.

---

## 2. Get the Project

Clone or copy the project to your Windows laptop, then install dependencies:

```bat
:: From the project root folder
pnpm install
```

This installs all workspace packages (Expo, React Native, Electron, etc.).
Run this once before any build, and again whenever `package.json` files change.

---

## 3. Android APK Build

### 3a. Set Environment Variables

Open **System Properties → Advanced → Environment Variables** and add:

| Variable | Value (example) |
|----------|-----------------|
| `ANDROID_HOME` | `C:\Users\YourName\AppData\Local\Android\Sdk` |
| `JAVA_HOME` | `C:\Program Files\Eclipse Adoptium\jdk-17.0.x.x-hotspot` |

Also add to **Path**:
- `%ANDROID_HOME%\platform-tools` (for `adb`)
- `%JAVA_HOME%\bin`

**Restart your Command Prompt / PowerShell after setting these.**

To verify they work:

```bat
java -version
adb version
```

### 3b. Build a Debug APK (Recommended for First Run)

Double-click `build-android.bat` or run from Command Prompt:

```bat
build-android.bat
```

What happens under the hood:
1. `pnpm install` at workspace root
2. `expo prebuild --platform android` — generates the native Android project,
   applies the USB thermal printer plugin (manifest patches + Java fixes)
3. `gradlew.bat assembleDebug` — compiles the APK

**Output:** `dist\AlSalikPOS-debug.apk`

### 3c. Install on a Device

Connect your Android device via USB, enable USB Debugging, then:

```bat
adb install -r dist\AlSalikPOS-debug.apk
```

Or copy the `.apk` file to the device and open it to install manually.

### 3d. Build a Signed Release APK

First, generate a keystore (do this once and keep the file safe):

```bat
keytool -genkey -v -keystore alsalik-release.jks ^
        -alias alsalik -keyalg RSA -keysize 2048 -validity 10000
```

> Store `alsalik-release.jks` in a safe location outside the project folder.
> Never commit it to Git.

Then set these variables and run the release build:

```bat
set ANDROID_KEYSTORE_PATH=C:\path\to\alsalik-release.jks
set ANDROID_KEYSTORE_PASSWORD=yourpassword
set ANDROID_KEY_ALIAS=alsalik
set ANDROID_KEY_PASSWORD=yourpassword

build-android.bat --release
```

**Output:** `dist\AlSalikPOS-release.apk`

### 3e. pnpm Commands (Alternative to batch file)

If you prefer running commands directly:

```bat
:: Debug APK
pnpm --filter @workspace/pos-app run build:android:local

:: Release APK (set keystore env vars first)
pnpm --filter @workspace/pos-app run build:android:local:release

:: Force clean rebuild (removes android/ and regenerates)
node artifacts\pos-app\scripts\build-local-android.js --clean
```

### 3f. USB Thermal Printer

The build automatically applies two fixes for USB thermal printing on Android POS
devices (SUNMI Mini POS, Zigler, and other ESC/POS USB printers):

- **Permission pre-check**: If the device has already granted USB access,
  `mUsbDevice` is set synchronously (no dialog delay).
- **Android 13+ compatibility**: `registerReceiver()` uses `RECEIVER_NOT_EXPORTED`
  on API 33+, preventing a `SecurityException` that broke USB init entirely.

These patches are applied automatically during `expo prebuild` via
`artifacts/pos-app/plugins/withUsbPrinter.js`. No manual steps needed.

---

## 4. Windows Installer Build

### 4a. Build the 64-bit Installer (Windows 10/11)

Double-click `build-windows.bat` or run:

```bat
build-windows.bat
```

What happens:
1. `pnpm install` — installs all dependencies
2. `expo export --platform web` — builds the Expo web app into `desktop-installer\www\`
3. `electron-builder --win --x64 --dir` — packages the Electron app (unpacked)
4. Web assets are copied into the Electron package
5. NSIS compiles the custom installer script → `.exe`

**Output:** `desktop-installer\dist\Al Salik POS Setup 2.0.0.exe`

### 4b. Build the 32-bit Installer (Windows 7 SP1+)

```bat
build-windows.bat --32
```

**Output:** `desktop-installer\dist-32\Al Salik POS Setup 2.0.0 (32-bit).exe`

### 4c. pnpm Commands (Alternative)

```bat
:: From the desktop-installer\ folder:

:: Step 1: Export Expo web build
pnpm run export-web

:: Step 2: Build Electron (64-bit unpacked)
pnpm run build:win

:: Step 3: Copy web assets into Electron package
pnpm run rebuild-web

:: Step 4: Build NSIS installer (requires NSIS in PATH)
pnpm run build:installer
```

For 32-bit:
```bat
pnpm run build:all-32
```

### 4d. Build Web-Only Update (Fast — No Electron Rebuild)

When you only changed JavaScript/UI (no native dependencies), you can skip
the Electron build and just update the web assets:

```bat
cd desktop-installer

:: Re-export and copy web assets
pnpm run export-web
pnpm run rebuild-web

:: Rebuild installer only
pnpm run build:installer
```

This is significantly faster than a full build.

### 4e. API Server URL

The Windows Electron app connects to the cloud API at:

```
https://retail-hub-omairahm3d.replit.app
```

This is configured in `desktop-installer\api-config.json`. After installation,
the file lives next to `Al Salik POS.exe` and can be edited without reinstalling.

---

## 5. Environment Variables Reference

### Android Build

| Variable | Required | Description |
|----------|----------|-------------|
| `ANDROID_HOME` | Auto-detected | Path to Android SDK |
| `JAVA_HOME` | Auto-detected | Path to JDK 17 |
| `EXPO_PUBLIC_API_BASE` | Optional | API server URL (default: Replit cloud) |
| `ANDROID_KEYSTORE_PATH` | Release only | Path to `.jks` keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Release only | Keystore store password |
| `ANDROID_KEY_ALIAS` | Release only | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | Release only | Key password |

### Windows Build

| Variable | Required | Description |
|----------|----------|-------------|
| `WIN_CSC_LINK` | Optional | Path to `.pfx` file for code signing |
| `WIN_CSC_KEY_PASSWORD` | Optional | Password for the `.pfx` file |
| `GPG_KEY_ID` | Optional | GPG key ID for checksum signing |

---

## 6. Output File Locations

| Build | Output path |
|-------|-------------|
| Android debug APK | `dist\AlSalikPOS-debug.apk` |
| Android release APK | `dist\AlSalikPOS-release.apk` |
| Windows 64-bit installer | `desktop-installer\dist\Al Salik POS Setup 2.0.0.exe` |
| Windows 32-bit installer | `desktop-installer\dist-32\Al Salik POS Setup 2.0.0 (32-bit).exe` |
| Android source (generated) | `artifacts\pos-app\android\` |

---

## 7. Troubleshooting

### Android build: `SDK location not found`

`android\local.properties` is missing or has the wrong path.
Set `ANDROID_HOME` in your environment and re-run the build script — it writes
`local.properties` automatically.

### Android build: `Unsupported class file major version`

Your Gradle is using the wrong Java version. Ensure `JAVA_HOME` points to JDK 17:

```bat
echo %JAVA_HOME%
java -version
```

If `java -version` shows a different version than `JAVA_HOME`, your PATH is overriding
it. Move `%JAVA_HOME%\bin` to the top of the PATH variable list.

### Android build: `Task :app:processDebugMainManifest FAILED`

Usually a missing Android SDK component. Open Android Studio → SDK Manager and install:
- Android SDK Build-Tools 35 (or latest)
- Android 13 (API 33) platform

### Android build: USB printer not working after install

Ensure you ran `expo prebuild` (the build script does this automatically). If you
copied an old `android/` directory manually, delete it and run a clean build:

```bat
node artifacts\pos-app\scripts\build-local-android.js --clean
```

### Windows build: `makensis not found`

Either install NSIS from https://nsis.sourceforge.io/Download and re-run, or
choose the built-in NSIS option when prompted by `build-windows.bat`.

### Windows build: Expo export fails

The expo export step requires internet access on first run (to download Metro
bundler dependencies). After that it works offline.

If export fails with a module error, run from the project root:

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

:: Build Android debug APK
build-android.bat

:: Build Android release APK (set keystore vars first)
build-android.bat --release

:: Build Windows 64-bit installer
build-windows.bat

:: Build Windows 32-bit installer (Windows 7+)
build-windows.bat --32
```

---

*This app includes USB thermal printer support for Android POS devices
like SUNMI and preserves native USB printing functionality in local builds.*
