import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import type { UsbDevice, UsbPrinterStatus } from "@/lib/usbPrinter";

export function useUsbPrinterStatus(device: UsbDevice | null): {
  status: UsbPrinterStatus;
  retry: () => void;
} {
  const [status, setStatus] = useState<UsbPrinterStatus>("idle");
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (!device || Platform.OS !== "android") {
      setStatus("idle");
      return;
    }
    if (checkingRef.current) return;
    checkingRef.current = true;
    setStatus("connecting");
    try {
      const { getPrinterStatus } = await import("@/lib/usbPrinter");
      const s = await getPrinterStatus(device);
      setStatus(s);
    } catch {
      setStatus("disconnected");
    } finally {
      checkingRef.current = false;
    }
  }, [device]);

  // Only run on explicit retry — not on mount — to avoid disrupting the
  // USB session with repeated connectPrinter calls before the user has
  // granted permission or selected a device.
  // Status starts as "idle" and the user taps "Retry Connection" to check.
  useEffect(() => {
    if (!device) setStatus("idle");
  }, [device]);

  return { status, retry: check };
}
