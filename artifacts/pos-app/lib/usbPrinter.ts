import { Platform } from "react-native";

export type UsbDevice = {
  vendorId: number;
  productId: number;
  deviceId?: number;
  deviceName?: string;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
};

export type UsbPrinterStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "permission_denied";

/**
 * Known USB thermal printer vendor IDs.
 * Used to label detected devices in the UI.
 */
export const KNOWN_PRINTER_VENDORS: Record<number, string> = {
  0x04b8: "Epson",
  0x0519: "Star Micronics",
  0x154f: "POS-X",
  0x1cb0: "Synapse",
  0x20d1: "Bixolon",
  0x1504: "Bixolon",
  0x0416: "Xprinter / Zigler",
  0x6868: "ESC/POS Thermal Printer",
  0x0dd4: "Custom SPA",
  0x0483: "STMicro ESC/POS",
  0x0fe6: "Sunmi USB Printer",
  0x067b: "Prolific USB-Serial",
  0x28e9: "GD32 ESC/POS",
  0x0456: "Analog Devices",
  0x2730: "Rongta",
  0x1fc9: "NXP / Sewoo",
  0x0525: "Netchip / Sewoo",
  0x4b43: "Citizen",
};

export function getVendorName(vendorId: number): string {
  return (
    KNOWN_PRINTER_VENDORS[vendorId] ??
    `0x${vendorId.toString(16).toUpperCase().padStart(4, "0")}`
  );
}

export function isProbablyPrinter(device: UsbDevice): boolean {
  return device.vendorId in KNOWN_PRINTER_VENDORS;
}

function getUSBPrinter(): any | null {
  if (Platform.OS !== "android") return null;
  try {
    const m = require("react-native-thermal-receipt-printer-image-qr");
    const mod = m?.default ?? m;
    return mod?.USBPrinter ?? null;
  } catch {
    return null;
  }
}

/**
 * Module-level init flag.
 *
 * The native init() registers a BroadcastReceiver for USB events.
 * Calling it twice registers duplicate receivers and can cause issues.
 * We call it at most once per JS session via ensureInit().
 */
let _usbInitialized = false;

async function ensureInit(): Promise<boolean> {
  if (_usbInitialized) return true;
  const printer = getUSBPrinter();
  if (!printer) return false;
  try {
    await printer.init();
    _usbInitialized = true;
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] init error:", e?.message ?? e);
    return false;
  }
}

/** Force a fresh init (e.g. after printer disconnected). */
export function resetUsbInit(): void {
  _usbInitialized = false;
}

/**
 * Initialise the USB host manager and return all connected USB devices.
 *
 * This is Step 1 of the setup flow. Call once when the user taps "Scan".
 * Does NOT show a permission dialog — listing devices requires no permission.
 */
export async function initAndScanUsbDevices(): Promise<UsbDevice[]> {
  if (Platform.OS !== "android") return [];
  const ok = await ensureInit();
  if (!ok) return [];
  const printer = getUSBPrinter();
  if (!printer) return [];
  try {
    const devs: Array<{
      vendor_id: string;
      product_id: string;
      device_name?: string;
    }> = await printer.getDeviceList();
    if (!Array.isArray(devs)) return [];
    return devs.map((d) => ({
      vendorId: parseInt(d.vendor_id, 10),
      productId: parseInt(d.product_id, 10),
      productName: d.device_name,
    }));
  } catch (e: any) {
    console.warn("[usbPrinter] getDeviceList:", e?.message ?? e);
    return [];
  }
}

/**
 * Connect to a USB printer. Shows the Android "Allow USB access?" dialog
 * on the first call for this device.
 *
 * IMPORTANT — TIMING:
 *   The native connectPrinter() calls Android's UsbManager.requestPermission()
 *   which is ASYNCHRONOUS. The JS promise resolves immediately, BEFORE the
 *   user sees or taps the dialog. The BroadcastReceiver sets mUsbDevice only
 *   AFTER the user taps Allow.
 *
 *   Therefore: do NOT call printBill() immediately after this function.
 *   Call it only on a SEPARATE user action (e.g. a button tap) so that the
 *   modal dialog has been dismissed and mUsbDevice has been set.
 *
 *   On subsequent calls for the same device (permission already granted),
 *   no dialog is shown and it is safe to print immediately after.
 */
