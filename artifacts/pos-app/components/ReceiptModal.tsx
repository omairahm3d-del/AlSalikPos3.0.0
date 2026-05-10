import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUsbPrint } from "@/context/UsbPrintContext";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import { generateReceiptHTML } from "@/lib/receiptTemplate";
import { formatWhatsAppPhone, generateWhatsAppReceipt } from "@/lib/textReceipt";
import type { BusinessSettings, Sale, SaleItem } from "@/types";
import { formatCurrency } from "@/types";

interface Props {
  visible: boolean;
  sale: Sale | null;
  onClose: () => void;
}

export function ReceiptModal({ visible, sale, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadSaleWithItems, loadBusinessSettings, loadCustomers } = useDatabase();

  const [items, setItems] = useState<SaleItem[]>([]);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);

  const loadData = useCallback(async () => {
    if (!sale) return;
    setLoading(true);
    try {
      const [saleData, settings] = await Promise.all([
        loadSaleWithItems(sale.id),
        loadBusinessSettings(),
      ]);
      setItems(saleData?.items ?? []);
      setBusiness(settings);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sale, loadSaleWithItems, loadBusinessSettings]);

  useEffect(() => {
    if (visible && sale) loadData();
  }, [visible, sale, loadData]);

  const isTrnValid = business?.trn ? /^\d{15}$/.test(business.trn) : false;

  const { captureAndPrintBitmap } = useUsbPrint();

  const handlePrint = async () => {
    if (!sale || !business) return;
    try {
      const { printHtml } = await import("@/lib/printBridge");
      const ps = business.printerSettings;
      const isDirect = (ps?.printMethod ?? "system") === "direct";

      if (isDirect) {
        const { generateReceiptText } = await import("@/lib/textReceipt");
        const rawText = generateReceiptText(sale, items, business);
        if (Platform.OS === "web" && !window.electronPOS) {
          const w = window.open("", "_blank");
          if (w) {
            w.document.write(`<html><head><title>Receipt</title><style>body{font-family:monospace;white-space:pre;font-size:13px;padding:16px;}</style></head><body>${rawText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>`);
            w.document.close();
            w.focus();
            setTimeout(() => { w.print(); }, 400);
          }
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
        return;
      }

      const html = generateReceiptHTML(sale, items, business);

      // USB OTG bitmap mode: capture HTML as image then print via ESC/POS
      if (ps?.usbPrinterEnabled && ps.usbPrinterVendorId != null && ps.usbPrintMode === "bitmap") {
        try {
          const ok = await captureAndPrintBitmap(html, ps);
          if (!ok) Alert.alert("USB Print Failed", "Could not print via USB OTG.\n\nCheck that:\n• The printer is plugged in via OTG cable\n• The printer is powered on\n• You granted USB permission when prompted");
        } catch (e: any) {
          Alert.alert("USB Print Error", e?.message ?? "Unknown error");
        }
        return;
      }

      const needRawText =
        !!ps?.rawTextMode ||
        !!ps?.androidPrinterEnabled ||
        !!ps?.sunmiEnabled ||
        !!ps?.networkPrinterEnabled ||
        !!ps?.bluetoothPrinterEnabled ||
        (!!ps?.usbPrinterEnabled && ps?.usbPrintMode !== "bitmap");
      let rawText: string | undefined;
      if (needRawText) {
        const { generateReceiptText } = await import("@/lib/textReceipt");
        rawText = generateReceiptText(sale, items, business);
      }
      await printHtml(html, {
        deviceName: ps?.windowsReceiptPrinterName || "",
        paperWidth: ps?.paperWidth || "80mm",
        rawMode: !!ps?.rawTextMode,
        rawText,
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
    } catch {
    }
  };

  const handleShare = async () => {
    if (!sale || !business) return;
    if (Platform.OS === "web") {
      const html = generateReceiptHTML(sale, items, business);
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); }, 400);
      }
      return;
    }
    try {
      const Print = await import("expo-print");
      const Sharing = await import("expo-sharing");
      const html = generateReceiptHTML(sale, items, business);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Save Receipt as PDF" });
    } catch {
    }
  };

  const openWhatsApp = useCallback(async (phone: string) => {
    if (!sale || !business) return;
    const cleaned = formatWhatsAppPhone(phone);
    if (!cleaned || cleaned.length < 7) {
      Alert.alert("Invalid Number", "Please enter a valid phone number including country code (e.g. 971501234567).");
      return;
    }
    const message = generateWhatsAppReceipt(sale, items, business);
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
  }, [sale, items, business]);

  const handleWhatsApp = useCallback(async () => {
    if (!sale || !business) return;
    setWhatsappLoading(true);
    try {
      if (sale.customerId) {
        const customers = await loadCustomers();
        const customer = customers.find((c) => c.id === sale.customerId);
        if (customer?.phone?.trim()) {
          setWhatsappLoading(false);
          await openWhatsApp(customer.phone.trim());
          return;
        }
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
  }, [sale, business, loadCustomers, openWhatsApp]);

  const handleSendFromPrompt = useCallback(async () => {
    setShowPhonePrompt(false);
    await openWhatsApp(phoneInput);
  }, [phoneInput, openWhatsApp]);

  if (!sale) return null;

  const vatPct = Math.round(sale.vatRate * 100);
  const dateStr = new Date(sale.createdAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Tax Invoice</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.receiptCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.receiptHeader, { color: colors.foreground }]}>فاتورة ضريبية مبسطة</Text>
              <Text style={[styles.receiptSubHeader, { color: colors.foreground }]}>SIMPLIFIED TAX INVOICE</Text>

              {business?.businessName ? (
                <Text style={[styles.bizName, { color: colors.foreground }]}>{business.businessName}</Text>
              ) : null}
              {business?.trn ? (
                <Text style={[styles.bizDetail, { color: colors.mutedForeground }]}>TRN: {business.trn}</Text>
              ) : (
                <Text style={[styles.bizDetail, { color: colors.destructive }]}>TRN: Not configured</Text>
              )}
              {business?.address ? (
                <Text style={[styles.bizDetail, { color: colors.mutedForeground }]}>{business.address}</Text>
              ) : null}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Invoice #</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>{sale.invoiceNumber || "N/A"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Date</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>{dateStr}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Payment</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>{sale.paymentMethod}</Text>
              </View>
              {sale.customerName ? (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Customer</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>{sale.customerName}</Text>
                </View>
              ) : null}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.tableHeader}>
                <Text style={[styles.thItem, { color: colors.mutedForeground }]}>Item</Text>
                <Text style={[styles.thQty, { color: colors.mutedForeground }]}>Qty</Text>
                <Text style={[styles.thPrice, { color: colors.mutedForeground }]}>Price</Text>
                <Text style={[styles.thAmount, { color: colors.mutedForeground }]}>Amount</Text>
              </View>

              {items.map((item) => (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={[styles.tdItem, { color: colors.foreground }]} numberOfLines={1}>{item.productName}</Text>
                  <Text style={[styles.tdQty, { color: colors.foreground }]}>{item.quantity}</Text>
                  <Text style={[styles.tdPrice, { color: colors.foreground }]}>{item.productPrice.toFixed(2)}</Text>
                  <Text style={[styles.tdAmount, { color: colors.foreground }]}>{item.lineTotal.toFixed(2)}</Text>
                </View>
              ))}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal (Excl. VAT)</Text>
                <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatCurrency(sale.subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>VAT ({vatPct}%)</Text>
                <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatCurrency(sale.vatAmount)}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.totalRow}>
                <Text style={[styles.grandLabel, { color: colors.foreground }]}>TOTAL (Incl. VAT)</Text>
                <Text style={[styles.grandValue, { color: colors.success }]}>{formatCurrency(sale.total)}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                Prices are inclusive of {vatPct}% VAT where applicable
              </Text>
              <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                شكراً لتعاملكم معنا
              </Text>
            </View>

            {!isTrnValid && (
              <View style={[styles.trnWarning, { backgroundColor: colors.destructive + "18", borderRadius: colors.radius }]}>
                <Feather name="alert-triangle" size={14} color={colors.destructive} />
                <Text style={[styles.trnWarningText, { color: colors.destructive }]}>
                  TRN not configured. Go to Back Office → Business Settings to add your 15-digit Tax Registration Number for compliant invoices.
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={handlePrint}
                style={[styles.actionBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              >
                <Feather name="printer" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Print</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleWhatsApp}
                disabled={whatsappLoading}
                style={[styles.actionBtn, { backgroundColor: "#25D366", borderRadius: colors.radius, opacity: whatsappLoading ? 0.7 : 1 }]}
              >
                {whatsappLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="message-circle" size={18} color="#fff" />
                )}
                <Text style={styles.actionBtnText}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleShare}
                style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}
              >
                <Feather name="share-2" size={18} color={colors.foreground} />
                <Text style={[styles.actionBtnText, { color: colors.foreground }]}>PDF</Text>
              </TouchableOpacity>

            </View>
          </ScrollView>
        )}
      </View>

      {/* ── Phone number prompt ──────────────────────────────────── */}
      <Modal
        visible={showPhonePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhonePrompt(false)}
      >
        <View style={styles.promptOverlay}>
          <View style={[styles.promptBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 4 }]}>
            <View style={styles.promptHeader}>
              <View style={[styles.promptIcon, { backgroundColor: "#25D366" + "20" }]}>
                <Feather name="message-circle" size={20} color="#25D366" />
              </View>
              <Text style={[styles.promptTitle, { color: colors.foreground }]}>Send via WhatsApp</Text>
            </View>
            <Text style={[styles.promptSub, { color: colors.mutedForeground }]}>
              Enter the customer's WhatsApp number. Include country code (e.g. 971501234567 for UAE).
            </Text>
            <TextInput
              ref={phoneInputRef}
              value={phoneInput}
              onChangeText={setPhoneInput}
              placeholder="971501234567"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              style={[styles.promptInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              onSubmitEditing={handleSendFromPrompt}
              returnKeyType="send"
            />
            <View style={styles.promptActions}>
              <TouchableOpacity
                onPress={() => setShowPhonePrompt(false)}
                style={[styles.promptBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}
              >
                <Text style={[styles.promptBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSendFromPrompt}
                style={[styles.promptBtn, { backgroundColor: "#25D366", borderRadius: colors.radius }]}
              >
                <Feather name="send" size={15} color="#fff" />
                <Text style={[styles.promptBtnText, { color: "#fff" }]}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  receiptCard: { padding: 20, borderWidth: 1 },
  receiptHeader: { fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 2 },
  receiptSubHeader: { fontSize: 13, fontWeight: "700", textAlign: "center", marginBottom: 12, letterSpacing: 1 },
  bizName: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 4 },
  bizDetail: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  divider: { height: 1, marginVertical: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#444", paddingBottom: 6, marginBottom: 6 },
  thItem: { flex: 3, fontSize: 11, fontWeight: "700" },
  thQty: { flex: 1, fontSize: 11, fontWeight: "700", textAlign: "center" },
  thPrice: { flex: 1.5, fontSize: 11, fontWeight: "700", textAlign: "right" },
  thAmount: { flex: 1.5, fontSize: 11, fontWeight: "700", textAlign: "right" },
  tableRow: { flexDirection: "row", paddingVertical: 4 },
  tdItem: { flex: 3, fontSize: 13 },
  tdQty: { flex: 1, fontSize: 13, textAlign: "center" },
  tdPrice: { flex: 1.5, fontSize: 13, textAlign: "right" },
  tdAmount: { flex: 1.5, fontSize: 13, textAlign: "right", fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  grandLabel: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  grandValue: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  footerText: { fontSize: 11, textAlign: "center", lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    gap: 6,
  },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
  trnWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  trnWarningText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  promptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  promptBox: {
    width: "100%",
    maxWidth: 400,
    padding: 24,
    borderWidth: 1,
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  promptIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  promptTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  promptSub: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  promptInput: {
    height: 48,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 20,
    letterSpacing: 1,
  },
  promptActions: { flexDirection: "row", gap: 10 },
  promptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  promptBtnText: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
