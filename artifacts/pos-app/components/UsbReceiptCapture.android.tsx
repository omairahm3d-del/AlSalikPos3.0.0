import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Platform, View } from "react-native";

export type UsbReceiptCaptureHandle = {
  capture: (html: string, paperWidth: "58mm" | "80mm") => Promise<string>;
};

type Pending = {
  resolve: (v: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const UsbReceiptCapture = forwardRef<UsbReceiptCaptureHandle>((_, ref) => {
  const containerRef = useRef<View>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [content, setContent] = useState<{ html: string; width: number } | null>(null);

  const capture = useCallback(
    (html: string, paperWidth: "58mm" | "80mm") =>
      new Promise<string>((resolve, reject) => {
        if (pendingRef.current) {
          clearTimeout(pendingRef.current.timer);
          pendingRef.current.reject(new Error("Superseded"));
          pendingRef.current = null;
        }
        const timer = setTimeout(() => {
          pendingRef.current = null;
          reject(new Error("USB receipt capture timed out after 12 seconds"));
        }, 12000);
        pendingRef.current = { resolve, reject, timer };
        setContent({ html, width: paperWidth === "58mm" ? 384 : 576 });
      }),
    [],
  );

  useImperativeHandle(ref, () => ({ capture }), [capture]);

  const handleLoadEnd = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || !containerRef.current) return;
    await new Promise<void>((r) => setTimeout(r, 700));
    try {
      const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      const base64: string = await captureRef(containerRef, {
        format: "png",
        quality: 1,
        result: "base64",
      });
      clearTimeout(pending.timer);
      pendingRef.current = null;
      pending.resolve(base64);
    } catch (e: any) {
      clearTimeout(pending.timer);
      pendingRef.current = null;
      pending.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  if (Platform.OS !== "android" || !content) return null;

  const WebView = require("react-native-webview").WebView;

  return (
    <View
      ref={containerRef}
      collapsable={false}
      style={{
        position: "absolute",
        left: -(content.width + 300),
        top: 0,
        width: content.width,
        backgroundColor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <WebView
        source={{ html: content.html }}
        style={{ width: content.width, height: 2800 }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onLoadEnd={handleLoadEnd}
      />
    </View>
  );
});

UsbReceiptCapture.displayName = "UsbReceiptCapture";
export default UsbReceiptCapture;
