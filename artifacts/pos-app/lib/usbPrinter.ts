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

function getModule(): any | null {
  if (Platform.OS !== "android") return null;
  try {
    const m = require("react-native-thermal-receipt-printer-image-qr");
    return m?.default ?? m;
  } catch {
    return null;
  }
}

export async function listUsbPrinters(): Promise<UsbDevice[]> {
  const mod = getModule();
  if (!mod) return [];
  try {
    const devs = await mod.getUSBDeviceList();
    return Array.isArray(devs) ? devs : [];
  } catch (e: any) {
    console.warn("[usbPrinter] list:", e?.message ?? e);
    return [];
  }
}

export async function connectUsbPrinter(device: UsbDevice): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    await mod.connectPrinter("USB", {
      vendorId: device.vendorId,
      productId: device.productId,
      ...(device.deviceId != null ? { deviceId: device.deviceId } : {}),
    });
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] connect:", e?.message ?? e);
    return false;
  }
}

export async function disconnectUsbPrinter(): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    if (typeof mod.closeConn === "function") await mod.closeConn();
  } catch {
    // ignore
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
  const mod = getModule();
  if (!mod) return false;
  try {
    await mod.printBill(buildEscPos(text, opts.autoCut !== false));
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
  const mod = getModule();
  if (!mod) return false;
  try {
    const imageWidth = paperWidth === "58mm" ? 384 : 576;
    await mod.printBill(base64Png, { imageWidth, customWidth: true });
    if (opts.autoCut !== false) {
      await mod.printBill(ESC + "@" + "\n\n\n" + GS + "V\x00");
    }
    return true;
  } catch (e: any) {
    console.warn("[usbPrinter] bitmap print:", e?.message ?? e);
    return false;
  }
}

export async function testUsbPrinter(device: UsbDevice, autoCut = true): Promise<boolean> {
  const connected = await connectUsbPrinter(device);
  if (!connected) return false;
  const label = device.productName || device.manufacturerName || `VID:${device.vendorId} PID:${device.productId}`;
  return printUsbText(
    `AL SALIK POS\nUSB OTG Printer Test\n${new Date().toLocaleString("en-GB")}\n--------------------------------\nPrinter connected via OTG USB!\n${label}\nVendor ID : ${device.vendorId}\nProduct ID: ${device.productId}\n--------------------------------\n`,
    { autoCut },
  );
}
