/**
 * Dynamic Expo config — reads EXPO_PUBLIC_WORK_MODE (set in eas.json per profile)
 * so each mode-locked APK gets its own display name, Android package, and iOS
 * bundle identifier. This lets all 4 APKs coexist on a device during QA.
 *
 * Falls back to the standard/restaurant values when the env var is not set
 * (local Expo Go dev, the multi-mode "preview" build, and the desktop installer).
 */

const { expo: base } = require("./app.json");

const workMode = process.env.EXPO_PUBLIC_WORK_MODE;

const MODE = {
  laundry: {
    name: "Al Salik Laundry",
    androidPackage: "com.alsalikcomputers.pos.laundry",
    bundleId: "com.alsalikcomputers.pos.laundry",
  },
  saloon: {
    name: "Al Salik Saloon",
    androidPackage: "com.alsalikcomputers.pos.saloon",
    bundleId: "com.alsalikcomputers.pos.saloon",
  },
  retail: {
    name: "Al Salik Retail",
    androidPackage: "com.alsalikcomputers.pos.retail",
    bundleId: "com.alsalikcomputers.pos.retail",
  },
  standard: {
    name: "Al Salik POS",
    androidPackage: "com.alsalikcomputers.pos",
    bundleId: "com.alsalikcomputers.pos",
  },
};

const mode = MODE[workMode] ?? MODE.standard;

module.exports = {
  ...base,
  name: mode.name,
  android: {
    ...base.android,
    package: mode.androidPackage,
  },
  ios: {
    ...base.ios,
    bundleIdentifier: mode.bundleId,
  },
};
