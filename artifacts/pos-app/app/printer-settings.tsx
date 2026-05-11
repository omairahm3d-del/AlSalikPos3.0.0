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
import { useUsbPrinterStatus } from "@/hooks/useUsbPrinterStatus";
import type { PrinterSettings } from "@/types";
import { DEFAULT_PRINTER_SETTINGS } from "@/types";
import type { UsbDevice as LibUsbDevice } from "@/lib/usbPrinter";

type ScanState = "idle" | "scanning";
type TestState = "idle" | "testing" | "ok" | "fail";
type DrawerState = "idle" | "opening" | "ok" | "fail";

function StatusBadge({ status }: { status: string }) {
  const colors = useColors();
  const map: Record<string, { label: string; color: string }> = {
    connected: { label: "Connected", color: "#22C55E" },
    connecting: { label: "Connecting…", color: colors.primary },
    disconnected: { label: "Disconnected", color: "#EF4444" },
    permission_denied: { label: "Permission Denied", color: "#F97316" },
    idle: { label: "Not selected", color: colors.mutedForeground },
  };
  const badge = map[status] ?? map.idle;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 99,
        backgroundColor: badge.color + "18",
        borderWidth: 1,
        borderColor: badge.color + "50",
        alignSelf: "flex-start",
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: badge.color,
        }}
      />
      <Text
        style={{ color: badge.color, fontSize: 11, fontWeight: "600" }}
      >
        {badge.label}
      </Text>
    </View>
  );
}

