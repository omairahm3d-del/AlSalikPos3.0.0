#!/usr/bin/env node
'use strict';

/**
 * Al Salik POS — Local Android APK builder (no EAS / no cloud).
 *
 * Steps:
 *  1. Validate Java 17+ and Android SDK
 *  2. Write android/local.properties (SDK path for Gradle)
 *  3. expo prebuild --platform android --no-install
 *     (runs withUsbPrinter plugin: USB manifest, filter XML, Java patches)
 *  4. gradlew assembleDebug  (default — no signing needed)
 *     or gradlew assembleRelease (with --release + keystore env vars)
 *  5. Copy APK to <workspace-root>/dist/
 *
 * Usage (from project root):
 *   pnpm --filter @workspace/pos-app run build:android:local
 *   pnpm --filter @workspace/pos-app run build:android:local:release
 *   node artifacts/pos-app/scripts/build-local-android.js --clean
 *
 * Required env for --release:
 *   ANDROID_KEYSTORE_PATH      Absolute path to .jks / .keystore file
 *   ANDROID_KEYSTORE_PASSWORD  Keystore store password
 *   ANDROID_KEY_ALIAS          Key alias inside the store
 *   ANDROID_KEY_PASSWORD       Key password (often same as store password)
 *
 * Optional env:
 *   ANDROID_HOME or ANDROID_SDK_ROOT   Path to Android SDK (auto-detected if absent)
 *   JAVA_HOME                          Path to JDK 17+
 *   EXPO_PUBLIC_API_BASE               API server URL (default: Replit cloud URL)
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const IS_WINDOWS = process.platform === 'win32';

const POS_APP_DIR    = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(POS_APP_DIR, '..', '..');
const ANDROID_DIR    = path.join(POS_APP_DIR, 'android');
const DIST_DIR       = path.join(WORKSPACE_ROOT, 'dist');

const args      = process.argv.slice(2);
const isRelease = args.includes('--release');
const isClean   = args.includes('--clean');

const LINE = '─'.repeat(64);

function log(msg)  { console.log(msg); }
function step(n, msg) { console.log(`\n${LINE}\n  Step ${n}: ${msg}\n${LINE}`); }
function ok(msg)   { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }
function die(msg)  { console.error(`\n  ✗  ERROR: ${msg}\n`); process.exit(1); }

function run(cmd, cwd, extraEnv) {
  console.log(`\n  $ ${cmd}\n`);
  const result = spawnSync(
    IS_WINDOWS ? 'cmd' : 'sh',
    IS_WINDOWS ? ['/c', cmd] : ['-c', cmd],
    {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    }
  );
  if (result.status !== 0) {
    die(`Command failed (exit ${result.status}): ${cmd}`);
  }
}

function tryExec(cmd) {
  try { return execSync(cmd, { stdio: 'pipe' }).toString().trim(); }
  catch { return null; }
}

// ── Step 1: Validate Java ─────────────────────────────────────────────────────
step(1, 'Checking Java (17+ required)');

const javaVer = tryExec('java -version 2>&1') || tryExec('java -version');
if (!javaVer) {
  die(
    'Java not found. Install JDK 17 from:\n' +
    '    https://adoptium.net/temurin/releases/?version=17\n\n' +
    '  Then set JAVA_HOME and add %JAVA_HOME%\\bin to PATH (Windows)\n' +
    '  or $JAVA_HOME/bin to PATH (macOS/Linux).'
  );
}
log(`  ${javaVer.split('\n')[0]}`);

const goodJava = /version "(17|18|19|20|21|22|23|24|25)/.test(javaVer);
if (!goodJava) {
  warn('Java 17+ strongly recommended. Build may fail on older JDKs.');
  warn('Download JDK 17: https://adoptium.net/temurin/releases/?version=17');
} else {
  ok('Java version OK');
}

// ── Step 2: Locate Android SDK ────────────────────────────────────────────────
step(2, 'Locating Android SDK');

let androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

if (!androidHome || !fs.existsSync(androidHome)) {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),  // Windows default
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),            // macOS default
    path.join(os.homedir(), 'Android', 'Sdk'),                       // Linux default
    '/usr/local/lib/android/sdk',
    '/opt/android-sdk',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) { androidHome = c; break; }
  }
}

if (!androidHome || !fs.existsSync(androidHome)) {
  die(
    'Android SDK not found.\n\n' +
    '  Install Android Studio: https://developer.android.com/studio\n' +
    '  Then set ANDROID_HOME in your environment:\n\n' +
    '  Windows (PowerShell):\n' +
    '    $env:ANDROID_HOME = "C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk"\n\n' +
    '  macOS / Linux:\n' +
    '    export ANDROID_HOME="$HOME/Library/Android/sdk"  # macOS\n' +
    '    export ANDROID_HOME="$HOME/Android/Sdk"          # Linux\n\n' +
    '  Or pass ANDROID_HOME=<path> before running this script.'
  );
}
ok(`Android SDK: ${androidHome}`);

// Verify build-tools exist
const buildToolsDir = path.join(androidHome, 'build-tools');
if (!fs.existsSync(buildToolsDir) || fs.readdirSync(buildToolsDir).length === 0) {
  warn(
    'build-tools not found inside Android SDK.\n' +
    '  Open Android Studio → SDK Manager → SDK Tools → Android SDK Build-Tools → Install latest.'
  );
}

// ── Step 3: Write local.properties ───────────────────────────────────────────
step(3, 'Writing android/local.properties');
fs.mkdirSync(ANDROID_DIR, { recursive: true });
// Properties format requires escaped backslashes on Windows
const sdkPathEscaped = androidHome.replace(/\\/g, '\\\\');
const localPropsContent = `# Auto-generated by build-local-android.js — do not commit to git
sdk.dir=${sdkPathEscaped}
`;
fs.writeFileSync(path.join(ANDROID_DIR, 'local.properties'), localPropsContent, 'utf8');
ok('android/local.properties written');

// ── Step 4: expo prebuild ─────────────────────────────────────────────────────
step(4, 'Running expo prebuild (applies USB printer plugin)');

const apiBase = process.env.EXPO_PUBLIC_API_BASE || 'https://retail-hub-omairahm3d.replit.app';
log(`  API base: ${apiBase}`);

const cleanFlag = isClean ? ' --clean' : '';

// Use npx to find expo in local node_modules
run(
  `npx expo prebuild --platform android --no-install${cleanFlag}`,
  POS_APP_DIR,
  { EXPO_PUBLIC_API_BASE: apiBase }
);

// Re-write local.properties (--clean removes android dir, so it may be gone)
fs.mkdirSync(ANDROID_DIR, { recursive: true });
fs.writeFileSync(path.join(ANDROID_DIR, 'local.properties'), localPropsContent, 'utf8');
ok('Prebuild complete — android/ directory ready');

// ── Step 5: (Release only) Inject signing config ──────────────────────────────
if (isRelease) {
  step(5, 'Configuring release signing');

  const ks     = process.env.ANDROID_KEYSTORE_PATH;
  const ksPwd  = process.env.ANDROID_KEYSTORE_PASSWORD;
  const alias  = process.env.ANDROID_KEY_ALIAS;
  const keyPwd = process.env.ANDROID_KEY_PASSWORD;

  if (!ks || !ksPwd || !alias || !keyPwd) {
    die(
      'Release signing requires four environment variables:\n\n' +
      '  ANDROID_KEYSTORE_PATH      = C:\\path\\to\\alsalik-release.jks\n' +
      '  ANDROID_KEYSTORE_PASSWORD  = <store-password>\n' +
      '  ANDROID_KEY_ALIAS          = alsalik\n' +
      '  ANDROID_KEY_PASSWORD       = <key-password>\n\n' +
      '  Generate a new keystore (run once, save the file safely):\n' +
      '    keytool -genkey -v -keystore alsalik-release.jks \\\n' +
      '            -alias alsalik -keyalg RSA -keysize 2048 -validity 10000\n\n' +
      '  Or run WITHOUT --release to build a debug APK (fine for sideloading).'
    );
  }

  if (!fs.existsSync(ks)) {
    die(`Keystore file not found: ${ks}`);
  }

  const buildGradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle');
  let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

  const ksForwardSlash = ks.replace(/\\/g, '/');

  const signingBlock = `
    signingConfigs {
        release {
            storeFile file("${ksForwardSlash}")
            storePassword "${ksPwd}"
            keyAlias "${alias}"
            keyPassword "${keyPwd}"
        }
    }
`;

  if (!buildGradle.includes('signingConfigs {')) {
    buildGradle = buildGradle.replace(
      /android\s*\{/,
      `android {${signingBlock}`
    );
  }

  // Add signingConfig reference inside the release buildType if not present
  if (!buildGradle.includes('signingConfig signingConfigs.release')) {
    buildGradle = buildGradle.replace(
      /(buildTypes\s*\{[^}]*release\s*\{)/,
      `$1\n            signingConfig signingConfigs.release`
    );
  }

  fs.writeFileSync(buildGradlePath, buildGradle, 'utf8');
  ok('Signing config injected into android/app/build.gradle');
}

// ── Step 6: Gradle build ──────────────────────────────────────────────────────
const buildStep = isRelease ? 6 : 5;
const variant   = isRelease ? 'assembleRelease' : 'assembleDebug';
step(buildStep, `Gradle build — ${variant}`);

const gradlew = IS_WINDOWS ? 'gradlew.bat' : './gradlew';
run(`${gradlew} ${variant}`, ANDROID_DIR, {
  ANDROID_HOME:     androidHome,
  ANDROID_SDK_ROOT: androidHome,
  JAVA_HOME:        process.env.JAVA_HOME || '',
});

// ── Step 7: Copy APK to dist/ ─────────────────────────────────────────────────
const apkSubDir = isRelease ? 'release' : 'debug';
const apkDir = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', apkSubDir);

if (!fs.existsSync(apkDir)) {
  die(`APK output directory not found: ${apkDir}\n  The Gradle build may have succeeded but with a different output path.`);
}

const apkFiles = fs.readdirSync(apkDir).filter(f => f.endsWith('.apk'));
if (apkFiles.length === 0) die(`No APK found in ${apkDir}`);

fs.mkdirSync(DIST_DIR, { recursive: true });
const destName = isRelease ? 'AlSalikPOS-release.apk' : 'AlSalikPOS-debug.apk';
const destApk  = path.join(DIST_DIR, destName);
fs.copyFileSync(path.join(apkDir, apkFiles[0]), destApk);

const sizeMB = (fs.statSync(destApk).size / 1024 / 1024).toFixed(1);

log(`
${LINE}
  BUILD SUCCESSFUL
${LINE}

  APK  : ${destApk}
  Size : ${sizeMB} MB
  Type : ${isRelease ? 'RELEASE (signed)' : 'DEBUG — for development/sideloading'}

  Install on connected device via USB:
    adb install -r "${destApk}"

  Or copy the .apk to the device and open it to install.

  USB thermal printer note:
    This build includes native USB printing support for Android POS
    devices (SUNMI, Zigler, etc.) with the hasPermission pre-check
    and RECEIVER_NOT_EXPORTED fix applied via expo prebuild plugins.

${LINE}
`);
