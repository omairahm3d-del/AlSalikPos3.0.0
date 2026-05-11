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
 * Initialise the USB subsystem. On Android this triggers the OS
 * permission dialog for the attached USB device.  Must be called
 * before getDeviceList / connectPrinter.
 */
async function initUsb(): Promise<boolean> {
  const printer = getUSBPrinter();
  if (!printer) return false;
  try {
    await printer.init();
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] init:", e?.message ?? e);
    return false;
  }
}

export async function listUsbPrinters(): Promise<UsbDevice[]> {
  const printer = getUSBPrinter();
  if (!printer) return [];
  try {
    await printer.init();
    const devs: Array<{ vendor_id: string; product_id: string; device_name?: string }> =
      await printer.getDeviceList();
    if (!Array.isArray(devs)) return [];
    return devs.map((d) => ({
      vendorId: parseInt(d.vendor_id, 10),
      productId: parseInt(d.product_id, 10),
      productName: d.device_name,
    }));
  } catch (e: any) {
    console.warn("[usbPrinter] list:", e?.message ?? e);
    return [];
  }
}

export async function connectUsbPrinter(device: UsbDevice): Promise<boolean> {
  const printer = getUSBPrinter();
  if (!printer) return false;
  try {
    await printer.init();
    await printer.connectPrinter(
      String(device.vendorId),
      String(device.productId),
    );
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] connect:", e?.message ?? e);
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
 * Lightweight connectivity check. Returns the current printer status.
 */
export async function getPrinterStatus(
  device: UsbDevice,
): Promise<UsbPrinterStatus> {
  if (Platform.OS !== "android") return "idle";
  const printer = getUSBPrinter();
  if (!printer) return "idle";
  try {
    await printer.init();
    await printer.connectPrinter(
      String(device.vendorId),
      String(device.productId),
    );
    return "connected";
  } catch (e: any) {
    const msg: string = e?.message ?? "";
    if (msg.toLowerCase().includes("permission")) return "permission_denied";
    return "disconnected";
  }
}

const ESC = "\x1b";
const GS = "\x1d";

function buildEscPos(text: string, autoCut: boolean): string {
  const init = ESC + "@";
  const leftAlign = ESC + "a\x00";
  const feeds = "\n\n\n";
  const cut = autoCut ? GS + "V\x00" : "\n\n\n";
  return init + leftAlign + text + feeds + cut;
}

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
    console.warn("[usbPrinter] text print:", e?.message ?? e);
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
    console.warn("[usbPrinter] bitmap print:", e?.message ?? e);
    return false;
  }
}

/**
 * Sends the ESC/POS cash drawer open command.
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
    console.warn("[usbPrinter] cash drawer:", e?.message ?? e);
    return false;
  }
}

export async function testUsbPrinter(
  device: UsbDevice,
  autoCut = true,
): Promise<boolean> {
  const connected = await connectUsbPrinter(device);
  if (!connected) return false;
  const label =
    device.productName ||
    device.manufacturerName ||
    `VID:${device.vendorId} PID:${device.productId}`;
  return printUsbText(
    `AL SALIK POS\n` +
      `USB OTG Printer Test\n` +
      `${new Date().toLocaleString("en-GB")}\n` +
      `--------------------------------\n` +
      `Printer connected via OTG USB!\n` +
      `${label}\n` +
      `Vendor ID : ${device.vendorId}\n` +
      `Product ID: ${device.productId}\n` +
      `--------------------------------\n`,
    { autoCut },
  );
}
