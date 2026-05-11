import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUsbPrint } from "@/context/UsbPrintContext";
import { useColors } from "@/hooks/useColors";
import { generateLaundryTicketHTML } from "@/lib/receiptTemplate";
import { formatWhatsAppPhone, generateLaundryWhatsAppText } from "@/lib/textReceipt";
import type { BusinessSettings, LaundryOrder } from "@/types";
import { formatCurrency } from "@/types";

interface Props {
  visible: boolean;
  order: LaundryOrder | null;
  businessSettings: BusinessSettings | null;
  onClose: () => void;
}

export function LaundryTicketConfirmModal({ visible, order, businessSettings, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { captureAndPrintBitmap } = useUsbPrint();

  const [printing, setPrinting] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const phoneInputRef = useRef<TextInput>(null);

  const handlePrint = useCallback(async () => {
    if (!order || !businessSettings) return;
    setPrinting(true);
    try {
      const { printHtml } = await import("@/lib/printBridge");
      const html = generateLaundryTicketHTML(order, businessSettings);
      const ps = businessSettings.printerSettings;
      const isDirect = (ps?.printMethod ?? "system") === "direct";

      if (isDirect) {
        const { generateLaundryTicketText } = await import("@/lib/receiptTemplate") as any;
        const rawText = generateLaundryTicketText?.(order, businessSettings) ?? html;
        if (Platform.OS === "web" && !window.electronPOS) {
          const w = window.open("", "_blank");
          if (w) {
            w.document.write(`<html><head><title>Laundry Ticket</title><style>body{font-family:monospace;white-space:pre;font-size:13px;padding:16px;}</style></head><body>${rawText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>`);
            w.document.close();
            w.focus();
            setTimeout(() => { w.print(); }, 400);
          }
          setPrinting(false);
          return;
        }
        await printHtml("", {
          deviceName: ps?.windowsReceiptPrinterName || "",
          paperWidth: ps?.paperWidth || "80mm",
          rawMode: true,
          rawText,
          autoCut: true,
          codepage: ps?.rawCodepage || "cp1252",
          sunmiEnabled: !!ps?.sunmiEnabled,
          androidDevicePath: ps?.androidPrinterEnabled ? (ps?.androidPrinterPath || "/dev/prnt") : undefined,
          networkPrinterIp: ps?.networkPrinterEnabled ? ps?.networkPrinterIp : undefined,
          networkPrinterPort: ps?.networkPrinterPort,
          bluetoothAddress: ps?.bluetoothPrinterEnabled ? ps?.bluetoothPrinterAddress : undefined,
          usbVendorId: ps?.usbPrinterEnabled && ps.usbPrinterVendorId != null ? ps.usbPrinterVendorId : undefined,
          usbProductId: ps?.usbPrinterEnabled ? (ps.usbPrinterProductId ?? 0) : undefined,
        });
        setPrinting(false);
        return;
      }

      if (ps?.usbPrinterEnabled && ps.usbPrinterVendorId != null && ps.usbPrintMode === "bitmap") {
        const ok = await captureAndPrintBitmap(html, ps);
        if (!ok) Alert.alert("USB Print Failed", "Could not print via USB OTG.");
        setPrinting(false);
        return;
      }

      if (Platform.OS === "web" && !window.electronPOS) {
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); }, 400);
        }
        setPrinting(false);
        return;
      }

      const needRaw = !!ps?.rawTextMode || !!ps?.androidPrinterEnabled || !!ps?.sunmiEnabled
        || !!ps?.networkPrinterEnabled || !!ps?.bluetoothPrinterEnabled
        || (!!ps?.usbPrinterEnabled && ps?.usbPrintMode !== "bitmap");

      await printHtml(html, {
        deviceName: ps?.windowsReceiptPrinterName || "",
        paperWidth: ps?.paperWidth || "80mm",
        rawMode: !!ps?.rawTextMode,
        autoCut: ps?.autoCutPaper !== false,
        codepage: ps?.rawCodepage || "cp1252",
        sunmiEnabled: !!ps?.sunmiEnabled,
        androidDevicePath: ps?.androidPrinterEnabled ? (ps?.androidPrinterPath || "/dev/prnt") : undefined,
        networkPrinterIp: ps?.networkPrinterEnabled ? ps?.networkPrinterIp : undefined,
        networkPrinterPort: ps?.networkPrinterPort,
        bluetoothAddress: ps?.bluetoothPrinterEnabled ? ps?.bluetoothPrinterAddress : undefined,
        usbVendorId: ps?.usbPrinterEnabled && ps?.usbPrintMode !== "bitmap" && ps.usbPrinterVendorId != null ? ps.usbPrinterVendorId : undefined,
        usbProductId: ps?.usbPrinterEnabled && ps?.usbPrintMode !== "bitmap" ? (ps.usbPrinterProductId ?? 0) : undefined,
      });
    } catch (e: any) {
      Alert.alert("Print Error", e?.message ?? "Could not print ticket.");
    } finally {
      setPrinting(false);
    }
  }, [order, businessSettings, captureAndPrintBitmap]);

  const openWhatsApp = useCallback(async (phone: string) => {
    if (!order || !businessSettings) return;
    const cleaned = formatWhatsAppPhone(phone);
    if (!cleaned || cleaned.length < 7) {
      Alert.alert("Invalid Number", "Please enter a valid phone number including country code (e.g. 971501234567).");
      return;
    }
    const message = generateLaundryWhatsAppText(order, businessSettings);
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("WhatsApp Not Found", "WhatsApp does not appear to be installed on this device.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Could not open WhatsApp.");
    }
  }, [order, businessSettings]);

  const handleWhatsApp = useCallback(async () => {
    if (!order) return;
    setWhatsappLoading(true);
    try {
      const phone = order.customerPhone?.trim();
      if (phone && phone.length >= 7) {
        setWhatsappLoading(false);
        await openWhatsApp(phone);
        return;
      }
      setWhatsappLoading(false);
      setPhoneInput("");
      setShowPhonePrompt(true);
      setTimeout(() => phoneInputRef.current?.focus(), 200);
    } catch {
      setWhatsappLoading(false);
      setPhoneInput("");
      setShowPhonePrompt(true);
    }
  }, [order, openWhatsApp]);

  if (!order) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <Feather name="check-circle" size={20} color={colors.success ?? "#22c55e"} />
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ticket Created</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Ticket badge */}
          <View style={[styles.ticketBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
            <Text style={[styles.ticketNumberLabel, { color: colors.mutedForeground }]}>Ticket Number</Text>
            <Text style={[styles.ticketNumber, { color: colors.primary }]}>#{order.ticketNumber}</Text>
          </View>

          {/* Info rows */}
          <View style={[styles.infoBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <InfoRow label="Customer" value={order.customerName} colors={colors} />
            <InfoRow label="Type" value={order.orderType === "express" ? "Express" : "Drop-off"} colors={colors} />
            <InfoRow
              label="Ready by"
              value={new Date(order.promisedAt).toLocaleDateString("en-AE", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              colors={colors}
            />
            <InfoRow label="Amount Due" value={formatCurrency(order.total)} colors={colors} bold />
          </View>

          {/* Pending badge */}
          <View style={[styles.pendingBadge, { borderColor: colors.warning ?? "#f59e0b", backgroundColor: (colors.warning ?? "#f59e0b") + "15" }]}>
            <Feather name="clock" size={13} color={colors.warning ?? "#f59e0b"} />
            <Text style={[styles.pendingText, { color: colors.warning ?? "#f59e0b" }]}>
              Payment due on collection
            </Text>
          </View>

          {/* Phone prompt */}
          {showPhonePrompt && (
            <View style={[styles.phonePrompt, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.phoneLabel, { color: colors.foreground }]}>Enter customer phone (with country code):</Text>
              <View style={styles.phoneRow}>
                <TextInput
                  ref={phoneInputRef}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  placeholder="e.g. 971501234567"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.phoneInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                />
                <TouchableOpacity
                  onPress={async () => { setShowPhonePrompt(false); await openWhatsApp(phoneInput); }}
                  style={[styles.phoneSendBtn, { backgroundColor: "#25D366" }]}
                >
                  <Feather name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setShowPhonePrompt(false)}>
                <Text style={[styles.cancelPhone, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action buttons */}
          {!showPhonePrompt && (
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={handlePrint}
                disabled={printing}
                style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                {printing
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Feather name="printer" size={16} color={colors.foreground} />
                }
                <Text style={[styles.actionBtnText, { color: colors.foreground }]}>
                  {printing ? "Printing…" : "Print Ticket"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleWhatsApp}
                disabled={whatsappLoading}
                style={[styles.actionBtn, { backgroundColor: "#25D366" + "18", borderColor: "#25D366" + "60" }]}
              >
                {whatsappLoading
                  ? <ActivityIndicator size="small" color="#25D366" />
                  : <Feather name="message-circle" size={16} color="#25D366" />
                }
                <Text style={[styles.actionBtnText, { color: "#25D366" }]}>
                  {whatsappLoading ? "Opening…" : "Send via WhatsApp"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.doneBtnText, { color: "#fff" }]}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, colors, bold }: { label: string; value: string; colors: any; bold?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground, fontWeight: bold ? "700" : "500" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20,
  },
  card: {
    width: "100%", maxWidth: 420, borderRadius: 16, borderWidth: 1, overflow: "hidden",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  ticketBadge: {
    alignItems: "center", paddingVertical: 14, marginHorizontal: 16, marginTop: 14,
    borderRadius: 10, borderWidth: 1,
  },
  ticketNumberLabel: { fontSize: 11, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  ticketNumber: { fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  infoBox: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 10, borderWidth: 1, overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 8,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13 },
  pendingBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginTop: 10, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  pendingText: { fontSize: 12, fontWeight: "600" },
  phonePrompt: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 10, borderWidth: 1, padding: 12,
  },
  phoneLabel: { fontSize: 13, marginBottom: 8 },
  phoneRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  phoneInput: {
    flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14,
  },
  phoneSendBtn: {
    width: 42, borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  cancelPhone: { fontSize: 12, textAlign: "center" },
  actions: {
    marginHorizontal: 16, marginTop: 14, gap: 8,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderRadius: 10, paddingVertical: 12,
  },
  actionBtnText: { fontSize: 14, fontWeight: "600" },
  doneBtn: {
    borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 4,
  },
  doneBtnText: { fontSize: 15, fontWeight: "700" },
});
