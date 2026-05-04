import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import * as Haptics from "expo-haptics";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import { generateZReportHTML } from "@/lib/receiptTemplate";
import type { BusinessSettings, Sale, SaleItem } from "@/types";
import { formatCurrency } from "@/types";

function getStartOfDay(date: Date): number {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d.getTime();
}
function getEndOfDay(date: Date): number {
  const d = new Date(date); d.setHours(23, 59, 59, 999); return d.getTime() + 1;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function SummaryRow({ label, value, valueColor, bold }: { label: string; value: string; valueColor: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: "#999" }]}>{label}</Text>
      <Text style={[s.rowValue, { color: valueColor, fontWeight: bold ? "700" : "600" }]}>{value}</Text>
    </View>
  );
}

export function CloseRegisterModal({ visible, onClose, onSuccess }: Props) {
  const colors = useColors();
  const { loadSalesWithItemsByDateRange, saveZReport, loadBusinessSettings } = useDatabase();

  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  const today = useMemo(() => new Date(), [visible]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadSalesWithItemsByDateRange(getStartOfDay(today), getEndOfDay(today));
      setSales(result.sales);
      setItems(result.items);
    } catch {
      setSales([]); setItems([]);
    } finally {
      setLoading(false);
    }
  }, [today, loadSalesWithItemsByDateRange]);

  useEffect(() => {
    if (visible) {
      setClosingCash("");
      setIsClosing(false);
      fetchData();
    }
  }, [visible, fetchData]);

  const stats = useMemo(() => {
    const validSales = sales.filter((s) => !s.isRefund);
    const refundSales = sales.filter((s) => s.isRefund);
    const revenue = validSales.reduce((sum, s) => sum + s.total, 0);
    const refunds = refundSales.reduce((sum, s) => sum + Math.abs(s.total), 0);
    const vatCollected = validSales.reduce((sum, s) => sum + s.vatAmount, 0);
    const discountTotal = validSales.reduce((sum, s) => sum + (s.discountAmount || 0), 0);
    const methods = ["Card", "Cash", "Credit", "Split"];
    const paymentBreakdown = methods.map((m) => ({
      method: m,
      count: validSales.filter((s) => s.paymentMethod === m).length,
      amount: validSales.filter((s) => s.paymentMethod === m).reduce((sum, s) => sum + s.total, 0),
    })).filter((p) => p.count > 0);
    const staffMap = new Map<string, { name: string; amount: number; count: number }>();
    validSales.forEach((s) => {
      const sn = s.staffName || "Unknown";
      const ex = staffMap.get(sn);
      if (ex) { ex.amount += s.total; ex.count++; } else { staffMap.set(sn, { name: sn, amount: s.total, count: 1 }); }
    });
    const categoryMap = new Map<string, { category: string; revenue: number }>();
    items.forEach((item) => {
      if (item.quantity < 0) return;
      const cat = item.productId || "Other";
      const ex = categoryMap.get(cat);
      if (ex) { ex.revenue += item.lineTotal; } else { categoryMap.set(cat, { category: cat, revenue: item.lineTotal }); }
    });
    return {
      transactionCount: validSales.length,
      revenue, refunds, refundCount: refundSales.length,
      vatCollected, discountTotal, paymentBreakdown,
      staffSales: Array.from(staffMap.values()),
      categoryBreakdown: Array.from(categoryMap.values()),
    };
  }, [sales, items]);

  const cashExpected = stats.paymentBreakdown.find((p) => p.method === "Cash")?.amount ?? 0;
  const cashEntered = parseFloat(closingCash) || 0;
  const variance = cashEntered - cashExpected;
  const hasInput = closingCash.trim() !== "";

  const printZReport = async (html: string): Promise<boolean> => {
    if (Platform.OS === "web") {
      try {
        const w = window.open("", "_blank", "width=400,height=700");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); return true; }
        return false;
      } catch { return false; }
    }
    try {
      const Print = await import("expo-print");
      await Print.printAsync({ html });
      return true;
    } catch { return false; }
  };

  const emailZReport = async (html: string, business: BusinessSettings, dateLabel: string): Promise<boolean> => {
    const recipientEmail = business.zReportEmail?.trim();
    if (!recipientEmail) return false;
    const smtp = business.smtpConfig;
    const hasSmtp = smtp?.host && smtp?.user && smtp?.pass;
    if (hasSmtp) {
      try {
        const baseUrl = Platform.OS === "web" ? "" : `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
        const response = await fetch(`${baseUrl}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipientEmail,
            subject: `Z-Report - ${business.businessName || "POS"} - ${dateLabel}`,
            html,
            config: smtp,
          }),
        });
        const result = await response.json() as { success: boolean };
        return result.success;
      } catch { return false; }
    }
    if (Platform.OS === "web") {
      try {
        const subject = encodeURIComponent(`Z-Report - ${dateLabel}`);
        const body = encodeURIComponent(`Z-Report\nNet Sales: ${formatCurrency(stats.revenue - stats.refunds)}\nTransactions: ${stats.transactionCount}`);
        window.open(`mailto:${encodeURIComponent(recipientEmail)}?subject=${subject}&body=${body}`, "_blank");
        return true;
      } catch { return false; }
    }
    try {
      const Print = await import("expo-print");
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const MailComposer = await import("expo-mail-composer");
      const isAvailable = await MailComposer.isAvailableAsync();
      if (isAvailable) {
        await MailComposer.composeAsync({
          recipients: [recipientEmail],
          subject: `Z-Report - ${dateLabel}`,
          body: "",
          attachments: [uri],
        });
        return true;
      }
      return false;
    } catch { return false; }
  };

  const handleCloseRegister = async () => {
    Alert.alert(
      "Close Register?",
      "This will generate the Z-Report and reset today's session. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Register",
          style: "destructive",
          onPress: async () => {
            setIsClosing(true);
            try {
              const cashVal = parseFloat(closingCash) || 0;
              const dateStr = today.toISOString().split("T")[0];
              const report = {
                date: dateStr,
                openedAt: getStartOfDay(today),
                closedAt: Date.now(),
                openingCash: 0,
                closingCash: cashVal,
                totalSales: stats.revenue,
                totalRefunds: stats.refunds,
                netSales: stats.revenue - stats.refunds,
                totalVat: stats.vatCollected,
                totalDiscount: stats.discountTotal,
                transactionCount: stats.transactionCount,
                refundCount: stats.refundCount,
                paymentBreakdown: stats.paymentBreakdown.map((p) => ({ method: p.method, amount: p.amount })),
                categorySales: stats.categoryBreakdown.map((c) => ({ category: c.category, amount: c.revenue })),
                staffSales: stats.staffSales.map((sv) => ({ staffName: sv.name, amount: sv.amount, count: sv.count })),
              };

              await saveZReport(report);
              const business = await loadBusinessSettings();
              const html = generateZReportHTML(report, business);
              const dateLabel = today.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

              const printed = await printZReport(html);
              let emailSent = false;
              if (business.zReportEmail?.trim()) {
                emailSent = await emailZReport(html, business, dateLabel);
              }

              setIsClosing(false);
              onClose();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              const parts: string[] = ["Register closed. Z-Report saved successfully."];
              if (printed) parts.push("Print dialog opened.");
              else parts.push("Printing not available on this device.");
              if (business.zReportEmail?.trim()) {
                parts.push(emailSent ? `Email sent to ${business.zReportEmail}.` : "Could not send Z-Report email.");
              }
              Alert.alert("Register Closed", parts.join("\n\n"));
              onSuccess?.();
            } catch {
              setIsClosing(false);
              Alert.alert("Error", "Failed to close register. Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[s.sheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}
        >
          <View style={[s.header, { borderBottomColor: colors.border }]}>
            <View style={[s.headerIcon, { backgroundColor: colors.destructive + "18" }]}>
              <Feather name="moon" size={20} color={colors.destructive} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: colors.foreground }]}>End of Day</Text>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
                {today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={isClosing} style={s.closeX}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={s.loadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading today's data...</Text>
              </View>
            ) : (
              <>
                <View style={[s.summaryBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <Text style={[s.sectionLabel, { color: colors.foreground }]}>Today's Summary</Text>
                  <SummaryRow label="Gross Sales" value={formatCurrency(stats.revenue)} valueColor={colors.success} bold />
                  {stats.refunds > 0 && (
                    <SummaryRow label="Refunds" value={`-${formatCurrency(stats.refunds)}`} valueColor={colors.destructive} />
                  )}
                  <SummaryRow
                    label="Net Sales"
                    value={formatCurrency(stats.revenue - stats.refunds)}
                    valueColor={colors.foreground}
                    bold
                  />
                  <View style={[s.divider, { backgroundColor: colors.border }]} />
                  <SummaryRow label="VAT Collected (5%)" value={formatCurrency(stats.vatCollected)} valueColor={colors.foreground} />
                  <SummaryRow label="Transactions" value={`${stats.transactionCount}`} valueColor={colors.foreground} />
                  {stats.discountTotal > 0 && (
                    <SummaryRow label="Total Discounts" value={formatCurrency(stats.discountTotal)} valueColor="#F39C12" />
                  )}
                  {stats.paymentBreakdown.length > 0 && (
                    <>
                      <View style={[s.divider, { backgroundColor: colors.border }]} />
                      {stats.paymentBreakdown.map((p) => (
                        <SummaryRow
                          key={p.method}
                          label={`${p.method} (${p.count} txn)`}
                          value={formatCurrency(p.amount)}
                          valueColor={colors.mutedForeground}
                        />
                      ))}
                    </>
                  )}
                  {stats.transactionCount === 0 && (
                    <Text style={[s.noSalesText, { color: colors.mutedForeground }]}>No sales recorded today.</Text>
                  )}
                </View>

                <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Actual Cash in Drawer (AED)</Text>
                <TextInput
                  value={closingCash}
                  onChangeText={setClosingCash}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  style={[s.cashInput, {
                    backgroundColor: colors.secondary,
                    borderColor: colors.border,
                    color: colors.foreground,
                    borderRadius: colors.radius,
                  }]}
                />

                <View style={[s.varianceBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <SummaryRow
                    label="Cash Sales (Expected)"
                    value={formatCurrency(cashExpected)}
                    valueColor={colors.foreground}
                  />
                  {hasInput && (
                    <SummaryRow
                      label={`Variance ${variance > 0 ? "(Over)" : variance < 0 ? "(Short)" : "(Exact)"}`}
                      value={`${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`}
                      valueColor={variance === 0 ? colors.success : variance > 0 ? colors.success : colors.destructive}
                      bold
                    />
                  )}
                </View>
              </>
            )}
          </ScrollView>

          <View style={s.actions}>
            <TouchableOpacity
              onPress={onClose}
              disabled={isClosing}
              style={[s.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius, opacity: isClosing ? 0.4 : 1 }]}
            >
              <Text style={{ color: colors.mutedForeground, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCloseRegister}
              disabled={isClosing || loading}
              style={[s.closeBtn, { backgroundColor: colors.destructive, borderRadius: colors.radius, opacity: isClosing || loading ? 0.6 : 1 }]}
            >
              {isClosing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="moon" size={16} color="#fff" />
              )}
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>
                {isClosing ? "Closing..." : "Close Register"}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", padding: 20, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeX: { padding: 4 },
  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13 },
  summaryBox: { padding: 14, marginBottom: 14, gap: 5 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  divider: { height: 1, marginVertical: 6 },
  noSalesText: { fontSize: 13, textAlign: "center", paddingVertical: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  cashInput: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  varianceBox: { padding: 12, marginBottom: 18, gap: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  rowLabel: { fontSize: 13, flex: 1 },
  rowValue: { fontSize: 13, textAlign: "right" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  closeBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: 6 },
});
