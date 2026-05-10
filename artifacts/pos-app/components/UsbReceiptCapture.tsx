import React, { forwardRef, useImperativeHandle } from "react";

export type UsbReceiptCaptureHandle = {
  capture: (html: string, paperWidth: "58mm" | "80mm") => Promise<string>;
};

const UsbReceiptCapture = forwardRef<UsbReceiptCaptureHandle>((_, ref) => {
  useImperativeHandle(
    ref,
    () => ({
      capture: () => Promise.reject(new Error("USB receipt capture not supported on this platform")),
    }),
    [],
  );
  return null;
});

UsbReceiptCapture.displayName = "UsbReceiptCapture";
export default UsbReceiptCapture;
