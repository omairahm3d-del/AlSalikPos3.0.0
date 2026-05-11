/**
 * This hook is kept for backward compatibility with any components that may
 * import it. The printer-settings screen now manages connection state
 * directly, so this hook simply returns a static "idle" status.
 *
 * USB connection state is managed explicitly via the 3-step flow in
 * printer-settings.tsx: Scan → Connect → Test Print.
 */
import type { UsbPrinterStatus } from "@/lib/usbPrinter";

export function useUsbPrinterStatus(_device: unknown): {
  status: UsbPrinterStatus;
  retry: () => void;
} {
  return { status: "idle", retry: () => {} };
}
