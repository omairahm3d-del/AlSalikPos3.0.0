import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { PrinterSettings } from "@/types";
import { DEFAULT_PRINTER_SETTINGS } from "@/types";
import type { UsbDevice } from "@/lib/usbPrinter";
import { getVendorName, isProbablyPrinter } from "@/lib/usbPrinter";

/**
 * USB Printer setup uses a 3-step flow that matches how the underlying
 * Android USB Host API works:
 *
 * Step 1 — SCAN:  init() registers the BroadcastReceiver, getDeviceList()
 *                 returns all connected USB devices (no permission needed).
 *
 * Step 2 — CONNECT: connectPrinter(vid, pid) calls Android's
 *                 UsbManager.requestPermission() which shows a modal dialog.
 *                 The JS Promise resolves IMMEDIATELY (before the dialog
 *                 appears). The BroadcastReceiver sets mUsbDevice only AFTER
 *                 the user taps Allow. Because the dialog is modal the user
 *                 cannot tap anything in our app while it is showing, so by
 *                 the time they can interact again mUsbDevice is set.
 *
 * Step 3 — TEST:  printBill() is called as a separate user action AFTER the
 *                 dialog was dismissed. Do NOT call connectPrinter + printBill
 *                 back-to-back — the race will always lose on first use.
 */

type ScanState = "idle" | "scanning" | "done" | "error";
type ConnectState = "idle" | "connecting" | "awaiting_allow" | "failed";
type TestState = "idle" | "testing" | "ok" | "fail";
type DrawerState = "idle" | "opening" | "ok" | "fail";

