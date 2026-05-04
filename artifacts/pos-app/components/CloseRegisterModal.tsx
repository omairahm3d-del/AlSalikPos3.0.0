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
      const sessionStart = business.lastClosedAt ?? getStartOfDay(today);
      setLastClosedAt(sessionStart);
      const result = await loadSalesWithItemsByDateRange(sessionStart, getEndOfDay(today));
      setSales(result.sales);
      setItems(result.items);
    } catch {
      setSales([]); setItems([]);
    } finally {
      setLoading(false);
    }
  }, [loadSalesWithItemsByDateRange, loadBusinessSettings]);

  useEffect(() => {
    if (visible) {
      setClosingCash("");
      setIsClosing(false);
      setConfirming(false);
      setDone(false);
      setSavedHtml("");
      setSavedBusiness(null);
      fetchData();
    }
  }, [visible, fetchData]);

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

  const printReport = async (html: string) => {
    if (Platform.OS === "web") {
      try {
        const w = window.open("", "_blank", "width=420,height=700");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 350); }
      } catch {
      }
    } else {
      try {
        const Print = await import("expo-print");
        await Print.printAsync({ html });
      } catch {
      }
    }
  };

  const sendEmail = async (html: string, business: BusinessSettings): Promise<boolean> => {
    const to = business.zReportEmail?.trim();
    if (!to) return false;
    const smtp = business.smtpConfig;
    if (smtp?.host && smtp?.user && smtp?.pass) {
      try {
        const base = Platform.OS === "web" ? "" : `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
        const res = await fetch(`${base}/api/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            subject: `Z-Report - ${business.businessName || "POS"} - ${dateLabel}`,
            html,
            config: smtp,
          }),
        });
        const json = await res.json() as { success: boolean; error?: string };
        if (!json.success) throw new Error(json.error || "Send failed");
        return true;
      } catch (err: any) {
        Alert.alert("Email Failed", err.message || "Could not send email. Check your SMTP settings.");
        return false;
      }
    }
    if (Platform.OS === "web") {
      try {
        const subject = encodeURIComponent(`Z-Report - ${dateLabel}`);
        const body = encodeURIComponent(
          `Z-Report\nNet Sales: ${formatCurrency(stats.revenue - stats.refunds)}\nTransactions: ${stats.transactionCount}`
        );
        window.open(`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`, "_blank");
        return true;
      } catch {
        return false;
      }
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
    } catch {
    }
    return false;
  };

  const doCloseRegister = async () => {
    setIsClosing(true);
    try {
      const cashVal = parseFloat(closingCash) || 0;
      const nowMs = Date.now();
      const report = {
        date: todayStr,
        openedAt: lastClosedAt || getStartOfDay(today),
        closedAt: nowMs,
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
      const updatedBusiness = { ...business, lastClosedAt: nowMs };
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
          <View style={[s.header, { borderBottomColor: colors.border }]}>