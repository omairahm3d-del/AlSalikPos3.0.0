import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
} from "react";
import { Platform } from "react-native";
import UsbReceiptCapture, {
  type UsbReceiptCaptureHandle,
} from "@/components/UsbReceiptCapture";
import type { PrinterSettings } from "@/types";

interface UsbPrintContextValue {
  captureAndPrintBitmap: (
    html: string,
    ps: PrinterSettings,
  ) => Promise<boolean>;
}

const UsbPrintContext = createContext<UsbPrintContextValue | null>(null);

export function UsbPrintProvider({ children }: { children: React.ReactNode }) {
  const captureRef = useRef<UsbReceiptCaptureHandle>(null);

  const captureAndPrintBitmap = useCallback(
    async (html: string, ps: PrinterSettings): Promise<boolean> => {
      if (Platform.OS !== "android") return false;
      if (!ps.usbPrinterEnabled || ps.usbPrinterVendorId == null) return false;
      if (!captureRef.current) return false;
      try {
        const base64 = await captureRef.current.capture(
          html,
          ps.paperWidth ?? "80mm",
        );
        if (!base64) return false;
        const { connectUsbPrinter, printUsbBitmap } = await import(
          "@/lib/usbPrinter"
        );
        const connected = await connectUsbPrinter({
          vendorId: ps.usbPrinterVendorId,
          productId: ps.usbPrinterProductId ?? 0,
        });
        if (!connected) return false;
        return printUsbBitmap(base64, ps.paperWidth ?? "80mm", {
          autoCut: ps.autoCutPaper !== false,
        });
      } catch (e: any) {
        console.warn("[UsbPrint] captureAndPrintBitmap:", e?.message ?? e);
        return false;
      }
    },
    [],
  );

  return (
    <UsbPrintContext.Provider value={{ captureAndPrintBitmap }}>
      {children}
      <UsbReceiptCapture ref={captureRef} />
    </UsbPrintContext.Provider>
  );
}

export function useUsbPrint(): UsbPrintContextValue {
  const ctx = useContext(UsbPrintContext);
  if (!ctx) throw new Error("useUsbPrint must be used within UsbPrintProvider");
  return ctx;
}