export default function PrinterSettingsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const db = useDatabase();

  const [ps, setPs] = useState<PrinterSettings>({ ...DEFAULT_PRINTER_SETTINGS });
  const [saving, setSaving] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [testState, setTestState] = useState<TestState>("idle");
  const [drawerState, setDrawerState] = useState<DrawerState>("idle");
  const [detectedDevices, setDetectedDevices] = useState<LibUsbDevice[]>([]);

  const currentDevice: LibUsbDevice | null =
    ps.usbPrinterVendorId != null
      ? {
          vendorId: ps.usbPrinterVendorId,
          productId: ps.usbPrinterProductId ?? 0,
          productName: ps.usbPrinterName,
        }
      : null;

  const { status, retry } = useUsbPrinterStatus(currentDevice);

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
        Alert.alert("Saved", "USB printer settings saved.");
      } catch {
        Alert.alert("Error", "Failed to save settings.");
      } finally {
        setSaving(false);
      }
    },
    [db],
  );

  const handleScan = useCallback(async () => {
    setScanState("scanning");
    setDetectedDevices([]);
    try {
      const { listUsbPrinters } = await import("@/lib/usbPrinter");
      const devs = await listUsbPrinters();
      setDetectedDevices(devs);
      if (devs.length === 0) {
        Alert.alert(
          "No USB Printers Found",
          "No USB devices detected.\n\n• Make sure the OTG cable is connected via USB-OTG adapter\n• Ensure the printer is powered on\n• Accept the USB permission dialog if it appeared\n• Try tapping Detect again after granting permission",
        );
      }
    } catch {
      Alert.alert(
        "Scan Error",
        "Could not scan for USB devices.\n\n• Make sure the OTG cable is connected\n• Accept any USB permission dialog that appears\n• This requires an EAS / development build (not Expo Go)",
      );
    } finally {
      setScanState("idle");
    }
  }, []);

  const handleTestPrint = useCallback(async () => {
    if (!currentDevice) return;
    setTestState("testing");
    try {
      const { connectUsbPrinter, testUsbPrinter } = await import(
        "@/lib/usbPrinter"
      );
      const ok = await testUsbPrinter(currentDevice, ps.autoCutPaper !== false);
      setTestState(ok ? "ok" : "fail");
      if (!ok) {
        Alert.alert(
          "Test Print Failed",
          "Check that the printer is powered on, connected, and USB permission was granted.",
        );
      }
    } catch {
      setTestState("fail");
    } finally {
      setTimeout(() => setTestState("idle"), 3000);
    }
  }, [currentDevice, ps.autoCutPaper]);

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

  const selectDevice = useCallback(
    (d: LibUsbDevice) => {
      const label = d.productName || d.manufacturerName || `VID:${d.vendorId}`;
      setPs((prev) => ({
        ...prev,
        usbPrinterVendorId: d.vendorId,
        usbPrinterProductId: d.productId,
        usbPrinterName: label,
        usbPrinterEnabled: true,
      }));
      setDetectedDevices([]);
      retry();
    },
    [retry],
  );

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={[
          s.header,
          { paddingTop: insets.top + 12 },
        ]}
      >
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
        {/* ── Enable toggle ─────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Enable USB OTG Printer</Text>
              <Text style={s.cardSub}>
                Connect an ESC/POS printer via USB OTG cable
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

        {/* ── Current printer card ───────────────────────────────── */}
        {ps.usbPrinterEnabled && (
          <>
            <View style={s.card}>
              <View style={s.row}>
                <Feather
                  name="printer"
                  size={18}
                  color={colors.primary}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.cardTitle}>
                    {currentDevice
                      ? ps.usbPrinterName ||
                        `VID:${ps.usbPrinterVendorId} PID:${ps.usbPrinterProductId ?? 0}`
                      : "No printer selected"}
                  </Text>
                  {currentDevice && (
                    <Text style={s.cardSub}>
                      Vendor ID: {ps.usbPrinterVendorId} · Product ID:{" "}
                      {ps.usbPrinterProductId ?? 0}
                    </Text>
                  )}
                  <View style={{ marginTop: 6 }}>
                    <StatusBadge status={status} />
                  </View>
                </View>
                {currentDevice && (
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
                )}
              </View>

              {/* Retry / refresh status */}
              {currentDevice && status === "disconnected" && (
                <TouchableOpacity
                  onPress={retry}
                  style={[s.outlineBtn, { marginTop: 10 }]}
                >
                  <Feather name="refresh-cw" size={13} color={colors.primary} />
                  <Text style={[s.outlineBtnText, { color: colors.primary }]}>
                    Retry Connection
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Scan for printers ────────────────────────────────── */}
            <View style={s.card}>
              <Text style={s.sectionLabel}>Detect Printers</Text>
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  scanState === "scanning" && { opacity: 0.7 },
                ]}
                disabled={scanState === "scanning"}
                onPress={handleScan}
              >
                {scanState === "scanning" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="search" size={14} color="#fff" />
                )}
                <Text style={s.primaryBtnText}>
                  {scanState === "scanning"
                    ? "Scanning…"
                    : "Detect USB Printers"}
                </Text>
              </TouchableOpacity>

              {detectedDevices.length > 0 && (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {detectedDevices.map((d, idx) => {
                    const label =
                      d.productName ||
                      d.manufacturerName ||
                      `Device ${idx + 1}`;
                    const isSelected =
                      ps.usbPrinterVendorId === d.vendorId &&
                      ps.usbPrinterProductId === d.productId;
                    return (
                      <TouchableOpacity
                        key={`${d.vendorId}-${d.productId}-${idx}`}
                        onPress={() => selectDevice(d)}
                        style={[
                          s.deviceRow,
                          isSelected && {
                            backgroundColor: colors.primary + "15",
                            borderColor: colors.primary,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: isSelected
                              ? colors.primary + "20"
                              : colors.secondary,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Feather
                            name="printer"
                            size={15}
                            color={isSelected ? colors.primary : colors.mutedForeground}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.deviceName}>{label}</Text>
                          <Text style={s.deviceSub}>
                            VID: {d.vendorId} · PID: {d.productId}
                            {d.serialNumber ? `  S/N: ${d.serialNumber}` : ""}
                          </Text>
                        </View>
                        {isSelected ? (
                          <Feather
                            name="check-circle"
                            size={16}
                            color={colors.primary}
                          />
                        ) : (
                          <Text style={s.selectText}>Select</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── Paper width ──────────────────────────────────────── */}
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
                    <Text
                      style={[
                        s.chipText,
                        ps.paperWidth === w && { color: "#fff" },
                      ]}
                    >
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
                    onPress={() =>
                      setPs((prev) => ({ ...prev, usbPrintMode: value }))
                    }
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
                        (ps.usbPrintMode ?? "text") === value && {
                          color: "#fff",
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.hint}>
                {(ps.usbPrintMode ?? "text") === "text"
                  ? "Fast ESC/POS commands — wide compatibility. Use for English text."
                  : "Renders the HTML receipt as an image. Slower but preserves Arabic text and logos."}
              </Text>
            </View>

            {/* ── Options ──────────────────────────────────────────── */}
            <View style={s.card}>
              <Text style={s.sectionLabel}>Options</Text>

              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.optLabel}>Auto-cut paper</Text>
                  <Text style={s.optSub}>
                    Send paper-cut command after printing
                  </Text>
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
                  <Text style={s.optSub}>
                    Sends drawer-open command on cash transactions
                  </Text>
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

            {/* ── Test buttons ─────────────────────────────────────── */}
            {currentDevice && (
              <View style={s.card}>
                <Text style={s.sectionLabel}>Test</Text>
                <View style={s.row}>
                  {/* Test Print */}
                  <TouchableOpacity
                    style={[
                      s.testBtn,
                      {
                        borderColor:
                          testState === "ok"
                            ? "#22C55E"
                            : testState === "fail"
                              ? "#EF4444"
                              : colors.primary,
                        flex: 1,
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
                        borderColor:
                          drawerState === "ok"
                            ? "#22C55E"
                            : drawerState === "fail"
                              ? "#EF4444"
                              : "#F59E0B",
                        flex: 1,
                      },
                    ]}
                    disabled={drawerState === "opening"}
                    onPress={handleCashDrawer}
                  >
                    {drawerState === "opening" ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <Feather
                        name={
                          drawerState === "ok"
                            ? "check-circle"
                            : drawerState === "fail"
                              ? "x-circle"
                              : "inbox"
                        }
                        size={14}
                        color={
                          drawerState === "ok"
                            ? "#22C55E"
                            : drawerState === "fail"
                              ? "#EF4444"
                              : "#F59E0B"
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
                                : "#F59E0B",
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

            {/* ── Info ─────────────────────────────────────────────── */}
            <View
              style={[
                s.card,
                { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" },
              ]}
            >
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Feather name="info" size={14} color={colors.primary} style={{ marginTop: 1 }} />
                <Text style={[s.hint, { color: colors.primary, flex: 1 }]}>
                  USB printing requires a <Text style={{ fontWeight: "700" }}>development or EAS build</Text> — it does not work in Expo Go.
                  {"\n\n"}Connect the OTG cable and power on the printer first. When you tap <Text style={{ fontWeight: "700" }}>Detect USB Printers</Text>, an Android permission dialog will appear — tap <Text style={{ fontWeight: "700" }}>Allow</Text> to grant USB access. If nothing appears, tap Detect again.
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── Save ─────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.7 }]}
          disabled={saving}
          onPress={() => save(ps)}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="save" size={15} color="#fff" />
          )}
          <Text style={s.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.secondary,
    },
    headerTitle: {
      color: colors.foreground,
      fontSize: 17,
      fontWeight: "700",
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      color: colors.foreground,
      fontWeight: "700",
      fontSize: 14,
    },
    cardSub: {
      color: colors.mutedForeground,
      fontSize: 12,
      marginTop: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    sectionLabel: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    chipRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.secondary,
    },
    chipText: {
      color: colors.mutedForeground,
      fontWeight: "600",
      fontSize: 13,
    },
    hint: {
      color: colors.mutedForeground,
      fontSize: 11,
      marginTop: 6,
      lineHeight: 16,
    },
    optLabel: {
      color: colors.foreground,
      fontWeight: "600",
      fontSize: 13,
    },
    optSub: {
      color: colors.mutedForeground,
      fontSize: 11,
      marginTop: 1,
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
    deviceName: {
      color: colors.foreground,
      fontWeight: "600",
      fontSize: 13,
    },
    deviceSub: {
      color: colors.mutedForeground,
      fontSize: 11,
      marginTop: 1,
    },
    selectText: {
      color: colors.primary,
      fontWeight: "600",
      fontSize: 12,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 11,
    },
    primaryBtnText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 13,
    },
    outlineBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 9,
    },
    outlineBtnText: {
      fontWeight: "600",
      fontSize: 12,
    },
    testBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 9,
    },
    testBtnText: {
      fontWeight: "600",
      fontSize: 12,
    },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      marginTop: 6,
    },
    saveBtnText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 15,
    },
  });
}
