import { NativeModules, Platform } from "react-native";

type ElectronPrinter = {
  name: string;
  displayName: string;
  description?: string;
  isDefault: boolean;
  status?: number;
};

type ElectronAPI = {
  isElectron: true;
  platform: string;
  version: string;
  listPrinters: () => Promise<ElectronPrinter[]>;
  silentPrint: (
    html: string,
    options: { deviceName?: string; paperWidth?: "58mm" | "80mm"; copies?: number }
  ) => Promise<{ ok: boolean; error?: string }>;
  silentPrintRaw?: (
    text: string,
    options: { deviceName?: string; autoCut?: boolean; codepage?: "cp437" | "cp1252" | "ascii" }
  ) => Promise<{ ok: boolean; error?: string }>;
};

declare global {
  interface Window {
    electronPOS?: ElectronAPI;
  }
}

export function getElectronAPI(): ElectronAPI | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined") return null;
  return window.electronPOS ?? null;
}

export const isElectron = (): boolean => !!getElectronAPI();

export async function listWindowsPrinters(): Promise<ElectronPrinter[]> {
  const api = getElectronAPI();
  if (!api) return [];
  try {
    return await api.listPrinters();
  } catch {
    return [];
  }
}

export type PrintOpts = {
  deviceName?: string;
  paperWidth?: "58mm" | "80mm";
  copies?: number;
  rawText?: string;
  rawMode?: boolean;
  autoCut?: boolean;
  codepage?: "cp437" | "cp1252" | "ascii";
  androidDevicePath?: string;
  sunmiEnabled?: boolean;
  networkPrinterIp?: string;
  networkPrinterPort?: number;
  bluetoothAddress?: string;
  usbVendorId?: number;
  usbProductId?: number;
};

// ─── Sunmi SDK ────────────────────────────────────────────────────────────────

function getSunmiNative(): any | null {
  try {
    const { SunmiPrinter } = NativeModules;
    return SunmiPrinter ?? null;
  } catch {
    return null;
  }
}

export async function isSunmiDevice(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const sdk = getSunmiNative();
    if (!sdk?.hasPrinter) return false;
    return await sdk.hasPrinter();
  } catch {
    return false;
  }
}

export async function printWithSunmiSDK(
  text: string,
  opts: { autoCut?: boolean } = {},
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const sdk = getSunmiNative();
  if (!sdk) return false;
  try {
    sdk.printerInit();
    // Send as ESC/POS raw data — most reliable across all Sunmi models
    const payload = buildEscPosBytes(text, opts.autoCut !== false);
    const b64 = Buffer.from(payload, "binary").toString("base64");
    sdk.sendRAWData(b64);
    return true;
  } catch (e: any) {
    console.warn("[printBridge] Sunmi SDK print failed:", e?.message ?? e);
    return false;
  }
}

export async function sunmiTestPrint(autoCut = true): Promise<boolean> {
  const text = `SUNMI PRINTER TEST\n${new Date().toLocaleString("en-GB")}\n--------------------------------\nPrinter is working correctly.\n--------------------------------\n`;
  return printWithSunmiSDK(text, { autoCut });
}

function buildEscPosBytes(text: string, autoCut: boolean): string {
  const ESC = "\x1B";
  const GS = "\x1D";
  const init = ESC + "@";
  const leftAlign = ESC + "a\x00";
  const feeds = "\n\n\n";
  const cut = autoCut ? GS + "V\x00" : "\n\n\n";
  return init + leftAlign + text + feeds + cut;
}

export const ANDROID_PRINTER_PATHS = [
  "/dev/prnt",
  "/dev/usb/lp0",
  // Dukkantek / SmartPos (MediaTek-based Android POS terminals, UAE market)
  "/dev/ttyHSL0",
  "/dev/ttyHSL1",
  "/dev/ttyMT0",
  "/dev/ttyMT1",
  "/dev/ttyACM0",
  "/dev/ttyACM1",
  // Standard serial ports
  "/dev/ttyS0",
  "/dev/ttyS1",
  "/dev/ttyS2",
  "/dev/ttyS3",
  "/dev/ttyS4",
  "/dev/ttyS5",
  // Rockchip / Sunmy
  "/dev/ttyXR0",
  "/dev/ttyXR1",
  "/dev/ttyAMA0",
  "/dev/ttyAML1",
  // USB serial
  "/dev/ttyUSB0",
  "/dev/ttyUSB1",
  // Generic names
  "/dev/thermal_printer",
  "/dev/tp",
  "/dev/printer",
  "/dev/bprint",
];