export async function connectUsbPrinter(device: UsbDevice): Promise<boolean> {
  const printer = getUSBPrinter();
  if (!printer) return false;
  const inited = await ensureInit();
  if (!inited) return false;
  try {
    await printer.connectPrinter(
      String(device.vendorId),
      String(device.productId),
    );
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] connectPrinter:", e?.message ?? e);
    return false;
  }
}

export async function disconnectUsbPrinter(): Promise<void> {
  const printer = getUSBPrinter();
  if (!printer) return;
  try {
    if (typeof printer.closeConn === "function") await printer.closeConn();
  } catch {
    // ignore
  }
}

const ESC = "\x1b";
const GS = "\x1d";

function buildEscPos(text: string, autoCut: boolean): string {
  const initCmd = ESC + "@";
  const leftAlign = ESC + "a\x00";
  const feeds = "\n\n\n";
  const cut = autoCut ? GS + "V\x00" : "\n\n\n";
  return initCmd + leftAlign + text + feeds + cut;
}

/**
 * Send plain text to the printer using ESC/POS commands.
 * Caller must have already called connectUsbPrinter() in a prior user action.
 */
export async function printUsbText(
  text: string,
  opts: { autoCut?: boolean } = {},
): Promise<boolean> {
  const printer = getUSBPrinter();
  if (!printer) return false;
  try {
    const escpos = buildEscPos(text, opts.autoCut !== false);
    await printer.printBill(escpos);
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] printBill:", e?.message ?? e);
    return false;
  }
}

export async function printUsbBitmap(
  base64Png: string,
  paperWidth: "58mm" | "80mm",
  opts: { autoCut?: boolean } = {},
): Promise<boolean> {
  const printer = getUSBPrinter();
  if (!printer) return false;
  try {
    const imageWidth = paperWidth === "58mm" ? 384 : 576;
    await printer.printImageBase64(base64Png, { imageWidth });
    if (opts.autoCut !== false) {
      const cutCmd = ESC + "@" + "\n\n\n" + GS + "V\x00";
      await printer.printBill(cutCmd);
    }
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] printImageBase64:", e?.message ?? e);
    return false;
  }
}

/**
 * Send cash drawer open ESC/POS command.
 * Connects first (silent if already permitted).
 */
export async function openUsbCashDrawer(device: UsbDevice): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const connected = await connectUsbPrinter(device);
  if (!connected) return false;
  const printer = getUSBPrinter();
  if (!printer) return false;
  try {
    // ESC p m t1 t2 — pin 2, pulse width 25ms/250ms
    const drawerCmd = ESC + "\x70\x00\x19\xfa";
    await printer.printBill(drawerCmd);
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] cashDrawer:", e?.message ?? e);
    return false;
  }
}

/**
 * Print a test page.
 *
 * Does NOT call connectUsbPrinter() — caller must have already called it
 * as a SEPARATE user action (so the Android permission dialog was shown and
 * dismissed before this runs). Calling connectPrinter + printBill back-to-back
 * fails because connectPrinter resolves before the dialog is even shown.
 */
export async function testUsbPrinter(
  device: UsbDevice,
  autoCut = true,
): Promise<boolean> {
  const label =
    device.productName ||
    getVendorName(device.vendorId) ||
    `VID:${device.vendorId} PID:${device.productId}`;
  return printUsbText(
    `AL SALIK POS\n` +
      `USB Printer Test\n` +
      `${new Date().toLocaleString("en-GB")}\n` +
      `--------------------------------\n` +
      `USB connection OK!\n` +
      `${label}\n` +
      `Vendor ID : ${device.vendorId}\n` +
      `Product ID: ${device.productId}\n` +
      `--------------------------------\n`,
    { autoCut },
  );
}

/** @deprecated Use initAndScanUsbDevices() instead */
export async function requestUsbPermission(): Promise<boolean> {
  return ensureInit();
}

/** @deprecated Use initAndScanUsbDevices() instead */
export async function scanUsbDevices(): Promise<UsbDevice[]> {
  return initAndScanUsbDevices();
}

/** @deprecated Use initAndScanUsbDevices() instead */
export async function listUsbPrinters(): Promise<UsbDevice[]> {
  return initAndScanUsbDevices();
}
