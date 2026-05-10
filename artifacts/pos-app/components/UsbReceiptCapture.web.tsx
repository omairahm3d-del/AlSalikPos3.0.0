import React, { forwardRef } from "react";

export type UsbReceiptCaptureHandle = {
  capture: (html: string, paperWidth: "58mm" | "80mm") => Promise<string>;
};

const UsbReceiptCapture = forwardRef<UsbReceiptCaptureHandle>((_props, _ref) => {
  return null;
});

UsbReceiptCapture.displayName = "UsbReceiptCapture";
export default UsbReceiptCapture;