export default function PrinterSettingsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const db = useDatabase();

  const [ps, setPs] = useState<PrinterSettings>({ ...DEFAULT_PRINTER_SETTINGS });
  const [saving, setSaving] = useState(false);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scannedDevices, setScannedDevices] = useState<UsbDevice[]>([]);

  const [connectState, setConnectState] = useState<ConnectState>("idle");
  const [testState, setTestState] = useState<TestState>("idle");
  const [drawerState, setDrawerState] = useState<DrawerState>("idle");

  const currentDevice: UsbDevice | null =
    ps.usbPrinterVendorId != null
      ? {
          vendorId: ps.usbPrinterVendorId,
          productId: ps.usbPrinterProductId ?? 0,
          productName: ps.usbPrinterName,
        }
      : null;

  const load = useCallback(async () => {
    try {
      const biz = await db.loadBusinessSettings();
      setPs(biz.printerSettings ?? { ...DEFAULT_PRINTER_SETTINGS });
    } catch {
      /* ignore */
    }
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (updated: PrinterSettings) => {
      setSaving(true);
      try {
        const biz = await db.loadBusinessSettings();
        await db.saveBusinessSettings({ ...biz, printerSettings: updated });
        setPs(updated);
        Alert.alert("Saved", "Printer settings saved.");
      } catch {
        Alert.alert("Error", "Failed to save settings.");
      } finally {
        setSaving(false);
      }
    },
    [db],
  );

  // ── Step 1: Scan ─────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (Platform.OS !== "android") return;
    setScanState("scanning");
    setScannedDevices([]);
    setConnectState("idle");
    try {
      const { initAndScanUsbDevices } = await import("@/lib/usbPrinter");
      const devs = await initAndScanUsbDevices();
      setScannedDevices(devs);
      setScanState("done");
      if (devs.length === 0) {
        Alert.alert(
          "No USB Devices Found",
          "Make sure the printer is powered on and the USB cable is firmly connected, then scan again.",
        );
      }
    } catch {
      setScanState("error");
      Alert.alert("Scan Error", "Could not scan USB devices. Make sure the printer is connected and powered on.");
    }
  }, []);

  // ── Step 2: Connect ───────────────────────────────────────────────────────
  const handleConnect = useCallback(async (device: UsbDevice) => {
    if (Platform.OS !== "android") return;
    setConnectState("connecting");
    try {
      const { connectUsbPrinter } = await import("@/lib/usbPrinter");
      await connectUsbPrinter(device);
      // The Promise resolves immediately — the Android dialog will appear
      // as a modal after this. The user MUST respond before interacting
      // with anything else in the app.
      const label =
        device.productName ||
        getVendorName(device.vendorId) ||
        `VID:${device.vendorId}`;
      setPs((prev) => ({
        ...prev,
        usbPrinterVendorId: device.vendorId,
        usbPrinterProductId: device.productId,
        usbPrinterName: label,
        usbPrinterEnabled: true,
      }));
      setConnectState("awaiting_allow");
    } catch {
      setConnectState("failed");
    }
  }, []);

  // ── Step 3: Test Print ────────────────────────────────────────────────────
  const handleTestPrint = useCallback(async () => {
    if (!currentDevice) return;
    setTestState("testing");
    try {
      const { testUsbPrinter } = await import("@/lib/usbPrinter");
      const ok = await testUsbPrinter(currentDevice, ps.autoCutPaper !== false);
      setTestState(ok ? "ok" : "fail");
      if (ok) {
        setConnectState("idle"); // reset so the banner goes away
      } else {
        Alert.alert(
          "Test Print Failed",
          "The printer did not respond.\n\n" +
            "• Did you tap Allow in the USB permission dialog?\n" +
            "• Is the printer powered on and the cable firmly plugged in?\n" +
            "• Try tapping Connect again on the device.",
        );
      }
    } catch {
      setTestState("fail");
    } finally {
      setTimeout(() => setTestState("idle"), 3000);
    }
  }, [currentDevice, ps.autoCutPaper]);

  // ── Cash Drawer ───────────────────────────────────────────────────────────
  const handleCashDrawer = useCallback(async () => {
    if (!currentDevice) return;
    setDrawerState("opening");
    try {
      const { openUsbCashDrawer } = await import("@/lib/usbPrinter");
      const ok = await openUsbCashDrawer(currentDevice);
      setDrawerState(ok ? "ok" : "fail");
      if (!ok) Alert.alert("Cash Drawer", "Could not open cash drawer.");
    } catch {
      setDrawerState("fail");
    } finally {
      setTimeout(() => setDrawerState("idle"), 3000);
    }
  }, [currentDevice]);

  const s = styles(colors);

  const isAndroid = Platform.OS === "android";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>USB Printer Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Platform note ──────────────────────────────────────────── */}
        {!isAndroid && (
          <View style={[s.card, { borderColor: colors.border }]}>
            <Text style={[s.cardSub, { textAlign: "center" }]}>
              USB printing is only available on Android devices.
            </Text>
          </View>
        )}

        {isAndroid && (
          <>
            {/* ── Enable toggle ─────────────────────────────────────── */}
            <View style={s.card}>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Enable USB Printer</Text>
                  <Text style={s.cardSub}>
                    Connect an ESC/POS thermal printer via USB cable
                  </Text>
                </View>
                <Switch
                  value={!!ps.usbPrinterEnabled}
                  onValueChange={(v) =>
                    setPs((prev) => ({ ...prev, usbPrinterEnabled: v }))
                  }
                  trackColor={{ true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {ps.usbPrinterEnabled && (
              <>
                {/* ── Step 1: Scan ──────────────────────────────────── */}
                <View style={s.card}>
                  <View style={s.stepHeader}>
                    <View style={s.stepBadge}>
                      <Text style={s.stepNum}>1</Text>
                    </View>
                    <Text style={s.sectionLabel}>Scan for USB Devices</Text>
                  </View>
                  <Text style={s.hint}>
                    Make sure the printer is powered on and the USB cable is connected before scanning.
                  </Text>

                  <TouchableOpacity
                    style={[s.primaryBtn, scanState === "scanning" && { opacity: 0.7 }]}
                    disabled={scanState === "scanning"}
                    onPress={handleScan}
                  >
                    {scanState === "scanning" ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="search" size={14} color="#fff" />
                    )}
                    <Text style={s.primaryBtnText}>
                      {scanState === "scanning" ? "Scanning…" : "Scan for Devices"}
                    </Text>
                  </TouchableOpacity>

                  {scanState === "done" && scannedDevices.length > 0 && (
                    <View style={{ marginTop: 12, gap: 6 }}>
                      <Text style={[s.hint, { marginBottom: 4 }]}>
                        {scannedDevices.length} device{scannedDevices.length !== 1 ? "s" : ""} found — tap Connect on your printer:
                      </Text>
                      {scannedDevices.map((d, idx) => {
                        const brand = getVendorName(d.vendorId);
                        const likelyPrinter = isProbablyPrinter(d);
                        const isSelected =
                          ps.usbPrinterVendorId === d.vendorId &&
                          ps.usbPrinterProductId === d.productId;
                        return (
                          <View
                            key={`${d.vendorId}-${d.productId}-${idx}`}
                            style={[
                              s.deviceRow,
                              isSelected && {
                                backgroundColor: colors.primary + "12",
                                borderColor: colors.primary,
                              },
                            ]}
                          >
                            <View style={s.deviceIcon}>
                              <Feather
                                name={likelyPrinter ? "printer" : "cpu"}
                                size={15}
                                color={isSelected ? colors.primary : colors.mutedForeground}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.deviceName}>{brand}</Text>
                              <Text style={s.deviceSub}>
                                VID: {`0x${d.vendorId.toString(16).toUpperCase().padStart(4, "0")}`}
                                {"  "}PID: {`0x${d.productId.toString(16).toUpperCase().padStart(4, "0")}`}
                              </Text>
                              {!likelyPrinter && (
                                <Text style={[s.deviceSub, { color: colors.mutedForeground }]}>
                                  Not a known printer — connect only if sure
                                </Text>
                              )}
                            </View>
                            {isSelected ? (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Feather name="check-circle" size={14} color={colors.primary} />
                                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                                  Selected
                                </Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={[s.connectBtn, connectState === "connecting" && { opacity: 0.6 }]}
                                disabled={connectState === "connecting"}
                                onPress={() => handleConnect(d)}
                              >
                                {connectState === "connecting" ? (
                                  <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                  <Text style={[s.connectBtnText, { color: colors.primary }]}>Connect</Text>
                                )}
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {scanState === "done" && scannedDevices.length === 0 && (
                    <Text style={[s.hint, { marginTop: 8, color: "#EF4444" }]}>
                      No USB devices detected. Check the cable and try again.
                    </Text>
                  )}
                </View>

                {/* ── Step 2: Allow permission ──────────────────────── */}
                {connectState === "awaiting_allow" && (
                  <View style={s.card}>
                    <View style={s.stepHeader}>
                      <View style={s.stepBadge}>
                        <Text style={s.stepNum}>2</Text>
                      </View>
                      <Text style={s.sectionLabel}>Grant USB Permission</Text>
                    </View>
                    <View style={s.allowBanner}>
                      <Feather name="alert-circle" size={16} color="#B45309" style={{ marginTop: 1 }} />
                      <Text style={s.allowText}>
                        An Android <Text style={{ fontWeight: "700" }}>Allow USB access?</Text> dialog may appear — tap <Text style={{ fontWeight: "700" }}>Allow</Text> if it does.{"\n\n"}
                        <Text style={{ fontWeight: "700" }}>No dialog?</Text> The printer may already have access. Go ahead and tap <Text style={{ fontWeight: "700" }}>Test Print</Text> below.
                      </Text>
                    </View>
                  </View>
                )}

                {connectState === "failed" && (
                  <View style={s.card}>
                    <Text style={[s.hint, { color: "#EF4444" }]}>
                      Connection failed. Make sure the printer is connected and powered on, then scan again.
                    </Text>
                  </View>
                )}

                {/* ── Step 3: Test Print ────────────────────────────── */}
                {currentDevice && (
                  <View style={s.card}>
                    <View style={s.stepHeader}>
                      <View style={[s.stepBadge, connectState !== "awaiting_allow" && { backgroundColor: colors.mutedForeground + "30" }]}>
                        <Text style={[s.stepNum, connectState !== "awaiting_allow" && { color: colors.mutedForeground }]}>3</Text>
                      </View>
                      <Text style={s.sectionLabel}>Test & Confirm</Text>
                    </View>

                    <View style={s.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>
                          {ps.usbPrinterName || getVendorName(currentDevice.vendorId)}
                        </Text>
                        <Text style={s.cardSub}>
                          VID: {`0x${currentDevice.vendorId.toString(16).toUpperCase().padStart(4, "0")}`}
                          {"  "}PID: {`0x${currentDevice.productId.toString(16).toUpperCase().padStart(4, "0")}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          setPs((prev) => ({
                            ...prev,
                            usbPrinterVendorId: undefined,
                            usbPrinterProductId: undefined,
                            usbPrinterName: undefined,
                          }))
                        }
                        style={{ padding: 6 }}
                      >
                        <Feather name="x" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>

                    <View style={[s.row, { marginTop: 12, gap: 10 }]}>
                      {/* Test Print */}
                      <TouchableOpacity
                        style={[
                          s.testBtn,
                          {
                            flex: 1,
                            borderColor:
                              testState === "ok"
                                ? "#22C55E"
                                : testState === "fail"
                                  ? "#EF4444"
                                  : colors.primary,
                          },
                        ]}
                        disabled={testState === "testing"}
                        onPress={handleTestPrint}
                      >
                        {testState === "testing" ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Feather
                            name={
                              testState === "ok"
                                ? "check-circle"
                                : testState === "fail"
                                  ? "x-circle"
                                  : "printer"
                            }
                            size={14}
                            color={
                              testState === "ok"
                                ? "#22C55E"
                                : testState === "fail"
                                  ? "#EF4444"
                                  : colors.primary
                            }
                          />
                        )}
                        <Text
                          style={[
                            s.testBtnText,
                            {
                              color:
                                testState === "ok"
                                  ? "#22C55E"
                                  : testState === "fail"
                                    ? "#EF4444"
                                    : colors.primary,
                            },
                          ]}
                        >
                          {testState === "testing"
                            ? "Printing…"
                            : testState === "ok"
                              ? "Printed!"
                              : testState === "fail"
                                ? "Failed"
                                : "Test Print"}
                        </Text>
                      </TouchableOpacity>

                      {/* Cash Drawer */}
                      <TouchableOpacity
                        style={[
                          s.testBtn,
                          {
                            flex: 1,
                            borderColor:
                              drawerState === "ok"
                                ? "#22C55E"
                                : drawerState === "fail"
                                  ? "#EF4444"
                                  : colors.primary,
                          },
                        ]}
                        disabled={drawerState === "opening"}
                        onPress={handleCashDrawer}
                      >
                        {drawerState === "opening" ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Feather
                            name={
                              drawerState === "ok"
                                ? "check-circle"
                                : drawerState === "fail"
                                  ? "x-circle"
                                  : "box"
                            }
                            size={14}
                            color={
                              drawerState === "ok"
                                ? "#22C55E"
                                : drawerState === "fail"
                                  ? "#EF4444"
                                  : colors.primary
                            }
                          />
                        )}
                        <Text
                          style={[
                            s.testBtnText,
                            {
                              color:
                                drawerState === "ok"
                                  ? "#22C55E"
                                  : drawerState === "fail"
                                    ? "#EF4444"
                                    : colors.primary,
                            },
                          ]}
                        >
                          {drawerState === "opening"
                            ? "Opening…"
                            : drawerState === "ok"
                              ? "Opened!"
                              : drawerState === "fail"
                                ? "Failed"
                                : "Cash Drawer"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* ── Paper Width ───────────────────────────────────── */}
                <View style={s.card}>
                  <Text style={s.sectionLabel}>Paper Width</Text>
                  <View style={s.chipRow}>
                    {(["58mm", "80mm"] as const).map((w) => (
                      <TouchableOpacity
                        key={w}
                        onPress={() => setPs((prev) => ({ ...prev, paperWidth: w }))}
                        style={[
                          s.chip,
                          ps.paperWidth === w && {
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        <Text style={[s.chipText, ps.paperWidth === w && { color: "#fff" }]}>
                          {w}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[s.sectionLabel, { marginTop: 14 }]}>Print Mode</Text>
                  <View style={s.chipRow}>
                    {(
                      [
                        { value: "text", label: "ESC/POS Text" },
                        { value: "bitmap", label: "Bitmap (HTML)" },
                      ] as const
                    ).map(({ value, label }) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setPs((prev) => ({ ...prev, usbPrintMode: value }))}
                        style={[
                          s.chip,
                          (ps.usbPrintMode ?? "text") === value && {
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            s.chipText,
                            (ps.usbPrintMode ?? "text") === value && { color: "#fff" },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.hint}>
                    {(ps.usbPrintMode ?? "text") === "text"
                      ? "Fast ESC/POS text — best compatibility. Use for English text receipts."
                      : "Renders the receipt as an image. Slower but supports Arabic and logos."}
                  </Text>
                </View>

                {/* ── Options ──────────────────────────────────────── */}
                <View style={s.card}>
                  <Text style={s.sectionLabel}>Options</Text>

                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optLabel}>Auto-cut paper</Text>
                      <Text style={s.optSub}>Send paper-cut command after printing</Text>
                    </View>
                    <Switch
                      value={ps.autoCutPaper !== false}
                      onValueChange={(v) =>
                        setPs((prev) => ({ ...prev, autoCutPaper: v }))
                      }
                      trackColor={{ true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>

                  <View style={[s.row, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optLabel}>Open cash drawer after payment</Text>
                      <Text style={s.optSub}>Sends drawer-open command on cash transactions</Text>
                    </View>
                    <Switch
                      value={!!ps.usbCashDrawerEnabled}
                      onValueChange={(v) =>
                        setPs((prev) => ({ ...prev, usbCashDrawerEnabled: v }))
                      }
                      trackColor={{ true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>

                {/* ── Save ─────────────────────────────────────────── */}
                <TouchableOpacity
                  style={[s.primaryBtn, saving && { opacity: 0.7 }]}
                  disabled={saving}
                  onPress={() => save(ps)}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="save" size={14} color="#fff" />
                  )}
                  <Text style={s.primaryBtnText}>
                    {saving ? "Saving…" : "Save Settings"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontWeight: "600",
      color: colors.foreground,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
    },
    cardSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    stepHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    stepBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    stepNum: {
      fontSize: 12,
      fontWeight: "700",
      color: "#fff",
    },
    hint: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginBottom: 10,
      lineHeight: 17,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 11,
      paddingHorizontal: 16,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    allowBanner: {
      backgroundColor: "#FEF3C7",
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: "#F59E0B",
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-start",
    },
    allowText: {
      flex: 1,
      fontSize: 13,
      color: "#92400E",
      lineHeight: 20,
    },
    deviceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    deviceIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    deviceName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.foreground,
    },
    deviceSub: {
      fontSize: 11,
      color: colors.mutedForeground,
      marginTop: 1,
      fontFamily: "monospace",
    },
    connectBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    connectBtnText: {
      fontSize: 13,
      fontWeight: "600",
    },
    chipRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.foreground,
    },
    optLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.foreground,
    },
    optSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 1,
    },
    testBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1.5,
    },
    testBtnText: {
      fontSize: 13,
      fontWeight: "600",
    },
  });
}
