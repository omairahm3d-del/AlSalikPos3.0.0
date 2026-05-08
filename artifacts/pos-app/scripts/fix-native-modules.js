#!/usr/bin/env node
/**
 * fix-native-modules.js
 *
 * Postinstall script that patches outdated native module source files so EAS
 * cloud builds succeed. Runs automatically after `pnpm install`.
 *
 * Patches applied:
 *   - react-native-bluetooth-escpos-printer:
 *       1. build.gradle — replaces jcenter/old-AGP config with modern one
 *       2. RNBluetoothManagerModule.java — replaces android.support.v4 imports
 *          with their AndroidX equivalents
 */

const fs = require("fs");
const path = require("path");

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function findModuleDir(moduleName) {
  let dir = path.resolve(__dirname, "..");
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "node_modules", moduleName);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

function writeIfDifferent(filePath, content) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : null;
  if (existing === content) {
    console.log(`  [skip] ${filePath} — already up to date`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  [patched] ${filePath}`);
}

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.log(`  [skip] ${filePath} — file not found`);
    return;
  }
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;
  for (const [from, to] of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (!changed) {
    console.log(`  [skip] ${filePath} — already up to date`);
    return;
  }
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  [patched] ${filePath}`);
}

// --------------------------------------------------------------------------
// Patch: react-native-bluetooth-escpos-printer
// --------------------------------------------------------------------------

function patchBluetoothEscposPrinter() {
  const moduleDir = findModuleDir("react-native-bluetooth-escpos-printer");
  if (!moduleDir) {
    console.log(
      "  [skip] react-native-bluetooth-escpos-printer not found in node_modules"
    );
    return;
  }

  // ── 1. build.gradle ────────────────────────────────────────────────────
  const buildGradlePath = path.join(moduleDir, "android", "build.gradle");

  const modernBuildGradle = `apply plugin: 'com.android.library'

android {
    compileSdkVersion 34
    namespace "cn.jystudio.bluetooth"

    defaultConfig {
        minSdkVersion 21
        targetSdkVersion 34
        versionCode 1
        versionName "1.0"
    }
    lintOptions {
        abortOnError false
    }
    sourceSets {
        main {
            aidl.srcDirs = ['src/main/java']
        }
    }
}

repositories {
    mavenCentral()
    maven {
        url "$rootDir/../node_modules/react-native/android"
    }
    maven {
        url 'https://maven.google.com'
    }
}

dependencies {
    implementation fileTree(dir: 'libs', include: ['*.jar'])
    implementation 'com.facebook.react:react-native:+'
    implementation 'androidx.core:core:1.12.0'
    implementation "com.google.zxing:core:3.3.0"
}
`;

  writeIfDifferent(buildGradlePath, modernBuildGradle);

  // ── 2. RNBluetoothManagerModule.java — android.support → AndroidX ──────
  const managerJavaPath = path.join(
    moduleDir,
    "android/src/main/java/cn/jystudio/bluetooth/RNBluetoothManagerModule.java"
  );

  replaceInFile(managerJavaPath, [
    [
      "import android.support.v4.app.ActivityCompat;",
      "import androidx.core.app.ActivityCompat;",
    ],
    [
      "import android.support.v4.content.ContextCompat;",
      "import androidx.core.content.ContextCompat;",
    ],
  ]);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

console.log("fix-native-modules: applying patches...");
patchBluetoothEscposPrinter();
console.log("fix-native-modules: done.");
