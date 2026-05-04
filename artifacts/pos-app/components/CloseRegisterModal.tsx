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

function Row({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: "#888" }]}>{label}</Text>
      <Text style={[s.rowValue, { color, fontWeight: bold ? "700" : "600" }]}>{value}</Text>
    </View>
  );
}

export function CloseRegisterModal({ visible, onClose, onSuccess }: Props) {
  const colors = useColors();
  const { loadSalesWithItemsByDateRange, saveZReport, loadBusinessSettings, saveBusinessSettings } = useDatabase();

  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [resultLines, setResultLines] = useState<string[]>([]);

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split("T")[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadSalesWithItemsByDateRange(
        getStartOfDay(todayDate),
        getEndOfDay(todayDate)
      );
      setSales(result.sales);
      setItems(result.items);
    } catch {
      setSales([]); setItems([]);
    } finally {
      setLoading(false);
    }
  }, [loadSalesWithItemsByDateRange]);

  useEffect(() => {
    if (visible) {
      setClosingCash("");
      setIsClosing(false);
      setConfirming(false);
      setDone(false);
      setResultLines([]);
      fetchData();
    }
  }, [visible]);

  const stats = useMemo(() => {
    const valid = sales.filter((s) => !s.isRefund);
    const refunds = sales.filter((s) => s.isRefund);
    const revenue = valid.reduce((sum, s) => sum + s.total, 0);
    const refundAmt = refunds.reduce((sum, s) => sum + Math.abs(s.total), 0);
    const vatCollected = valid.reduce((sum, s) => sum + s.vatAmount, 0);
    const discountTotal = valid.reduce((sum, s) => sum + (s.discountAmount || 0), 0);
    const methods = ["Card", "Cash", "Credit", "Split"];
    const paymentBreakdown = methods.map((m) => ({
      method: m,
      count: valid.filter((s) => s.paymentMethod === m).length,
      amount: valid.filter((s) => s.paymentMethod === m).reduce((sum, s) => sum + s.total, 0),
    })).filter((p) => p.count > 0);
    const staffMap = new Map<string, { name: string; amount: number; count: number }>();
    valid.forEach((s) => {
      const sn = s.staffName || "Unknown";
      const ex = staffMap.get(sn);
      if (ex) { ex.amount += s.total; ex.count++; } else { staffMap.set(sn, { name: sn, amount: s.total, count: 1 }); }
    });
    return {
      transactionCount: valid.length,
      revenue,
      refunds: refundAmt,
      refundCount: refunds.length,
      vatCollected,
      discountTotal,
      paymentBreakdown,
      staffSales: Array.from(staffMap.values()),
    };
  }, [sales, items]);

  const cashExpected = stats.paymentBreakdown.find((p) => p.method === "Cash")?.amount ?? 0;
  const cashEntered = parseFloat(closingCash) || 0;
  const variance = cashEntered - cashExpected;
  const hasInput = closingCash.trim() !== "";

  const printZReport = async (html: string): Promise<boolean> => {
    if (Platform.OS === "web") {
      try {
        const w = window.open("", "_blank", "width=420,height=700");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 350); return true; }
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
    const to = business.zReportEmail?.trim();
    if (!to) return false;
    const smtp = business.smtpConfig;
    if (smtp?.host && smtp?.user && smtp?.pass) {
      try {
        const base = Platform.OS === "web" ? "" : `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
        const res = await fetch(`${base}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, subject: `Z-Report - ${business.businessName || "POS"} - ${dateLabel}`, html, config: smtp }),
        });
        return ((await res.json()) as { success: boolean }).success;
      } catch { return false; }
    }
    if (Platform.OS === "web") {
      try {
        const subject = encodeURIComponent(`Z-Report - ${dateLabel}`);
        const body = encodeURIComponent(`Z-Report\nNet Sales: ${formatCurrency(stats.revenue - stats.refunds)}\nTransactions: ${stats.transactionCount}`);
        window.open(`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`, "_blank");
        return true;
      } catch { return false; }
    }
    try {
      const Print = await import("expo-print");
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const MailComposer = await import("expo-mail-composer");
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({ recipients: [to], subject: `Z-Report - ${dateLabel}`, body: "", attachments: [uri] });
        return true;
      }
      return false;
    } catch { return false; }
  };

  const doCloseRegister = async () => {
    setIsClosing(true);
    try {
      const cashVal = parseFloat(closingCash) || 0;
      const dateLabel = todayDate.toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
      });

      const report = {
        date: todayStr,
        openedAt: getStartOfDay(todayDate),
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
        categorySales: [],
        staffSales: stats.staffSales.map((sv) => ({ staffName: sv.name, amount: sv.amount, count: sv.count })),
      };

      await saveZReport(report);

      const business = await loadBusinessSettings();
      await saveBusinessSettings({ ...business, lastClosedDate: todayStr });

      const html = generateZReportHTML(report, business);

      const lines: string[] = [`Z-Report saved for ${dateLabel}.`];

      const printed = await printZReport(html);
      lines.push(printed ? "Print dialog opened." : "Printing not available on this device.");

      if (business.zReportEmail?.trim()) {
        const sent = await emailZReport(html, business, dateLabel);
        lines.push(sent ? `Email sent to ${business.zReportEmail}.` : "Could not send Z-Report email — check email settings.");
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResultLines(lines);
      setDone(true);
    } catch (err: any) {
      setIsClosing(false);
      setConfirming(false);
      Alert.alert("Error", err?.message ?? "Failed to close register. Please try again.");
    }
  };

  const handleDismiss = () => {
    onClose();
    if (done) onSuccess?.();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleDismiss}>
      <View style={s.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[s.sheet, { backgroundColor: colors.card, borderRadius: 20 }]}
        >
          {/* Header */}
          <View style={[s.header, { borderBottomColor: colors.border }]}>
            <View style={[s.iconWrap, { backgroundColor: colors.destructive + "18" }]}>
              <Feather name="moon" size={20} color={colors.destructive} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: colors.foreground }]}>End of Day</Text>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
                {todayDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </View>
            {!isClosing && (
              <TouchableOpacity onPress={handleDismiss} style={s.closeX}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* SUCCESS STATE */}
            {done ? (
              <View style={s.successBox}>
                <View style={[s.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Feather name="check-circle" size={40} color={colors.success} />
                </View>
                <Text style={[s.successTitle, { color: colors.foreground }]}>Register Closed</Text>
                {resultLines.map((line, i) => (
                  <Text key={i} style={[s.successLine, { color: colors.mutedForeground }]}>{line}</Text>
                ))}
                <TouchableOpacity
                  onPress={handleDismiss}
                  style={[s.doneBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : loading ? (
              <View style={s.loadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading today's data…</Text>
              </View>
            ) : (
              <>
                {/* Summary */}
                <View style={[s.box, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <Text style={[s.boxTitle, { color: colors.foreground }]}>Today's Summary</Text>
                  <Row label="Gross Sales" value={formatCurrency(stats.revenue)} color={colors.success} bold />
                  {stats.refunds > 0 && (
                    <Row label="Refunds" value={`-${formatCurrency(stats.refunds)}`} color={colors.destructive} />
                  )}
                  <View style={[s.divider, { backgroundColor: colors.border }]} />
                  <Row label="Net Sales" value={formatCurrency(stats.revenue - stats.refunds)} color={colors.foreground} bold />
                  <Row label="VAT Collected (5%)" value={formatCurrency(stats.vatCollected)} color={colors.foreground} />
                  <Row label="Transactions" value={`${stats.transactionCount}`} color={colors.foreground} />
                  {stats.discountTotal > 0 && (
                    <Row label="Discounts Given" value={formatCurrency(stats.discountTotal)} color="#F39C12" />
                  )}
                  {stats.paymentBreakdown.length > 0 && (
                    <>
                      <View style={[s.divider, { backgroundColor: colors.border }]} />
                      {stats.paymentBreakdown.map((p) => (
                        <Row key={p.method} label={`${p.method} (${p.count} txn)`} value={formatCurrency(p.amount)} color={colors.mutedForeground} />
                      ))}
                    </>
                  )}
                  {stats.transactionCount === 0 && (
                    <Text style={[s.noSales, { color: colors.mutedForeground }]}>No sales recorded today.</Text>
                  )}
                </View>

                {/* Cash input */}
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
                <View style={[s.box, { backgroundColor: colors.secondary, borderRadius: colors.radius, marginBottom: 16 }]}>
                  <Row label="Cash Sales (Expected)" value={formatCurrency(cashExpected)} color={colors.foreground} />
                  {hasInput && (
                    <Row
                      label={`Variance ${variance > 0 ? "(Over)" : variance < 0 ? "(Short)" : "(Exact)"}`}
                      value={`${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`}
                      color={variance === 0 ? colors.success : variance > 0 ? colors.success : colors.destructive}
                      bold
                    />
                  )}
                </View>

                {/* Inline confirmation panel */}
                {confirming && (
                  <View style={[s.confirmPanel, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "40", borderRadius: colors.radius }]}>
                    <Feather name="alert-triangle" size={16} color={colors.destructive} style={{ marginRight: 8 }} />
                    <Text style={[s.confirmText, { color: colors.foreground, flex: 1 }]}>
                      This will save the Z-Report and mark today as closed. Continue?
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Action buttons */}
          {!done && !loading && (
            <View style={s.actions}>
              {confirming ? (
                <>
                  <TouchableOpacity
                    onPress={() => setConfirming(false)}
                    disabled={isClosing}
                    style={[s.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius, opacity: isClosing ? 0.4 : 1 }]}
                  >
                    <Text style={{ color: colors.mutedForeground, fontWeight: "600", fontSize: 15 }}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={doCloseRegister}
                    disabled={isClosing}
                    style={[s.closeBtn, { backgroundColor: colors.destructive, borderRadius: colors.radius, opacity: isClosing ? 0.6 : 1 }]}
                  >
                    {isClosing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="check-circle" size={16} color="#fff" />
                    )}
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>
                      {isClosing ? "Closing…" : "Yes, Close Register"}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={handleDismiss}
                    style={[s.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                  >
                    <Text style={{ color: colors.mutedForeground, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setConfirming(true)}
                    style={[s.closeBtn, { backgroundColor: colors.destructive, borderRadius: colors.radius }]}
                  >
                    <Feather name="moon" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>Close Register</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeX: { padding: 4 },
  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13 },
  box: { padding: 14, marginBottom: 12, gap: 5 },
  boxTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  divider: { height: 1, marginVertical: 6 },
  noSales: { fontSize: 13, textAlign: "center", paddingVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  rowLabel: { fontSize: 13, flex: 1 },
  rowValue: { fontSize: 13, textAlign: "right" },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  cashInput: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  confirmPanel: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  confirmText: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  closeBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  successBox: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 16, gap: 8 },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  successLine: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  doneBtn: { marginTop: 20, paddingVertical: 14, paddingHorizontal: 40, alignItems: "center" },
});
