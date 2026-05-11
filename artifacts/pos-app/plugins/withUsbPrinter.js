const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const USB_DEVICE_FILTER_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <!-- Match any USB device so the app is offered for all ESC/POS printers -->
  <usb-device />
</resources>
`;

function withUsbDeviceFilterXml(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }
      const xmlPath = path.join(xmlDir, "usb_device_filter.xml");
      fs.writeFileSync(xmlPath, USB_DEVICE_FILTER_XML, "utf8");
      return config;
    },
  ]);
}

function withUsbManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // 1. Add <uses-feature android:name="android.hardware.usb.host" />
    if (!manifest["uses-feature"]) manifest["uses-feature"] = [];
    const hasUsbHost = manifest["uses-feature"].some(
      (f) => f.$?.["android:name"] === "android.hardware.usb.host",
    );
    if (!hasUsbHost) {
      manifest["uses-feature"].push({
        $: {
          "android:name": "android.hardware.usb.host",
          "android:required": "true",
        },
      });
    }

    // 2. Find the main activity and add USB_DEVICE_ATTACHED intent-filter + meta-data
    const app = manifest.application?.[0];
    if (!app) return config;
    const activities = app.activity ?? [];
    const mainActivity = activities.find((a) => {
      const filters = a?.["intent-filter"] ?? [];
      return filters.some((f) =>
        (f.action ?? []).some(
          (act) =>
            act.$?.["android:name"] === "android.intent.action.MAIN",
        ),
      );
    });

    if (!mainActivity) return config;

    // Add USB_DEVICE_ATTACHED intent-filter if not already present
    const usbFilter = (mainActivity["intent-filter"] ?? []).find((f) =>
      (f.action ?? []).some(
        (a) =>
          a.$?.["android:name"] ===
          "android.hardware.usb.action.USB_DEVICE_ATTACHED",
      ),
    );
    if (!usbFilter) {
      mainActivity["intent-filter"] = [
        ...(mainActivity["intent-filter"] ?? []),
        {
          action: [
            {
              $: {
                "android:name":
                  "android.hardware.usb.action.USB_DEVICE_ATTACHED",
              },
            },
          ],
        },
      ];
    }

    // Add meta-data for USB device filter resource
    const existingMeta = (mainActivity["meta-data"] ?? []).find(
      (m) =>
        m.$?.["android:name"] ===
        "android.hardware.usb.action.USB_DEVICE_ATTACHED",
    );
    if (!existingMeta) {
      mainActivity["meta-data"] = [
        ...(mainActivity["meta-data"] ?? []),
        {
          $: {
            "android:name":
              "android.hardware.usb.action.USB_DEVICE_ATTACHED",
            "android:resource": "@xml/usb_device_filter",
          },
        },
      ];
    }

    return config;
  });
}

module.exports = function withUsbPrinter(config) {
  config = withUsbDeviceFilterXml(config);
  config = withUsbManifest(config);
  return config;
};