export async function printAndroidDevice(
  text: string,
  opts: { devicePath?: string; autoCut?: boolean } = {}
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const path = opts.devicePath?.trim() || "/dev/prnt";
  const RNFS = require("react-native-fs");
  const payload = buildEscPosBytes(text, opts.autoCut !== false);
  const b64 = Buffer.from(payload, "binary").toString("base64");
  // Try writeFile first; fall back to appendFile which works better on
  // character device nodes (avoids O_TRUNC which can fail on /dev/* paths).
  try {
    await RNFS.writeFile(path, b64, "base64");
    return true;
  } catch {
    try {
      await RNFS.appendFile(path, b64, "base64");
      return true;
    } catch (e: any) {
      console.warn("[printBridge] Android device print failed:", e?.message ?? e);
      return false;
    }
  }
}

export async function detectAndroidPrinterPath(
  autoCut = true,
): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const RNFS = require("react-native-fs");
  const testText = `AL SALIK POS\nPrinter detected!\n${new Date().toLocaleString("en-GB")}\n`;
  for (const path of ANDROID_PRINTER_PATHS) {
    try {
      const payload = buildEscPosBytes(testText, autoCut);
      const b64 = Buffer.from(payload, "binary").toString("base64");
      await RNFS.writeFile(path, b64, "base64");
      return path;
    } catch {
      // try next
    }
  }
  return null;
}

// ─── Network / WiFi Printer (raw TCP port 9100) ───────────────────────────────

export async function printNetworkPrinter(
  text: string,
  ip: string,
  port = 9100,
  autoCut = true,
): Promise<boolean> {
  if (!ip?.trim()) return false;
  try {
    const TcpSocket = require("react-native-tcp-socket");
    const payload = buildEscPosBytes(text, autoCut);
    const bytes = Buffer.from(payload, "binary");
    return await new Promise<boolean>((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; try { client.destroy(); } catch {} resolve(false); } }, 6000);
      const client = TcpSocket.createConnection({ host: ip.trim(), port }, () => {
        client.write(bytes);
        setTimeout(() => { try { client.destroy(); } catch {} }, 300);
        if (!done) { done = true; clearTimeout(timer); resolve(true); }
      });
      client.on("error", () => { if (!done) { done = true; clearTimeout(timer); resolve(false); } });
    });
  } catch (e: any) {
    console.warn("[printBridge] Network print failed:", e?.message ?? e);
    return false;
  }
}

export async function testNetworkPrinter(ip: string, port = 9100, autoCut = true): Promise<boolean> {
  const text = `AL SALIK POS\nNetwork Printer Test\n${new Date().toLocaleString("en-GB")}\n--------------------------------\nPrinter connected!\n--------------------------------\n`;
  return printNetworkPrinter(text, ip, port, autoCut);
}

// ─── Bluetooth Printer (ESC/POS) ──────────────────────────────────────────────

export type BluetoothDevice = { name: string; address: string };

/** Matches a valid Bluetooth MAC address, e.g. "A1:B2:C3:D4:E5:F6" */
const BT_MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

/** Device names that are never real ESC/POS printers — filter them out. */
const VIRTUAL_PRINTER_NAMES = new Set([
  "built-in printer",
  "built-inprinter",
  "virtual printer",
  "microsoft print to pdf",
  "microsoft xps document writer",
  "fax",
  "onenote",
  "adobe pdf",
]);

export async function listBluetoothDevices(): Promise<BluetoothDevice[]> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return [];
  try {
    const { BluetoothManager } = require("react-native-bluetooth-escpos-printer");
    const raw = await BluetoothManager.enableBluetooth();
    if (!Array.isArray(raw)) return [];
    return raw
      .map((d: any) => {
        try { return typeof d === "string" ? JSON.parse(d) : d; } catch { return null; }
      })
      .filter((d: any) => {
        if (!d?.address) return false;
        // Keep only real Bluetooth devices with valid MAC addresses
        if (!BT_MAC_RE.test(d.address)) return false;
        // Drop known virtual/system printer names
        const nameLower = (d.name ?? "").toLowerCase().trim();
        if (VIRTUAL_PRINTER_NAMES.has(nameLower)) return false;
        return true;
      })
      .map((d: any) => ({ name: d.name || d.address, address: d.address }));
  } catch (e: any) {
    console.warn("[printBridge] BT list failed:", e?.message ?? e);
    return [];
  }
}

export async function connectBluetoothPrinter(address: string): Promise<boolean> {
  try {
    const { BluetoothManager } = require("react-native-bluetooth-escpos-printer");
    await BluetoothManager.connect(address);
    return true;
  } catch (e: any) {
    console.warn("[printBridge] BT connect failed:", e?.message ?? e);
    return false;
  }
}

