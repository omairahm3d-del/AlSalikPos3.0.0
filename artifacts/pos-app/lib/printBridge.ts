import { Platform } from "react-native";

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
};

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
  "/dev/ttyS1",
  "/dev/ttyS2",
  "/dev/ttyS3",
  "/dev/printer",
  "/dev/bprint",
  "/dev/ttyUSB0",
];

export async function printAndroidDevice(
  text: string,
  opts: { devicePath?: string; autoCut?: boolean } = {}
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const path = opts.devicePath?.trim() || "/dev/prnt";
  try {
    const RNFS = require("react-native-fs");
    const payload = buildEscPosBytes(text, opts.autoCut !== false);
    const b64 = Buffer.from(payload, "binary").toString("base64");
    await RNFS.writeFile(path, b64, "base64");
    return true;
  } catch (e: any) {
    console.warn("[printBridge] Android device print failed:", e?.message ?? e);
    return false;
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

export async function printRawText(text: string, opts: { deviceName?: string; autoCut?: boolean; codepage?: "cp437" | "cp1252" | "ascii" } = {}): Promise<boolean> {
  const api = getElectronAPI();
  if (!api || !api.silentPrintRaw || !opts.deviceName) return false;
  const res = await api.silentPrintRaw(text, opts);
  return !!res.ok;
}

export async function printHtml(html: string, opts: PrintOpts = {}): Promise<boolean> {
  if (Platform.OS === "android" && opts.androidDevicePath && opts.rawText) {
    const ok = await printAndroidDevice(opts.rawText, {
      devicePath: opts.androidDevicePath,
      autoCut: opts.autoCut,
    });
    if (ok) return true;
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
