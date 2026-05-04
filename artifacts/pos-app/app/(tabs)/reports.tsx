import React, { useCallback, useMemo, useState } from "react";
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
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import { generateZReportHTML } from "@/lib/receiptTemplate";
import type { BusinessSettings, Sale, SaleItem } from "@/types";
import { formatCurrency } from "@/types";

function getStartOfDay(date: Date): number { const d = new Date(date); d.setHours(0, 0, 0, 0); return d.getTime(); }
function getEndOfDay(date: Date): number { const d = new Date(date); d.setHours(23, 59, 59, 999); return d.getTime() + 1; }
function formatDateLabel(date: Date): string {
  const today = new Date(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function ReportsScreen({ embedded = false }: { embedded?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadSalesWithItemsByDateRange, loadProducts, saveZReport, loadBusinessSettings } = useDatabase();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [productCategories, setProductCategories] = useState<Record<string, string>>({});

  const [showZReport, setShowZReport] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [isClosingRegister, setIsClosingRegister] = useState(false);

  const topPadding = embedded ? 0 : (Platform.OS === "web" ? insets.top + 8 : 0);
  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const startMs = getStartOfDay(selectedDate); const endMs = getEndOfDay(selectedDate);
      const result = await loadSalesWithItemsByDateRange(startMs, endMs);
      setSales(result.sales); setItems(result.items);
    } catch { setSales([]); setItems([]); }
    finally { setLoading(false); }
  }, [selectedDate, loadSalesWithItemsByDateRange]);

  const fetchCategories = useCallback(async () => {
    try { const prods = await loadProducts(); const map: Record<string, string> = {}; prods.forEach((p) => { map[p.id] = p.category; }); setProductCategories(map); } catch { setProductCategories({}); }
  }, [loadProducts]);

  useFocusEffect(useCallback(() => { fetchReport(); fetchCategories(); }, [fetchReport, fetchCategories]));

  const goToPrevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
  const goToNextDay = () => { if (isToday) return; const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };
  const goToToday = () => setSelectedDate(new Date());

  const stats = useMemo(() => {
    const validSales = sales.filter((s) => !s.isRefund);
    const refundSales = sales.filter((s) => s.isRefund);
    const revenue = validSales.reduce((sum, s) => sum + s.total, 0);
    const refunds = refundSales.reduce((sum, s) => sum + Math.abs(s.total), 0);
    const subtotal = validSales.reduce((sum, s) => sum + s.subtotal, 0);
    const vatCollected = validSales.reduce((sum, s) => sum + s.vatAmount, 0);
    const discountTotal = validSales.reduce((sum, s) => sum + (s.discountAmount || 0), 0);
    const avgOrder = validSales.length > 0 ? revenue / validSales.length : 0;
    const methods = ["Card", "Cash", "Credit", "Split"];
    const paymentBreakdown = methods.map((m) => ({
      method: m, count: validSales.filter((s) => s.paymentMethod === m).length,
      amount: validSales.filter((s) => s.paymentMethod === m).reduce((sum, s) => sum + s.total, 0),
    })).filter((p) => p.count > 0);
    const staffMap = new Map<string, { name: string; amount: number; count: number }>();
    validSales.forEach((s) => {
      const sn = s.staffName || "Unknown";
      const ex = staffMap.get(sn);
      if (ex) { ex.amount += s.total; ex.count++; } else { staffMap.set(sn, { name: sn, amount: s.total, count: 1 }); }
    });
    return { transactionCount: validSales.length, revenue, refunds, refundCount: refundSales.length, subtotal, vatCollected, discountTotal, avgOrder, paymentBreakdown, staffSales: Array.from(staffMap.values()) };
  }, [sales]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; totalQty: number; totalRevenue: number }>();
    items.forEach((item) => {
      if (item.quantity < 0) return;
      const ex = map.get(item.productId);
      if (ex) { ex.totalQty += item.quantity; ex.totalRevenue += item.lineTotal; }
      else { map.set(item.productId, { productId: item.productId, productName: item.productName, totalQty: item.quantity, totalRevenue: item.lineTotal }); }
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty).slice(0, 10);
  }, [items]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; revenue: number; count: number }>();
    items.forEach((item) => {
      if (item.quantity < 0) return;
      const cat = productCategories[item.productId] || "Other";
      const ex = map.get(cat);
      if (ex) { ex.revenue += item.lineTotal; ex.count += item.quantity; } else { map.set(cat, { category: cat, revenue: item.lineTotal, count: item.quantity }); }
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [items, productCategories]);

  const maxProductQty = topProducts.length > 0 ? topProducts[0].totalQty : 1;

  const hourlyData = useMemo(() => {
    const hours = new Array(24).fill(0);
    sales.filter((s) => !s.isRefund).forEach((s) => { hours[new Date(s.createdAt).getHours()] += s.total; });
    const max = Math.max(...hours, 1);
    return hours.map((val, hour) => ({ hour, value: val, pct: val / max, label: `${hour.toString().padStart(2, "0")}:00` }));
  }, [sales]);

  const peakHour = useMemo(() => {
    if (sales.length === 0) return null;
    let maxIdx = 0; hourlyData.forEach((h, i) => { if (h.value > hourlyData[maxIdx].value) maxIdx = i; });
    return hourlyData[maxIdx].value > 0 ? hourlyData[maxIdx] : null;
  }, [hourlyData, sales]);

  const printZReport = async (html: string): Promise<boolean> => {
    if (Platform.OS === "web") {
      try {
        const w = window.open("", "_blank", "width=400,height=700");
        if (w) {
          w.document.write(html);
          w.document.close();
          setTimeout(() => w.print(), 300);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    try {
      const Print = await import("expo-print");
      await Print.printAsync({ html });
      return true;
    } catch {
      return false;
    }
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
      } catch {
        return false;
      }
    }

    const subject = `Z-Report - ${business.businessName || "POS"} - ${dateLabel}`;
    const bodyText = [
      `Z-Report for ${dateLabel}`,
      `Business: ${business.businessName || "N/A"}`,
      `Net Sales: ${formatCurrency(stats.revenue - stats.refunds)}`,
      `Transactions: ${stats.transactionCount}`,
      `VAT Collected: ${formatCurrency(stats.vatCollected)}`,
    ].join("\n");

    if (Platform.OS === "web") {
      try {
        const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
        window.open(mailtoUrl, "_blank");
        return true;
      } catch {
        return false;
      }
    }

    try {
      const Print = await import("expo-print");
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const MailComposer = await import("expo-mail-composer");
      const isAvailable = await MailComposer.isAvailableAsync();
      if (isAvailable) {
        await MailComposer.composeAsync({
          recipients: [recipientEmail],
          subject,
          body: bodyText,
          attachments: [uri],
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };
