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
 * Convert raw bytes to a base64 string suitable for printRaw().
 * printRaw() calls printRawData() directly — no EPToolkit re-encoding.
 */
function bytesToBase64(bytes: number[]): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b & 0xff);
  return btoa(binary);
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
 *   On subsequent calls for the same device (permission already granted),
 *   no dialog is shown and the native mUsbDevice is confirmed immediately.
 *
 *   Therefore: do NOT call printBill() immediately after this function ON
 *   FIRST USE. On subsequent uses (permission already granted) it is safe.
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

/**
 * Send plain text to the USB printer.
 *
 * CRITICAL: Pass PLAIN TEXT only — do NOT pre-encode ESC/POS control bytes.
 * The library's printBill() runs text through EPToolkit.exchange_text() which
 * adds its own ESC/POS framing (init, cut, line feeds). If you pass raw binary
 * control characters they get double-encoded and the printer receives garbage.
 *
 * Caller must have already called connectUsbPrinter() so that mUsbDevice is
 * set in the native layer. openConnection() needs mUsbDevice != null to open
 * the bulk USB endpoint.
 */
export async function printUsbText(
  text: string,
  opts: { autoCut?: boolean } = {},
): Promise<boolean> {
  const printer = getUSBPrinter();
  if (!printer) return false;
  try {
    // printBill() internally calls:
    //   billTo64Buffer(text, opts) → EPToolkit.exchange_text() → base64
    //   RNUSBPrinter.printRawData(base64, errorCallback)
    //
    // printRawData is fire-and-forget (not a real Promise); errors go to
    // errorCallback which just console.warns. We can't await the actual USB
    // transfer result. Give the print thread enough time to finish.
    printer.printBill(text, {
      beep: false,
      cut: opts.autoCut !== false,
      encoding: "UTF8",
      tailingLine: true,
    });
    // Wait for the background thread in printRawData to complete the bulkTransfer
    await new Promise<void>((r) => setTimeout(r, 600));
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
      // Use printBill with empty text + cut=true so EPToolkit emits the cut
      // command properly — never send raw ESC/POS bytes through printBill.
      printer.printBill("\n", {
        beep: false,
        cut: true,
        encoding: "UTF8",
        tailingLine: false,
      });
      await new Promise<void>((r) => setTimeout(r, 400));
    }
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] printImageBase64:", e?.message ?? e);
    return false;
  }
}

/**
 * Send cash drawer open ESC/POS command via printRaw().
 *
 * printRaw() calls printRawData() directly with base64 data — it does NOT
 * go through EPToolkit, so binary ESC/POS bytes are safe to use here.
 *
 * ESC p m t1 t2:  0x1B 0x70 0x00 0x19 0xFA
 *   pin=0 (pin 2), on-pulse=25×2ms=50ms, off-pulse=250×2ms=500ms
 */
export async function openUsbCashDrawer(device: UsbDevice): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const printer = getUSBPrinter();
  if (!printer) return false;
  const connected = await connectUsbPrinter(device);
  if (!connected) return false;
  try {
    // Build raw drawer-kick bytes and base64-encode for printRaw()
    const drawerBytes = [0x1b, 0x70, 0x00, 0x19, 0xfa];
    const base64 = bytesToBase64(drawerBytes);
    printer.printRaw(base64);
    await new Promise<void>((r) => setTimeout(r, 300));
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] cashDrawer:", e?.message ?? e);
    return false;
  }
}

/**
 * Print a test page.
 *
 * Calls connectUsbPrinter() first — on second call (permission already granted
 * from the Connect step) the native layer resolves immediately and confirms
 * mUsbDevice, so printRawData's openConnection() will succeed.
 */
export async function testUsbPrinter(
  device: UsbDevice,
  autoCut = true,
): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  // Re-connect: permission was already granted in Step 2, so selectDevice()
  // resolves synchronously this time and confirms mUsbDevice in the native layer.
  const connected = await connectUsbPrinter(device);
  if (!connected) {
    console.warn("[usbPrinter] testUsbPrinter: connectUsbPrinter failed");
    return false;
  }

  // Brief pause so the native openConnection() call in printRawData finds
  // mUsbDevice already set before trying bulkTransfer.
  await new Promise<void>((r) => setTimeout(r, 400));

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
