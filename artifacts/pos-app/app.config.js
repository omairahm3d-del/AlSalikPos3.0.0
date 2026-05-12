/**
 * Dynamic Expo config — reads EXPO_PUBLIC_WORK_MODE (set in eas.json per profile)
 * so each mode-locked APK gets its own display name, icon, Android package, and iOS
 * bundle identifier.
 *
 * Falls back to the restaurant values when the env var is not set
 * (Expo Go dev, the multi-mode "preview" build, and the desktop installer).
 */

const { expo: base } = require("./app.json");

const workMode = process.env.EXPO_PUBLIC_WORK_MODE;

const MODE = {
  standard: {
    name: "Al Salik Restaurant",
    androidPackage: "com.alsalikcomputers.pos",
    bundleId: "com.alsalikcomputers.pos",
    icon: "./assets/images/icon-restaurant.png",
  },
  saloon: {
    name: "Al Salik Saloon",
    androidPackage: "com.alsalikcomputers.pos.saloon",
    bundleId: "com.alsalikcomputers.pos.saloon",
    icon: "./assets/images/icon-saloon.png",
  },
  laundry: {
    name: "Al Salik Laundry",
    androidPackage: "com.alsalikcomputers.pos.laundry",
    bundleId: "com.alsalikcomputers.pos.laundry",
    icon: "./assets/images/icon-laundry.png",
  },
  retail: {
    name: "Al Salik Retail",
    androidPackage: "com.alsalikcomputers.pos.retail",
    bundleId: "com.alsalikcomputers.pos.retail",
    icon: "./assets/images/icon-retail.png",
  },
};

const mode = MODE[workMode] ?? MODE.standard;

module.exports = {
  ...base,
  name: mode.name,
  icon: mode.icon,
  splash: {
    ...base.splash,
    image: mode.icon,
  },
  android: {
    ...base.android,
    package: mode.androidPackage,
    adaptiveIcon: {
      foregroundImage: mode.icon,
      backgroundColor: "#0F1117",
    },
  },
  ios: {
    ...base.ios,
    bundleIdentifier: mode.bundleId,
  },
};
