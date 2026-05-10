export type UsbDevice = {
  vendorId: number;
  productId: number;
  deviceId?: number;
  deviceName?: string;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
};

export async function listUsbPrinters(): Promise<UsbDevice[]> { return []; }
export async function connectUsbPrinter(_device: UsbDevice): Promise<boolean> { return false; }
export async function disconnectUsbPrinter(): Promise<void> {}
export async function printUsbText(_text: string, _opts?: { autoCut?: boolean }): Promise<boolean> { return false; }
export async function printUsbBitmap(_base64Png: string, _paperWidth: "58mm" | "80mm", _opts?: { autoCut?: boolean }): Promise<boolean> { return false; }
export async function testUsbPrinter(_device: UsbDevice, _autoCut?: boolean): Promise<boolean> { return false; }
