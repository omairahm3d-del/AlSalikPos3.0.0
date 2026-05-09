import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Customer, Rider, Sale, SaleItem, ZReport } from "@/types";
import { formatCurrency } from "@/types";
import { buildCsv, downloadCsv } from "@/lib/csvExport";
import { generateZReportHTML } from "@/lib/receiptTemplate";
import { printHtml } from "@/lib/printBridge";

type ReportView = null | "zhistory" | "payment" | "staff" | "stylist" | "rider" | "customer" | "items";
type DatePreset = "today" | "yesterday" | "last7" | "last30" | "thismonth";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 Days" },
  { key: "last30", label: "30 Days" },
  { key: "thismonth", label: "This Month" },
];

function getPresetRange(preset: DatePreset): { startMs: number; endMs: number; label: string } {
  const now = new Date();
  const sot = new Date(now); sot.setHours(0, 0, 0, 0);
  const eot = new Date(now); eot.setHours(23, 59, 59, 999);
  switch (preset) {
    case "today": return { startMs: sot.getTime(), endMs: eot.getTime(), label: "Today" };
    case "yesterday": {
      const s = new Date(sot); s.setDate(s.getDate() - 1);
      const e = new Date(s); e.setHours(23, 59, 59, 999);
      return { startMs: s.getTime(), endMs: e.getTime(), label: "Yesterday" };
    }
    case "last7": {
      const s = new Date(sot); s.setDate(s.getDate() - 6);
      return { startMs: s.getTime(), endMs: eot.getTime(), label: "Last 7 Days" };
    }
    case "last30": {
      const s = new Date(sot); s.setDate(s.getDate() - 29);
      return { startMs: s.getTime(), endMs: eot.getTime(), label: "Last 30 Days" };
    }
    case "thismonth": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startMs: s.getTime(), endMs: eot.getTime(), label: "This Month" };
    }
  }
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function ReportsHub({ onBack, workMode }: { onBack: () => void; workMode?: "standard" | "saloon" }) {
  const isSaloon = workMode === "saloon";
  const colors = useColors();
  const db = useDatabase();
  const [view, setView] = useState<ReportView>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("last7");
  const [rangeLabel, setRangeLabel] = useState("Last 7 Days");

  const [zReports, setZReports] = useState<ZReport[]>([]);
  const [expandedZKey, setExpandedZKey] = useState<string | null>(null);

  const [rangeSales, setRangeSales] = useState<Sale[]>([]);
  const [rangeItems, setRangeItems] = useState<SaleItem[]>([]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string | null>(null);
  const [custSearch, setCustSearch] = useState("");

  const [riders, setRiders] = useState<Rider[]>([]);
  const [stylistFilter, setStylistFilter] = useState<string>("all");
  const [riderFilter, setRiderFilter] = useState<string>("all");

  const [itemDate, setItemDate] = useState(new Date());
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const resetState = () => {
    setLoaded(false);
    setExpandedZKey(null);
    setExpandedSaleId(null);
    setSelectedCustId(null);
    setCustSearch("");
    setRangeSales([]);
    setRangeItems([]);
  };

  const loadZHistory = useCallback(async () => {
    setLoading(true);
    try {
      const reports = await db.loadZReports();
      setZReports([...reports].sort((a: any, b: any) => (b.closedAt ?? 0) - (a.closedAt ?? 0)));
    } catch { setZReports([]); }
    setLoading(false);
  }, [db]);

  const loadRangeData = useCallback(async (p?: DatePreset) => {
    setLoading(true);
    setLoaded(false);
    const range = getPresetRange(p ?? preset);
    setRangeLabel(range.label);
    try {
      const result = await db.loadSalesWithItemsByDateRange(range.startMs, range.endMs);
      setRangeSales(result.sales);
      setRangeItems(result.items);
    } catch { setRangeSales([]); setRangeItems([]); }
    setLoaded(true);
    setLoading(false);
  }, [db, preset]);

  const loadItemDetail = useCallback(async (date: Date) => {
    setLoading(true);
    setLoaded(false);
    const s = new Date(date); s.setHours(0, 0, 0, 0);
    const e = new Date(date); e.setHours(23, 59, 59, 999);
    try {
      const result = await db.loadSalesWithItemsByDateRange(s.getTime(), e.getTime() + 1);
      setRangeSales(result.sales);
      setRangeItems(result.items);
    } catch { setRangeSales([]); setRangeItems([]); }
    setLoaded(true);
    setLoading(false);
  }, [db]);

  const loadCustomers = useCallback(async () => {
    try { setCustomers(await db.loadCustomers()); } catch { setCustomers([]); }
  }, [db]);

  const handleExport = useCallback(async (slug: string, rows: any[], headers?: string[]) => {
    if (rows.length === 0) {
      if (Platform.OS === "web") window.alert("Nothing to export — there are no rows in this report yet.");
      else Alert.alert("Nothing to Export", "There are no rows in this report yet.");
      return;
    }
    const csv = buildCsv(rows, headers);
    const res = await downloadCsv(slug, csv);
    if (!res.ok) {
      const msg = `Export failed: ${res.error || "unknown error"}`;
      if (Platform.OS === "web") window.alert(msg); else Alert.alert("Export Failed", msg);
    }
  }, []);

  const handlePrintZReport = useCallback(async (report: any) => {
    try {
      const business = await db.loadBusinessSettings();
      const html = generateZReportHTML(report, business);
      if (Platform.OS === "web") {
        const printer = business.printerSettings?.windowsReceiptPrinterName;
        const ok = await printHtml(html, { deviceName: printer || "", paperWidth: business.receiptDesign?.paperWidth ?? "80mm" });
        if (!ok) {
          // Fallback: open popup and call window.print()
          const w = window.open("", "_blank", "width=420,height=640");
          if (w) { w.document.write(html); w.document.close(); setTimeout(() => { try { w.print(); } catch {} }, 300); }
        }
      } else {
        const Print = await import("expo-print");
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      const msg = `Print failed: ${e?.message || String(e)}`;
      if (Platform.OS === "web") window.alert(msg); else Alert.alert("Print Failed", msg);
    }
  }, [db]);

  useEffect(() => {
    db.loadRiders().then(setRiders).catch(() => setRiders([]));
  }, [db]);

  useEffect(() => {
    resetState();
    setStylistFilter("all");
    setRiderFilter("all");
    if (view === "zhistory") loadZHistory();
    else if (view === "customer") { loadCustomers(); loadRangeData(); }
    else if (view === "items") loadItemDetail(itemDate);
    else if (view !== null) loadRangeData();
  }, [view]);

  const validSales = useMemo(() => rangeSales.filter(s => !s.isRefund), [rangeSales]);

  const paymentStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    validSales.forEach(s => {
      const ex = map.get(s.paymentMethod);
      if (ex) { ex.count++; ex.amount += s.total; } else map.set(s.paymentMethod, { count: 1, amount: s.total });
    });
    const total = validSales.reduce((sum, s) => sum + s.total, 0);
    return Array.from(map.entries())
      .map(([method, v]) => ({ method, ...v, pct: total > 0 ? v.amount / total * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [validSales]);

  const staffStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    validSales.forEach(s => {
      const name = s.staffName || "Unknown";
      const ex = map.get(name);
      if (ex) { ex.count++; ex.amount += s.total; } else map.set(name, { count: 1, amount: s.total });
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, avg: v.count > 0 ? v.amount / v.count : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [validSales]);

  const riderStats = useMemo(() => {
    const riderMap = new Map(riders.map(r => [r.id, r]));
    const map = new Map<string, { count: number; amount: number; commission: number }>();
    validSales.filter(s => s.orderType === "delivery" && s.riderId).forEach(s => {
      const name = s.riderName || s.riderId || "Unknown";
      const rider = s.riderId ? riderMap.get(s.riderId) : undefined;
      const commissionAmt = s.total * ((rider?.commissionPct ?? 0) / 100);
      const ex = map.get(name);
      if (ex) { ex.count++; ex.amount += s.total; ex.commission += commissionAmt; }
      else map.set(name, { count: 1, amount: s.total, commission: commissionAmt });
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, avg: v.count > 0 ? v.amount / v.count : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [validSales, riders]);

  const stylistStats = useMemo(() => {
    const riderMap = new Map(riders.map(r => [r.id, r]));
    const validSaleIds = new Set(validSales.map(s => s.id));
    const map = new Map<string, { count: number; amount: number; commission: number }>();
    for (const it of rangeItems) {
      if (!validSaleIds.has(it.saleId)) continue;
      const name = it.stylistName || "Unassigned";
      const amt = typeof it.lineTotal === "number" ? it.lineTotal : 0;
      const rider = (it as any).stylistId ? riderMap.get((it as any).stylistId) : undefined;
      const commissionAmt = amt * ((rider?.commissionPct ?? 0) / 100);
      const ex = map.get(name);
      if (ex) { ex.count++; ex.amount += amt; ex.commission += commissionAmt; }
      else map.set(name, { count: 1, amount: amt, commission: commissionAmt });
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, avg: v.count > 0 ? v.amount / v.count : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [validSales, rangeItems, riders]);

  const filteredCustomers = useMemo(() => {
    const q = custSearch.toLowerCase();
    return customers.filter(c => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, custSearch]);

  const customerTransactions = useMemo(() => {
    if (!selectedCustId) return [];
    return validSales.filter(s => s.customerId === selectedCustId).sort((a, b) => b.createdAt - a.createdAt);
  }, [validSales, selectedCustId]);

  const renderHdr = (title: string, backFn: () => void, onExport?: () => void) => (
    <View style={[st.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={backFn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[st.headerTitle, { color: colors.foreground }]}>{title}</Text>
      {onExport ? (
        <TouchableOpacity onPress={onExport} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[st.exportBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="download" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>CSV</Text>
        </TouchableOpacity>
      ) : <View style={{ width: 34 }} />}
    </View>
  );

  const renderPresets = (onLoad: (p: DatePreset) => void) => (
    <View style={st.presetRow}>
      {PRESETS.map(p => (
        <TouchableOpacity key={p.key} onPress={() => { setPreset(p.key); setLoaded(false); onLoad(p.key); }}
          style={[st.presetBtn, { backgroundColor: preset === p.key ? colors.primary : colors.secondary, borderColor: preset === p.key ? colors.primary : colors.border, borderRadius: colors.radius }]}>
          <Text style={{ color: preset === p.key ? "#fff" : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>{p.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const row = (label: string, value: string, accent?: string) => (
    <View style={st.summaryRow}>
      <Text style={[st.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[st.rowValue, { color: accent ?? colors.foreground }]}>{value}</Text>
    </View>
  );

  const sectionHead = (title: string) => (
    <Text style={[st.sectionHead, { color: colors.mutedForeground }]}>{title}</Text>
  );

  const progressBar = (pct: number) => (
    <View style={[st.barTrack, { backgroundColor: colors.secondary }]}>
      <View style={[st.barFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: colors.primary }]} />
    </View>
  );

  // ─── Z-Report History ──────────────────────────────────────────────────────
  const renderZHistory = () => (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {renderHdr("Z-Report History", () => setView(null), () => handleExport("z-reports", zReports.map((r: any) => ({
        Date: r.date || "",
        Closed: r.closedAt ? new Date(r.closedAt).toISOString() : "",
        Transactions: r.transactionCount ?? 0,
        TotalSales: (r.totalSales ?? 0).toFixed(2),
        TotalRefunds: (r.totalRefunds ?? 0).toFixed(2),
        NetSales: (r.netSales ?? 0).toFixed(2),
        VAT: (r.totalVat ?? 0).toFixed(2),
        Discounts: (r.totalDiscount ?? 0).toFixed(2),
        OpeningCash: (r.openingCash ?? 0).toFixed(2),
        ClosingCash: (r.closingCash ?? 0).toFixed(2),
        CashVariance: ((r.closingCash ?? 0) - ((r.paymentBreakdown ?? []).find((p: any) => p.method === "Cash")?.amount ?? 0)).toFixed(2),
      }))))}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : zReports.length === 0 ? (
        <View style={st.empty}>
          <Feather name="archive" size={44} color={colors.mutedForeground} style={{ opacity: 0.35 }} />
          <Text style={[st.emptyTitle, { color: colors.foreground }]}>No Z-Reports Yet</Text>
          <Text style={[st.emptySub, { color: colors.mutedForeground }]}>Close the register to generate your first Z-Report</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll}>
          {zReports.map((r: any, idx: number) => {
            const key = r.date ?? String(r.closedAt ?? idx);
            const isExp = expandedZKey === key;
            const cashSales = (r.paymentBreakdown ?? []).find((p: any) => p.method === "Cash")?.amount ?? 0;
            const variance = (r.closingCash ?? 0) - cashSales;
            return (
              <TouchableOpacity key={key} onPress={() => setExpandedZKey(isExp ? null : key)}
                style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={st.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.cardTitle, { color: colors.foreground }]}>{r.date || fmtDate(r.closedAt ?? 0)}</Text>
                    <Text style={[st.cardSub, { color: colors.mutedForeground }]}>
                      {r.transactionCount ?? 0} txns · Closed {fmtDateTime(r.closedAt ?? 0)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={[st.cardAmt, { color: colors.success }]}>{formatCurrency(r.netSales ?? 0)}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handlePrintZReport(r); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[st.zActionBtn, { borderColor: colors.primary + "55", borderRadius: colors.radius }]}>
                        <Feather name="printer" size={12} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Print</Text>
                      </TouchableOpacity>
                      <Feather name={isExp ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
                    </View>
                  </View>
                </View>
                {isExp && (
                  <View style={[st.expanded, { borderTopColor: colors.border }]}>
                    {row("Total Sales", formatCurrency(r.totalSales ?? 0), colors.success)}
                    {(r.totalRefunds ?? 0) > 0 && row("Refunds", `-${formatCurrency(r.totalRefunds ?? 0)}`, colors.destructive)}
                    {row("Net Sales", formatCurrency(r.netSales ?? 0))}
                    {row("VAT Collected", formatCurrency(r.totalVat ?? 0))}
                    {(r.totalDiscount ?? 0) > 0 && row("Discounts", `-${formatCurrency(r.totalDiscount ?? 0)}`, "#F39C12")}
                    {row("Transactions", String(r.transactionCount ?? 0))}
                    {row("Closing Cash", formatCurrency(r.closingCash ?? 0))}
                    {row("Cash Variance", `${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`, variance >= 0 ? colors.success : colors.destructive)}
                    {(r.paymentBreakdown?.length ?? 0) > 0 && (
                      <>{sectionHead("PAYMENT BREAKDOWN")}{r.paymentBreakdown.map((p: any) => row(p.method, formatCurrency(p.amount)))}</>
                    )}
                    {(r.staffSales?.length ?? 0) > 0 && (
                      <>{sectionHead("STAFF")}{r.staffSales.map((s: any) => row(`${s.staffName} (${s.count})`, formatCurrency(s.amount)))}</>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );

  // ─── Payment Method Report ─────────────────────────────────────────────────
  const renderPayment = () => {
    const total = validSales.reduce((s, x) => s + x.total, 0);
    const refundTotal = rangeSales.filter(s => s.isRefund).reduce((s, x) => s + Math.abs(x.total), 0);
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHdr("Payment Method Report", () => setView(null), () => handleExport("payment-methods", paymentStats.map(p => ({
          Method: p.method, Transactions: p.count, Amount: p.amount.toFixed(2), Percentage: p.pct.toFixed(2) + "%",
        }))))}
        <ScrollView contentContainerStyle={st.scroll}>
          {renderPresets((p) => loadRangeData(p))}
          {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> :
            !loaded ? null :
            paymentStats.length === 0 ? (
              <View style={st.empty}>
                <Text style={[st.emptyTitle, { color: colors.mutedForeground }]}>No sales in {rangeLabel}</Text>
              </View>
            ) : (
              <>
                <View style={[st.summaryBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  {row("Period", rangeLabel)}
                  {row("Total Revenue", formatCurrency(total), colors.success)}
                  {refundTotal > 0 && row("Refunds", `-${formatCurrency(refundTotal)}`, colors.destructive)}
                  {row("Transactions", String(validSales.length))}
                  {row("Avg. Order", formatCurrency(validSales.length > 0 ? total / validSales.length : 0))}
                </View>
                {paymentStats.map(p => (
                  <View key={p.method} style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <View style={st.cardRow}>
                      <View>
                        <Text style={[st.cardTitle, { color: colors.foreground }]}>{p.method}</Text>
                        <Text style={[st.cardSub, { color: colors.mutedForeground }]}>{p.count} transaction{p.count !== 1 ? "s" : ""}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[st.cardAmt, { color: colors.foreground }]}>{formatCurrency(p.amount)}</Text>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>{p.pct.toFixed(1)}%</Text>
                      </View>
                    </View>
                    {progressBar(p.pct)}
                  </View>
                ))}
              </>
            )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  };

  // ─── Staff Report ──────────────────────────────────────────────────────────
  const renderStaff = () => {
    const total = staffStats.reduce((s, x) => s + x.amount, 0);
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHdr("Staff Sales Report", () => setView(null), () => handleExport("staff-sales", staffStats.map(s => ({
          Staff: s.name, Sales: s.count, TotalRevenue: s.amount.toFixed(2), AvgOrder: s.avg.toFixed(2),
        }))))}
        <ScrollView contentContainerStyle={st.scroll}>
          {renderPresets((p) => loadRangeData(p))}
          {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> :
            !loaded ? null :
            staffStats.length === 0 ? (
              <View style={st.empty}>
                <Text style={[st.emptyTitle, { color: colors.mutedForeground }]}>No staff data in {rangeLabel}</Text>
              </View>
            ) : (
              <>
                <View style={[st.summaryBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  {row("Period", rangeLabel)}
                  {row("Total Revenue", formatCurrency(total), colors.success)}
                  {row("Active Staff", String(staffStats.length))}
                  {row("Total Transactions", String(validSales.length))}
                </View>
                {staffStats.map((st2, i) => (
                  <View key={st2.name} style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <View style={st.cardRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={[st.badge, { backgroundColor: i === 0 ? "#F39C12" : colors.secondary }]}>
                          <Text style={{ color: i === 0 ? "#fff" : colors.mutedForeground, fontSize: 11, fontWeight: "700" }}>#{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.cardTitle, { color: colors.foreground }]}>{st2.name}</Text>
                          <Text style={[st.cardSub, { color: colors.mutedForeground }]}>{st2.count} sales · Avg {formatCurrency(st2.avg)}</Text>
                        </View>
                      </View>
                      <Text style={[st.cardAmt, { color: colors.foreground }]}>{formatCurrency(st2.amount)}</Text>
                    </View>
                    {progressBar(total > 0 ? st2.amount / total * 100 : 0)}
                  </View>
                ))}
              </>
            )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  };

  // ─── Rider Report ──────────────────────────────────────────────────────────
  const handleRiderPdf = useCallback(async (rows: typeof riderStats) => {
    const totalRev = rows.reduce((s, x) => s + x.amount, 0);
    const totalCom = rows.reduce((s, x) => s + x.commission, 0);
    const totalDel = rows.reduce((s, x) => s + x.count, 0);
    const tableRows = rows.map(r => `
      <tr>
        <td>${r.name}</td>
        <td style="text-align:center">${r.count}</td>
        <td style="text-align:right">AED ${r.amount.toFixed(2)}</td>
        <td style="text-align:right">AED ${r.avg.toFixed(2)}</td>
        <td style="text-align:right;color:#E67E22">AED ${r.commission.toFixed(2)}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#1a1a1a}
        h2{margin:0 0 4px}p{margin:0 0 16px;color:#666;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#f4f4f4;padding:8px 10px;text-align:left;font-weight:600;border-bottom:2px solid #ddd}
        td{padding:7px 10px;border-bottom:1px solid #eee}
        tr:last-child td{border-bottom:none}
        .foot{margin-top:16px;font-size:13px;text-align:right}
        .foot span{font-weight:700}
      </style></head><body>
      <h2>Rider Delivery Report</h2>
      <p>Period: ${rangeLabel}</p>
      <table>
        <thead><tr>
          <th>Rider</th><th style="text-align:center">Deliveries</th>
          <th style="text-align:right">Revenue</th>
          <th style="text-align:right">Avg / Delivery</th>
          <th style="text-align:right">Commission</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="foot">
        Total Deliveries: <span>${totalDel}</span> &nbsp;|&nbsp;
        Total Revenue: <span>AED ${totalRev.toFixed(2)}</span> &nbsp;|&nbsp;
        Total Commission: <span style="color:#E67E22">AED ${totalCom.toFixed(2)}</span>
      </div>
      </body></html>`;
    try {
      if (Platform.OS === "web") {
        const w = window.open("", "_blank", "width=700,height=500");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => { try { w.print(); } catch {} }, 300); }
      } else {
        const Print = await import("expo-print");
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert("PDF Failed", e?.message || String(e));
    }
  }, [rangeLabel]);

  const renderRider = () => {
    const filtered = riderFilter === "all" ? riderStats : riderStats.filter(r => r.name === riderFilter);
    const total = filtered.reduce((s, x) => s + x.amount, 0);
    const totalDeliveries = filtered.reduce((s, x) => s + x.count, 0);
    const totalCommission = filtered.reduce((s, x) => s + x.commission, 0);
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHdr("Rider Delivery Report", () => setView(null), () => handleExport("rider-deliveries", filtered.map(r => ({
          Rider: r.name, Deliveries: r.count, TotalRevenue: r.amount.toFixed(2), AvgPerDelivery: r.avg.toFixed(2), Commission: r.commission.toFixed(2),
        }))))}
        <ScrollView contentContainerStyle={st.scroll}>
          {renderPresets((p) => loadRangeData(p))}
          {loaded && riderStats.length > 0 && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4, marginBottom: 8 }} contentContainerStyle={{ paddingHorizontal: 4, gap: 6, flexDirection: "row" }}>
                {["all", ...riderStats.map(r => r.name)].map(name => (
                  <TouchableOpacity key={name} onPress={() => setRiderFilter(name)}
                    style={[st.presetBtn, { backgroundColor: riderFilter === name ? "#3498DB" : colors.secondary, borderColor: riderFilter === name ? "#3498DB" : colors.border, borderRadius: colors.radius }]}>
                    <Text style={{ color: riderFilter === name ? "#fff" : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>
                      {name === "all" ? "All Riders" : name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity onPress={() => handleRiderPdf(filtered)}
                style={[st.exportBtn, { borderColor: "#E67E22", borderRadius: colors.radius, alignSelf: "flex-end", marginBottom: 8, paddingHorizontal: 12 }]}>
                <Feather name="file-text" size={14} color="#E67E22" />
                <Text style={{ color: "#E67E22", fontSize: 12, fontWeight: "700" }}>Export PDF</Text>
              </TouchableOpacity>
            </>
          )}
          {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> :
            !loaded ? null :
            riderStats.length === 0 ? (
              <View style={st.empty}>
                <Feather name="truck" size={40} color={colors.mutedForeground} style={{ opacity: 0.35 }} />
                <Text style={[st.emptyTitle, { color: colors.mutedForeground }]}>No delivery data in {rangeLabel}</Text>
                <Text style={[st.emptySub, { color: colors.mutedForeground }]}>Delivery orders with a rider assigned will appear here</Text>
              </View>
            ) : (
              <>
                <View style={[st.summaryBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  {row("Period", rangeLabel)}
                  {row("Total Deliveries", String(totalDeliveries))}
                  {row("Total Revenue", formatCurrency(total), colors.success)}
                  {row("Total Commission", formatCurrency(totalCommission), "#E67E22")}
                  {row("Active Riders", String(riderFilter === "all" ? riderStats.length : 1))}
                  {row("Avg. per Delivery", formatCurrency(totalDeliveries > 0 ? total / totalDeliveries : 0))}
                </View>
                {filtered.map((r, i) => (
                  <View key={r.name} style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <View style={st.cardRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={[st.badge, { backgroundColor: i === 0 && riderFilter === "all" ? "#2ECC71" : colors.secondary }]}>
                          <Feather name="truck" size={12} color={i === 0 && riderFilter === "all" ? "#fff" : colors.mutedForeground} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.cardTitle, { color: colors.foreground }]}>{r.name}</Text>
                          <Text style={[st.cardSub, { color: colors.mutedForeground }]}>{r.count} deliveries · Avg {formatCurrency(r.avg)}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[st.cardAmt, { color: colors.foreground }]}>{formatCurrency(r.amount)}</Text>
                        {r.commission > 0 && <Text style={{ color: "#E67E22", fontSize: 11, fontWeight: "600" }}>Commission {formatCurrency(r.commission)}</Text>}
                      </View>
                    </View>
                    {progressBar(total > 0 ? r.amount / total * 100 : 0)}
                  </View>
                ))}
              </>
            )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  };

  // ─── Customer Transactions ─────────────────────────────────────────────────
  const renderCustomer = () => (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {renderHdr("Customer Transactions", () => setView(null), () => {
        if (selectedCustId) {
          handleExport("customer-transactions", customerTransactions.map(s => ({
            Invoice: s.invoiceNumber, Date: new Date(s.createdAt).toISOString(), Method: s.paymentMethod,
            Subtotal: s.subtotal.toFixed(2), VAT: s.vatAmount.toFixed(2), Total: s.total.toFixed(2),
          })));
        } else {
          handleExport("customers-summary", filteredCustomers.map(c => {
            const txs = validSales.filter(s => s.customerId === c.id);
            const cTotal = txs.reduce((sum, s) => sum + s.total, 0);
            return {
              Name: c.name, Phone: c.phone || "", Email: c.email || "",
              LoyaltyPoints: c.loyaltyPoints ?? 0, Transactions: txs.length, TotalSpent: cTotal.toFixed(2),
            };
          }));
        }
      })}
      <ScrollView contentContainerStyle={st.scroll}>
        {renderPresets((p) => { setSelectedCustId(null); loadRangeData(p); })}
        <TextInput
          value={custSearch}
          onChangeText={setCustSearch}
          placeholder="Search customers by name or phone..."
          placeholderTextColor={colors.mutedForeground}
          style={[st.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
        />
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> :
          !loaded ? null :
          selectedCustId === null ? (
            filteredCustomers.length === 0 ? (
              <View style={st.empty}>
                <Feather name="users" size={40} color={colors.mutedForeground} style={{ opacity: 0.35 }} />
                <Text style={[st.emptyTitle, { color: colors.mutedForeground }]}>No customers found</Text>
              </View>
            ) : (
              filteredCustomers.map(c => {
                const txs = validSales.filter(s => s.customerId === c.id);
                const cTotal = txs.reduce((sum, s) => sum + s.total, 0);
                return (
                  <TouchableOpacity key={c.id} onPress={() => setSelectedCustId(c.id)}
                    style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <View style={st.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.cardTitle, { color: colors.foreground }]}>{c.name}</Text>
                        <Text style={[st.cardSub, { color: colors.mutedForeground }]}>
                          {c.phone || "No phone"} · {txs.length} transactions in {rangeLabel}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text style={[st.cardAmt, { color: colors.foreground }]}>{formatCurrency(cTotal)}</Text>
                        <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )
          ) : (() => {
            const c = customers.find(cx => cx.id === selectedCustId);
            if (!c) return null;
            const cTotal = customerTransactions.reduce((sum, s) => sum + s.total, 0);
            return (
              <>
                <TouchableOpacity onPress={() => setSelectedCustId(null)}
                  style={[st.backLink, { borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Feather name="arrow-left" size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>All Customers</Text>
                </TouchableOpacity>
                <View style={[st.summaryBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Text style={[st.cardTitle, { color: colors.foreground, marginBottom: 8 }]}>{c.name}</Text>
                  {c.phone ? row("Phone", c.phone) : null}
                  {c.email ? row("Email", c.email) : null}
                  {row("Loyalty Points", String(c.loyaltyPoints ?? 0))}
                  {row(`Transactions (${rangeLabel})`, String(customerTransactions.length))}
                  {row("Total Spent", formatCurrency(cTotal), colors.success)}
                </View>
                {customerTransactions.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 24 }}>
                    No transactions in {rangeLabel}
                  </Text>
                ) : customerTransactions.map(sale => (
                  <View key={sale.id} style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                    {row("Invoice", sale.invoiceNumber)}
                    {row("Date", fmtDateTime(sale.createdAt))}
                    {row("Method", sale.paymentMethod)}
                    {row("Total", formatCurrency(sale.total), colors.success)}
                  </View>
                ))}
              </>
            );
          })()}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );

  // ─── Daily Item Detail ─────────────────────────────────────────────────────
  const isItemDateToday = itemDate.toDateString() === new Date().toDateString();
  const renderItems = () => {
    const daySales = rangeSales.sort((a, b) => a.createdAt - b.createdAt);
    const dayValid = daySales.filter(s => !s.isRefund);
    const dayTotal = dayValid.reduce((sum, s) => sum + s.total, 0);
    const dayRefunds = daySales.filter(s => s.isRefund).length;
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHdr("Daily Sales Detail", () => setView(null), () => handleExport("daily-items", rangeItems.map(it => {
          const sale = rangeSales.find(s => s.id === it.saleId);
          return {
            Date: sale ? new Date(sale.createdAt).toISOString() : "",
            Invoice: sale?.invoiceNumber ?? "",
            Item: it.productName, Quantity: it.quantity,
            UnitPrice: (it.productPrice ?? 0).toFixed(2), LineTotal: (it.lineTotal ?? 0).toFixed(2),
            Cashier: sale?.staffName ?? "", Customer: sale?.customerName ?? "",
            Refund: sale?.isRefund ? "yes" : "no",
          };
        })))}
        <View style={[st.dateNav, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => {
            const d = new Date(itemDate); d.setDate(d.getDate() - 1); setItemDate(d); loadItemDetail(d);
          }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[st.dateLabel, { color: colors.foreground }]}>
            {isItemDateToday ? "Today" : itemDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </Text>
          <TouchableOpacity onPress={() => {
            if (isItemDateToday) return;
            const d = new Date(itemDate); d.setDate(d.getDate() + 1); setItemDate(d); loadItemDetail(d);
          }} style={{ opacity: isItemDateToday ? 0.3 : 1 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-right" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={st.scroll}>
          {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} /> :
            !loaded ? null :
            daySales.length === 0 ? (
              <View style={st.empty}>
                <Feather name="list" size={40} color={colors.mutedForeground} style={{ opacity: 0.35 }} />
                <Text style={[st.emptyTitle, { color: colors.mutedForeground }]}>No sales on this day</Text>
              </View>
            ) : (
              <>
                <View style={[st.summaryBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  {row("Sales", String(dayValid.length))}
                  {dayRefunds > 0 && row("Refunds", String(dayRefunds), colors.destructive)}
                  {row("Total Revenue", formatCurrency(dayTotal), colors.success)}
                  {row("Avg. Order", formatCurrency(dayValid.length > 0 ? dayTotal / dayValid.length : 0))}
                </View>
                {daySales.map(sale => {
                  const saleItems = rangeItems.filter(i => i.saleId === sale.id);
                  const isExp = expandedSaleId === sale.id;
                  return (
                    <TouchableOpacity key={sale.id} onPress={() => setExpandedSaleId(isExp ? null : sale.id)}
                      style={[st.card, { backgroundColor: colors.card, borderColor: sale.isRefund ? colors.destructive + "55" : colors.border, borderRadius: colors.radius }]}>
                      <View style={st.cardRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.cardTitle, { color: colors.foreground }]}>
                            {sale.invoiceNumber}{sale.isRefund ? " · REFUND" : ""}
                          </Text>
                          <Text style={[st.cardSub, { color: colors.mutedForeground }]}>
                            {fmtTime(sale.createdAt)}
                            {sale.staffName ? ` · ${sale.staffName}` : ""}
                            {sale.customerName ? ` · ${sale.customerName}` : ""}
                            {" · "}{sale.paymentMethod}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 2 }}>
                          <Text style={[st.cardAmt, { color: sale.isRefund ? colors.destructive : colors.success }]}>
                            {formatCurrency(sale.total)}
                          </Text>
                          <Feather name={isExp ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                        </View>
                      </View>
                      {isExp && (
                        <View style={[st.expanded, { borderTopColor: colors.border }]}>
                          {sale.orderType ? row("Order Type", sale.orderType) : null}
                          {sale.tableName ? row("Table", sale.tableName) : null}
                          {row("Subtotal", formatCurrency(sale.subtotal))}
                          {row("VAT (5%)", formatCurrency(sale.vatAmount))}
                          {(sale.discountAmount ?? 0) > 0 && row("Discount", `-${formatCurrency(sale.discountAmount ?? 0)}`, "#F39C12")}
                          {saleItems.length > 0 && (
                            <>
                              {sectionHead("ITEMS")}
                              {saleItems.map(item => (
                                <View key={item.id} style={st.itemRow}>
                                  <Text style={[{ flex: 1, fontSize: 13 }, { color: colors.foreground }]}>{item.productName}</Text>
                                  <Text style={{ color: colors.mutedForeground, fontSize: 12, minWidth: 28, textAlign: "center" }}>×{item.quantity}</Text>
                                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, minWidth: 80, textAlign: "right" }}>{formatCurrency(item.lineTotal)}</Text>
                                </View>
                              ))}
                            </>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  };

  // ─── Stylist Report (saloon mode) ──────────────────────────────────────────
  const handleStylistPdf = useCallback(async (rows: typeof stylistStats) => {
    const totalRev = rows.reduce((s, x) => s + x.amount, 0);
    const totalCom = rows.reduce((s, x) => s + x.commission, 0);
    const tableRows = rows.map((s, i) => `
      <tr>
        <td>#${i + 1} ${s.name}</td>
        <td style="text-align:center">${s.count}</td>
        <td style="text-align:right">AED ${s.amount.toFixed(2)}</td>
        <td style="text-align:right">AED ${s.avg.toFixed(2)}</td>
        <td style="text-align:right;color:#E91E8C">AED ${s.commission.toFixed(2)}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#1a1a1a}
        h2{margin:0 0 4px}p{margin:0 0 16px;color:#666;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#f4f4f4;padding:8px 10px;text-align:left;font-weight:600;border-bottom:2px solid #ddd}
        td{padding:7px 10px;border-bottom:1px solid #eee}
        tr:last-child td{border-bottom:none}
        .foot{margin-top:16px;font-size:13px;text-align:right}
        .foot span{font-weight:700}
      </style></head><body>
      <h2>Stylist Report</h2>
      <p>Period: ${rangeLabel}</p>
      <table>
        <thead><tr>
          <th>Stylist</th><th style="text-align:center">Services</th>
          <th style="text-align:right">Revenue</th>
          <th style="text-align:right">Avg / Service</th>
          <th style="text-align:right">Commission</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="foot">
        Total Revenue: <span>AED ${totalRev.toFixed(2)}</span> &nbsp;|&nbsp;
        Total Commission: <span style="color:#E91E8C">AED ${totalCom.toFixed(2)}</span>
      </div>
      </body></html>`;
    try {
      if (Platform.OS === "web") {
        const w = window.open("", "_blank", "width=700,height=500");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => { try { w.print(); } catch {} }, 300); }
      } else {
        const Print = await import("expo-print");
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert("PDF Failed", e?.message || String(e));
    }
  }, [rangeLabel]);

  const renderStylist = () => {
    const filtered = stylistFilter === "all" ? stylistStats : stylistStats.filter(s => s.name === stylistFilter);
    const total = filtered.reduce((s, x) => s + x.amount, 0);
    const totalCommission = filtered.reduce((s, x) => s + x.commission, 0);
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHdr("Stylist Report", () => setView(null), () => handleExport("stylist-report", filtered.map(s => ({
          Stylist: s.name, Services: s.count, TotalRevenue: s.amount.toFixed(2), AvgOrder: s.avg.toFixed(2), Commission: s.commission.toFixed(2),
        }))))}
        <ScrollView contentContainerStyle={st.scroll}>
          {renderPresets((p) => loadRangeData(p))}
          {loaded && stylistStats.length > 0 && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4, marginBottom: 8 }} contentContainerStyle={{ paddingHorizontal: 4, gap: 6, flexDirection: "row" }}>
                {["all", ...stylistStats.map(s => s.name)].map(name => (
                  <TouchableOpacity key={name} onPress={() => setStylistFilter(name)}
                    style={[st.presetBtn, { backgroundColor: stylistFilter === name ? "#E91E8C" : colors.secondary, borderColor: stylistFilter === name ? "#E91E8C" : colors.border, borderRadius: colors.radius }]}>
                    <Text style={{ color: stylistFilter === name ? "#fff" : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>
                      {name === "all" ? "All Stylists" : name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity onPress={() => handleStylistPdf(filtered)}
                style={[st.exportBtn, { borderColor: "#E91E8C", borderRadius: colors.radius, alignSelf: "flex-end", marginBottom: 8, paddingHorizontal: 12 }]}>
                <Feather name="file-text" size={14} color="#E91E8C" />
                <Text style={{ color: "#E91E8C", fontSize: 12, fontWeight: "700" }}>Export PDF</Text>
              </TouchableOpacity>
            </>
          )}
          {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> :
            !loaded ? null :
            stylistStats.length === 0 ? (
              <View style={st.empty}>
                <Feather name="scissors" size={40} color={colors.mutedForeground} style={{ opacity: 0.35 }} />
                <Text style={[st.emptyTitle, { color: colors.mutedForeground }]}>No stylist data in {rangeLabel}</Text>
                <Text style={[st.emptySub, { color: colors.mutedForeground }]}>Assign stylists when adding services to see data here</Text>
              </View>
            ) : (
              <>
                <View style={[st.summaryBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  {row("Period", rangeLabel)}
                  {row("Total Revenue", formatCurrency(total), colors.success)}
                  {row("Total Commission", formatCurrency(totalCommission), "#E91E8C")}
                  {row("Active Stylists", String(stylistFilter === "all" ? stylistStats.filter(s => s.name !== "Unassigned").length : 1))}
                </View>
                {filtered.map((s, i) => (
                  <View key={s.name} style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <View style={st.cardRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View style={[st.badge, { backgroundColor: i === 0 && s.name !== "Unassigned" && stylistFilter === "all" ? "#E91E8C" : colors.secondary }]}>
                          <Text style={{ color: i === 0 && s.name !== "Unassigned" && stylistFilter === "all" ? "#fff" : colors.mutedForeground, fontSize: 11, fontWeight: "700" }}>#{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.cardTitle, { color: colors.foreground }]}>{s.name}</Text>
                          <Text style={[st.cardSub, { color: colors.mutedForeground }]}>{s.count} service{s.count !== 1 ? "s" : ""} · Avg {formatCurrency(s.avg)}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[st.cardAmt, { color: colors.foreground }]}>{formatCurrency(s.amount)}</Text>
                        {s.commission > 0 && <Text style={{ color: "#E91E8C", fontSize: 11, fontWeight: "600" }}>Commission {formatCurrency(s.commission)}</Text>}
                      </View>
                    </View>
                    {progressBar(total > 0 ? s.amount / total * 100 : 0)}
                  </View>
                ))}
              </>
            )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  };

  // ─── Hub Menu ──────────────────────────────────────────────────────────────
  const ALL_HUB_ITEMS: { key: ReportView; icon: string; title: string; sub: string; color: string; saloonOnly?: boolean; saloonHide?: boolean }[] = [
    { key: "zhistory", icon: "archive", title: "Z-Report History", sub: "View all previous end-of-day reports", color: "#E74C3C" },
    { key: "payment", icon: "credit-card", title: "Payment Method Report", sub: "Revenue breakdown by cash, card & credit", color: "#4F8EF7" },
    { key: "staff", icon: "user-check", title: "Staff Sales Report", sub: "Performance per staff member", color: "#2ECC71" },
    { key: "stylist", icon: "scissors", title: "Stylist Report", sub: "Revenue and service count per stylist", color: "#E91E8C", saloonOnly: true },
    { key: "rider", icon: "truck", title: "Rider Delivery Report", sub: "Deliveries and revenue per rider", color: "#3498DB", saloonHide: true },
    { key: "customer", icon: "users", title: "Customer Transactions", sub: "Transaction history per customer", color: "#9B59B6" },
    { key: "items", icon: "list", title: "Daily Item Detail", sub: "Full transaction & line-item breakdown", color: "#F39C12" },
  ];
  const HUB_ITEMS = ALL_HUB_ITEMS.filter(it => {
    if (it.saloonOnly && !isSaloon) return false;
    if (it.saloonHide && isSaloon) return false;
    return true;
  });

  const renderHub = () => (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {renderHdr("Reports", onBack)}
      <ScrollView contentContainerStyle={st.scroll}>
        {HUB_ITEMS.map(item => (
          <TouchableOpacity key={String(item.key)} onPress={() => setView(item.key)}
            style={[st.hubCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[st.hubIcon, { backgroundColor: item.color + "22" }]}>
              <Feather name={item.icon as any} size={22} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.hubTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[st.hubSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
            </View>
            <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );

  switch (view) {
    case "zhistory": return renderZHistory();
    case "payment": return renderPayment();
    case "staff": return renderStaff();
    case "stylist": return renderStylist();
    case "rider": return renderRider();
    case "customer": return renderCustomer();
    case "items": return renderItems();
    default: return renderHub();
  }
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  scroll: { padding: 16 },
  empty: { alignItems: "center", paddingTop: 64, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  emptySub: { fontSize: 12, textAlign: "center", paddingHorizontal: 32 },
  card: { borderWidth: 1, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 12, marginTop: 2 },
  cardAmt: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  expanded: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 7 },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1 },
  zActionBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, fontWeight: "600" },
  summaryBox: { borderWidth: 1, padding: 14, marginBottom: 12, gap: 8 },
  sectionHead: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, marginTop: 8, textTransform: "uppercase" },
  presetRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 14 },
  presetBtn: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  barTrack: { height: 4, borderRadius: 2, marginTop: 8, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  hubCard: { flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 10, borderWidth: 1, gap: 14 },
  hubIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  hubTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  hubSub: { fontSize: 12, marginTop: 2 },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  dateLabel: { fontSize: 15, fontWeight: "700" },
  searchBox: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, fontSize: 14 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, marginBottom: 12, alignSelf: "flex-start" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
});
