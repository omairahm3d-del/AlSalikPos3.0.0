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
import type { BusinessSettings, Expense, Sale, SaleItem } from "@/types";
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
  const { loadSalesWithItemsByDateRange, saveZReport, loadBusinessSettings, saveBusinessSettings, loadExpenses } = useDatabase();

  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [savedHtml, setSavedHtml] = useState<string>("");
  const [savedBusiness, setSavedBusiness] = useState<BusinessSettings | null>(null);
  const [lastClosedAt, setLastClosedAt] = useState<number>(0);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const business = await loadBusinessSettings();
      // Open-Register flow uses `openedAt` as the session start. Falls back to
      // legacy `lastClosedAt` (pre-feature) and finally start-of-day so older
      // installs still produce a sensible Z-Report.
      const sessionStart = business.openedAt ?? business.lastClosedAt ?? getStartOfDay(today);
      setLastClosedAt(sessionStart);
      const result = await loadSalesWithItemsByDateRange(sessionStart, getEndOfDay(today));
      setSales(result.sales);
      setItems(result.items);
      const exps = await loadExpenses(sessionStart, getEndOfDay(today));
      setExpenses(exps);
    } catch {
      setSales([]); setItems([]); setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [loadSalesWithItemsByDateRange, loadBusinessSettings, loadExpenses]);

  useEffect(() => {
    if (visible) {
      setClosingCash("");
      setIsClosing(false);
      setConfirming(false);
      setDone(false);
      setSavedHtml("");
      setSavedBusiness(null);
      setSales([]);
      setItems([]);
      fetchData();
    } else {
      setClosingCash("");
      setConfirming(false);
      setDone(false);
      setSavedHtml("");
      setSavedBusiness(null);
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

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const cashSales = stats.paymentBreakdown.find((p) => p.method === "Cash")?.amount ?? 0;
  // Expected cash in drawer = opening float + cash sales − cash expenses.
  // Mirrors the formula used in the Z-Report HTML so the modal preview and
  // printed report stay in lock-step.
  const cashExpected = cashSales - totalExpenses;
  const cashEntered = parseFloat(closingCash) || 0;
  const variance = cashEntered - cashExpected;
  const hasInput = closingCash.trim() !== "";

  const printReport = async (html: string) => {
    const ps = savedBusiness?.printerSettings;
    const { printHtml } = await import("@/lib/printBridge");
    await printHtml(html, {
      deviceName: ps?.windowsReceiptPrinterName || "",
      paperWidth: ps?.paperWidth || "80mm",
      rawMode: !!ps?.rawTextMode,
      autoCut: ps?.autoCutPaper !== false,
      codepage: ps?.rawCodepage || "cp1252",
    });
  };

  const sendEmail = async (html: string, business: BusinessSettings): Promise<boolean> => {
    const to = business.zReportEmail?.trim();
    if (!to) return false;
    const smtp = business.smtpConfig;
    const subject = `Z-Report - ${business.businessName || "POS"} - ${dateLabel}`;
    const bodyPlain =
      `Z-Report\nNet Sales: ${formatCurrency(stats.revenue - stats.refunds)}\nTransactions: ${stats.transactionCount}`;

    if (smtp?.host && smtp?.user && smtp?.pass) {
      try {
        const base = Platform.OS === "web" ? "" : `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
        const res = await fetch(`${base}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, subject, html, config: smtp }),
        });
        const json = await res.json() as { success: boolean; message?: string };
        if (json.success) return true;
        Alert.alert("Email Failed", json.message || "Could not send email. Check your SMTP settings in Back Office → Email.");
      } catch (err: any) {
        Alert.alert("Email Failed", err?.message || "Could not reach the email server. Check that the API server is reachable.");
      }
      return false;
    }
    if (Platform.OS === "web") {
      try {
        const subjectEnc = encodeURIComponent(subject);
        const bodyEnc = encodeURIComponent(bodyPlain);
        window.open(`mailto:${encodeURIComponent(to)}?subject=${subjectEnc}&body=${bodyEnc}`, "_blank");
        return true;
      } catch { return false; }
    }
    try {
      const Print = await import("expo-print");
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const MailComposer = await import("expo-mail-composer");
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({
          recipients: [to],
          subject: `Z-Report - ${dateLabel}`,
          body: "",
          attachments: [uri],
        });
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  const doCloseRegister = async () => {
    setIsClosing(true);
    try {
      const cashVal = parseFloat(closingCash) || 0;
      const nowMs = Date.now();

      const business = await loadBusinessSettings();
      const openingFloat = business.openingFloat ?? 0;

      const report = {
        date: todayStr,
        openedAt: lastClosedAt || getStartOfDay(today),
        closedAt: nowMs,
        openingCash: openingFloat,
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
        totalExpenses,
        expenses: expenses.map((e) => ({
          id: e.id, amount: e.amount, note: e.note, staffName: e.staffName, createdAt: e.createdAt,
        })),
      };

      await saveZReport(report);

      // Mark register CLOSED, persist the cash count for the next open-register
      // pre-fill, and clear the per-session opening float so a stale value
      // doesn't carry into tomorrow.
      const updatedBusiness: BusinessSettings = {
        ...business,
        lastClosedAt: nowMs,
        registerOpen: false,
        lastClosingCash: cashVal,
        openingFloat: 0,
        openedAt: undefined,
      };
      await saveBusinessSettings(updatedBusiness);

      const html = generateZReportHTML(report, updatedBusiness);
      setSavedHtml(html);
      setSavedBusiness(updatedBusiness);

      if (updatedBusiness.zReportEmail?.trim()) {
        sendEmail(html, updatedBusiness);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsClosing(false);
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
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{dateLabel}</Text>
            </View>
            <TouchableOpacity onPress={handleDismiss} disabled={isClosing} style={[s.closeX, { opacity: isClosing ? 0.3 : 1 }]}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── SUCCESS STATE ── */}
            {done ? (
              <View style={s.successBox}>
                <View style={[s.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Feather name="check-circle" size={44} color={colors.success} />
                </View>
                <Text style={[s.successTitle, { color: colors.foreground }]}>Register Closed</Text>
                <Text style={[s.successSub, { color: colors.mutedForeground }]}>
                  Z-Report saved. Next session starts fresh.
                </Text>
                {savedBusiness?.zReportEmail?.trim() && (
                  <Text style={[s.successSub, { color: colors.mutedForeground }]}>
                    Email sent to {savedBusiness.zReportEmail}.
                  </Text>
                )}

                <View style={s.successActions}>
                  {!!savedHtml && (
                    <TouchableOpacity
                      onPress={() => printReport(savedHtml)}
                      style={[s.successActionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}
                    >
                      <Feather name="printer" size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontWeight: "600", marginLeft: 6 }}>Print Z-Report</Text>
                    </TouchableOpacity>
                  )}
                  {!!savedHtml && !!savedBusiness?.zReportEmail?.trim() && (
                    <TouchableOpacity
                      onPress={() => savedBusiness && sendEmail(savedHtml, savedBusiness)}
                      style={[s.successActionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}
                    >
                      <Feather name="mail" size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontWeight: "600", marginLeft: 6 }}>Resend Email</Text>
                    </TouchableOpacity>
                  )}
                </View>

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
                <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading session data…</Text>
              </View>

            ) : (
              <>
                {/* Session badge */}
                {lastClosedAt > 0 && (
                  <View style={[s.sessionBadge, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30", borderRadius: colors.radius }]}>
                    <Feather name="clock" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, marginLeft: 6 }}>
                      Session started: {new Date(lastClosedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                )}

                {/* Summary */}
                <View style={[s.box, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <Text style={[s.boxTitle, { color: colors.foreground }]}>Session Summary</Text>
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
                        <Row
                          key={p.method}
                          label={`${p.method} (${p.count} txn)`}
                          value={formatCurrency(p.amount)}
                          color={colors.mutedForeground}
                        />
                      ))}
                    </>
                  )}
                  {stats.transactionCount === 0 && (
                    <Text style={[s.noSales, { color: colors.mutedForeground }]}>No sales in this session.</Text>
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
                    borderColor: hasInput ? colors.primary : colors.border,
                    color: colors.foreground,
                    borderRadius: colors.radius,
                  }]}
                />
                {totalExpenses > 0 && (
                  <View style={[s.box, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                    <Text style={[s.boxTitle, { color: colors.foreground }]}>Cash-Out Expenses</Text>
                    {expenses.map((e) => (
                      <Row
                        key={e.id}
                        label={e.note || "Expense"}
                        value={`-${formatCurrency(e.amount)}`}
                        color={colors.destructive}
                      />
                    ))}
                    <View style={[s.divider, { backgroundColor: colors.border }]} />
                    <Row label="Total Expenses" value={`-${formatCurrency(totalExpenses)}`} color={colors.destructive} bold />
                  </View>
                )}

                <View style={[s.box, { backgroundColor: colors.secondary, borderRadius: colors.radius, marginBottom: 10 }]}>
                  <Row label="Cash Sales" value={formatCurrency(cashSales)} color={colors.foreground} />
                  {totalExpenses > 0 && (
                    <Row label="− Cash-Out" value={`-${formatCurrency(totalExpenses)}`} color={colors.destructive} />
                  )}
                  <Row label="Expected Drawer Cash" value={formatCurrency(cashExpected)} color={colors.foreground} bold />
                  {hasInput && (
                    <Row
                      label={`Variance ${variance > 0 ? "(Over)" : variance < 0 ? "(Short)" : "(Exact)"}`}
                      value={`${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`}
                      color={variance === 0 ? colors.success : variance > 0 ? colors.success : colors.destructive}
                      bold
                    />
                  )}
                </View>

                {/* Confirmation panel */}
                {confirming && (
                  <View style={[s.confirmPanel, {
                    backgroundColor: colors.destructive + "10",
                    borderColor: colors.destructive + "40",
                    borderRadius: colors.radius,
                  }]}>
                    <Feather name="alert-triangle" size={15} color={colors.destructive} />
                    <Text style={[s.confirmText, { color: colors.foreground }]}>
                      This will save the Z-Report, mark this session as closed, and start a fresh session. Are you sure?
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* ── Action Buttons ── */}
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
                    {isClosing
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Feather name="check-circle" size={16} color="#fff" />
                    }
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeX: { padding: 6 },
  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13 },
  sessionBadge: { flexDirection: "row", alignItems: "center", padding: 10, borderWidth: 1, marginBottom: 10 },
  box: { padding: 14, marginBottom: 12, gap: 5 },
  boxTitle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  divider: { height: 1, marginVertical: 6 },
  noSales: { fontSize: 13, textAlign: "center", paddingVertical: 6 },
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
  confirmPanel: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderWidth: 1, marginBottom: 8 },
  confirmText: { fontSize: 13, lineHeight: 18, flex: 1 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  closeBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  successBox: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 8, gap: 8 },
  successIcon: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  successTitle: { fontSize: 22, fontWeight: "700", marginBottom: 2 },
  successSub: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  successActions: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 4 },
  successActionBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  doneBtn: { marginTop: 10, paddingVertical: 14, paddingHorizontal: 48, alignItems: "center" },
});