export async function printBluetoothPrinter(
  text: string,
  address: string,
  autoCut = true,
): Promise<boolean> {
  if (!address?.trim()) return false;
  try {
    const { BluetoothEscposPrinter, BluetoothManager } = require("react-native-bluetooth-escpos-printer");
    await BluetoothManager.connect(address);
    const payload = buildEscPosBytes(text, autoCut);
    await BluetoothEscposPrinter.printRaw(payload);
    return true;
  } catch (e: any) {
    console.warn("[printBridge] BT print failed:", e?.message ?? e);
    return false;
  }
}

/** Like testBluetoothPrinter but returns the actual error message on failure. */
export async function testBluetoothPrinterDiag(
  address: string,
  autoCut = true,
): Promise<{ ok: boolean; errorMsg?: string }> {
  if (!address?.trim()) return { ok: false, errorMsg: "No printer address selected." };
  const text = `AL SALIK POS\nBluetooth Printer Test\n${new Date().toLocaleString("en-GB")}\n--------------------------------\nPrinter connected!\n--------------------------------\n`;
  try {
    const { BluetoothEscposPrinter, BluetoothManager } = require("react-native-bluetooth-escpos-printer");
    await BluetoothManager.connect(address);
    const payload = buildEscPosBytes(text, autoCut);
    await BluetoothEscposPrinter.printRaw(payload);
    return { ok: true };
  } catch (e: any) {
    const raw: string = e?.message ?? String(e) ?? "Unknown error";
    return { ok: false, errorMsg: raw };
  }
}

export async function testBluetoothPrinter(address: string, autoCut = true): Promise<boolean> {
  const { ok } = await testBluetoothPrinterDiag(address, autoCut);
  return ok;
}

export async function printRawText(text: string, opts: { deviceName?: string; autoCut?: boolean; codepage?: "cp437" | "cp1252" | "ascii" } = {}): Promise<boolean> {
  const api = getElectronAPI();
  if (!api || !api.silentPrintRaw || !opts.deviceName) return false;
  const res = await api.silentPrintRaw(text, opts);
  return !!res.ok;
}

export async function printHtml(html: string, opts: PrintOpts = {}): Promise<boolean> {
  // Sunmi SDK — highest priority on Android when enabled
  if (Platform.OS === "android" && opts.sunmiEnabled && opts.rawText) {
    const ok = await printWithSunmiSDK(opts.rawText, { autoCut: opts.autoCut });
    if (ok) return true;
  }

  // Android built-in serial/USB device path
  if (Platform.OS === "android" && opts.androidDevicePath && opts.rawText) {
    const ok = await printAndroidDevice(opts.rawText, {
      devicePath: opts.androidDevicePath,
      autoCut: opts.autoCut,
    });
    if (ok) return true;
  }

  // Network / WiFi printer (TCP raw port 9100)
  if (opts.networkPrinterIp && opts.rawText) {
    const ok = await printNetworkPrinter(opts.rawText, opts.networkPrinterIp, opts.networkPrinterPort ?? 9100, opts.autoCut ?? true);
    if (ok) return true;
  }

  // Bluetooth printer
  if (opts.bluetoothAddress && opts.rawText) {
    const ok = await printBluetoothPrinter(opts.rawText, opts.bluetoothAddress, opts.autoCut ?? true);
    if (ok) return true;
  }

  // USB OTG thermal printer (Android only, text/ESC-POS mode)
  if (Platform.OS === "android" && opts.usbVendorId != null && opts.rawText) {
    try {
      const { connectUsbPrinter, printUsbText } = require("./usbPrinter") as typeof import("./usbPrinter");
      const connected = await connectUsbPrinter({ vendorId: opts.usbVendorId, productId: opts.usbProductId ?? 0 });
      if (connected) {
        const ok = await printUsbText(opts.rawText, { autoCut: opts.autoCut ?? true });
        if (ok) return true;
      }
    } catch (e: any) {
      console.warn("[printBridge] USB text print failed:", e?.message ?? e);
    }
  }

  const api = getElectronAPI();
  if (api && opts.rawMode && opts.rawText && api.silentPrintRaw && opts.deviceName) {
    const r = await api.silentPrintRaw(opts.rawText, { deviceName: opts.deviceName, autoCut: opts.autoCut, codepage: opts.codepage });
    if (r.ok) return true;
  }
  if (api && opts.deviceName) {
    const res = await api.silentPrint(html, opts);
    if (res.ok) return true;
  }
  if (Platform.OS === "web") {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return false;
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      try { w.print(); } catch {}
    }, 200);
    return true;
  }
  try {
    const Print = await import("expo-print");
    await Print.printAsync({ html });
    return true;
  } catch {
    return false;
  }
}
