import React, { useCallback, useMemo, useState } from "react";
import {
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
import { BusinessSettingsModal } from "@/components/BusinessSettingsModal";
import { EmptyState } from "@/components/EmptyState";
import { useDatabase } from "@/context/DatabaseCore";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import type { Sale, SaleItem, Staff, TaxGroup } from "@/types";
import { formatCurrency } from "@/types";

function getStartOfDay(date: Date): number { const d = new Date(date); d.setHours(0, 0, 0, 0); return d.getTime(); }
function getEndOfDay(date: Date): number { const d = new Date(date); d.setHours(23, 59, 59, 999); return d.getTime() + 1; }
function formatDateLabel(date: Date): string {
  const today = new Date(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    loadSalesWithItemsByDateRange, loadProducts, saveZReport,
    loadStaff, createStaff, updateStaff, deleteStaff,
    loadTaxGroups, createTaxGroup, updateTaxGroup, deleteTaxGroup,
  } = useDatabase();
  const { currentStaff, refreshStaffCheck, logout } = useStaff();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [productCategories, setProductCategories] = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffName, setStaffName] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [staffRole, setStaffRole] = useState<"admin" | "cashier">("cashier");
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxList, setTaxList] = useState<TaxGroup[]>([]);
  const [taxName, setTaxName] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [editingTax, setEditingTax] = useState<TaxGroup | null>(null);

  const [showZReport, setShowZReport] = useState(false);
  const [closingCash, setClosingCash] = useState("");

  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;
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

  const openStaffModal = async () => { const list = await loadStaff(); setStaffList(list); setEditingStaff(null); setStaffName(""); setStaffPin(""); setStaffRole("cashier"); setShowStaffModal(true); };
  const openTaxModal = async () => { const list = await loadTaxGroups(); setTaxList(list); setEditingTax(null); setTaxName(""); setTaxRate(""); setShowTaxModal(true); };

  const handleSaveStaff = async () => {
    if (!staffName.trim() || !staffPin.trim() || staffPin.length < 4) { Alert.alert("Invalid", "Name and 4+ digit PIN required."); return; }
    if (editingStaff) { await updateStaff({ ...editingStaff, name: staffName.trim(), pin: staffPin, role: staffRole }); }
    else { await createStaff({ name: staffName.trim(), pin: staffPin, role: staffRole }); }
    const list = await loadStaff(); setStaffList(list); setEditingStaff(null); setStaffName(""); setStaffPin(""); setStaffRole("cashier");
    await refreshStaffCheck();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteStaff = (staff: Staff) => {
    Alert.alert("Delete Staff", `Remove "${staff.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await deleteStaff(staff.id); const list = await loadStaff(); setStaffList(list);
        await refreshStaffCheck();
      }},
    ]);
  };

  const handleSaveTax = async () => {
    const rate = parseFloat(taxRate);
    if (!taxName.trim() || isNaN(rate) || rate < 0 || rate > 100) { Alert.alert("Invalid", "Name and valid rate (0-100) required."); return; }
    if (editingTax) { await updateTaxGroup({ ...editingTax, name: taxName.trim(), rate: rate / 100 }); }
    else { await createTaxGroup({ name: taxName.trim(), rate: rate / 100 }); }
    const list = await loadTaxGroups(); setTaxList(list); setEditingTax(null); setTaxName(""); setTaxRate("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteTax = (tg: TaxGroup) => {
    Alert.alert("Delete Tax Group", `Remove "${tg.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteTaxGroup(tg.id); const list = await loadTaxGroups(); setTaxList(list); } },
    ]);
  };

  const handleGenerateZReport = async () => {
    const cashVal = parseFloat(closingCash) || 0;
    const report = {
      date: selectedDate.toISOString().split("T")[0],
      openedAt: getStartOfDay(selectedDate), closedAt: Date.now(),
      openingCash: 0, closingCash: cashVal,
      totalSales: stats.revenue, totalRefunds: stats.refunds,
      netSales: stats.revenue - stats.refunds, totalVat: stats.vatCollected,
      totalDiscount: stats.discountTotal,
      transactionCount: stats.transactionCount, refundCount: stats.refundCount,
      paymentBreakdown: stats.paymentBreakdown.map((p) => ({ method: p.method, amount: p.amount })),
      categorySales: categoryBreakdown.map((c) => ({ category: c.category, amount: c.revenue })),
      staffSales: stats.staffSales,
    };
    await saveZReport(report);
    setShowZReport(false); setClosingCash("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Z-Report Saved", `End-of-day report for ${formatDateLabel(selectedDate)} has been saved.`);
  };

  const paymentIcons: Record<string, string> = { Card: "credit-card", Cash: "dollar-sign", Credit: "users", Split: "columns" };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={[styles.dateNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={goToPrevDay} style={styles.dateArrow}><Feather name="chevron-left" size={22} color={colors.foreground} /></TouchableOpacity>
        <TouchableOpacity onPress={goToToday} style={styles.dateLabelWrap}>
          <Feather name="calendar" size={14} color={colors.mutedForeground} style={{ marginRight: 6 }} />
          <Text style={[styles.dateLabel, { color: colors.foreground }]}>{formatDateLabel(selectedDate)}</Text>
        </TouchableOpacity>
        <View style={styles.dateRightActions}>
          <TouchableOpacity onPress={goToNextDay} style={[styles.dateArrow, isToday && { opacity: 0.25 }]} disabled={isToday}><Feather name="chevron-right" size={22} color={colors.foreground} /></TouchableOpacity>
          <TouchableOpacity onPress={openStaffModal} style={styles.settingsBtn}><Feather name="user-check" size={17} color={colors.mutedForeground} /></TouchableOpacity>
          <TouchableOpacity onPress={openTaxModal} style={styles.settingsBtn}><Feather name="percent" size={17} color={colors.mutedForeground} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn}><Feather name="settings" size={17} color={colors.mutedForeground} /></TouchableOpacity>
        </View>
      </View>

      {loading ? null : sales.length === 0 ? (
        <EmptyState icon="bar-chart-2" title="No sales this day" subtitle="Navigate to a day with transactions" />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Revenue</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{formatCurrency(stats.revenue)}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Transactions</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{stats.transactionCount}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Avg Order</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{formatCurrency(stats.avgOrder)}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>VAT Collected</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCurrency(stats.vatCollected)}</Text>
            </View>
            {stats.refundCount > 0 && (
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Refunds</Text>
                <Text style={[styles.statValue, { color: colors.destructive }]}>{formatCurrency(stats.refunds)} ({stats.refundCount})</Text>
              </View>
            )}
            {stats.discountTotal > 0 && (
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Discounts</Text>
                <Text style={[styles.statValue, { color: "#F39C12" }]}>{formatCurrency(stats.discountTotal)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Payment Methods</Text>
            {stats.paymentBreakdown.map((p) => (
              <View key={p.method} style={styles.paymentItem}>
                <View style={[styles.paymentIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name={(paymentIcons[p.method] || "circle") as any} size={16} color={colors.primary} />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={[styles.paymentType, { color: colors.foreground }]}>{p.method}</Text>
                  <Text style={[styles.paymentSub, { color: colors.mutedForeground }]}>{p.count} sale{p.count !== 1 ? "s" : ""}</Text>
                </View>
                <Text style={[styles.paymentAmount, { color: colors.foreground }]}>{formatCurrency(p.amount)}</Text>
              </View>
            ))}
          </View>

          {stats.staffSales.length > 1 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sales by Staff</Text>
              {stats.staffSales.sort((a, b) => b.amount - a.amount).map((s) => (
                <View key={s.name} style={styles.paymentItem}>
                  <View style={[styles.paymentIcon, { backgroundColor: "#9B59B6" + "20" }]}><Feather name="user" size={16} color="#9B59B6" /></View>
                  <View style={styles.paymentInfo}>
                    <Text style={[styles.paymentType, { color: colors.foreground }]}>{s.name}</Text>
                    <Text style={[styles.paymentSub, { color: colors.mutedForeground }]}>{s.count} sale{s.count !== 1 ? "s" : ""}</Text>
                  </View>
                  <Text style={[styles.paymentAmount, { color: colors.foreground }]}>{formatCurrency(s.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {peakHour && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hourly Sales</Text>
              <Text style={[styles.peakText, { color: colors.mutedForeground }]}>Peak: {peakHour.label} ({formatCurrency(peakHour.value)})</Text>
              <View style={styles.chartWrap}>
                {hourlyData.filter((h) => h.value > 0 || (h.hour >= 6 && h.hour <= 23)).map((h) => (
                  <View key={h.hour} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${Math.max(h.pct * 100, h.value > 0 ? 4 : 0)}%`, backgroundColor: h.pct > 0.8 ? colors.success : colors.primary, borderRadius: 2 }]} />
                    </View>
                    <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{h.hour}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Selling Products</Text>
            {topProducts.map((tp, idx) => (
              <View key={tp.productId} style={styles.topProductRow}>
                <View style={styles.topProductRank}><Text style={[styles.rankText, { color: idx < 3 ? colors.primary : colors.mutedForeground }]}>{idx + 1}</Text></View>
                <View style={styles.topProductInfo}>
                  <Text style={[styles.topProductName, { color: colors.foreground }]} numberOfLines={1}>{tp.productName}</Text>
                  <View style={styles.topProductBar}>
                    <View style={[styles.topProductBarFill, { width: `${(tp.totalQty / maxProductQty) * 100}%`, backgroundColor: idx < 3 ? colors.primary : colors.mutedForeground + "40", borderRadius: 2 }]} />
                  </View>
                </View>
                <View style={styles.topProductStats}>
                  <Text style={[styles.topProductQty, { color: colors.foreground }]}>x{tp.totalQty}</Text>
                  <Text style={[styles.topProductRev, { color: colors.mutedForeground }]}>{formatCurrency(tp.totalRevenue)}</Text>
                </View>
              </View>
            ))}
          </View>

          {categoryBreakdown.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Revenue by Category</Text>
              {categoryBreakdown.map((cat) => {
                const pct = stats.subtotal > 0 ? (cat.revenue / stats.subtotal) * 100 : 0;
                return (
                  <View key={cat.category} style={styles.catRow}>
                    <View style={styles.catInfo}><Text style={[styles.catName, { color: colors.foreground }]}>{cat.category}</Text><Text style={[styles.catPct, { color: colors.mutedForeground }]}>{pct.toFixed(1)}%</Text></View>
                    <View style={[styles.catBarTrack, { backgroundColor: colors.border }]}><View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: colors.primary, borderRadius: 3 }]} /></View>
                    <Text style={[styles.catRevenue, { color: colors.foreground }]}>{formatCurrency(cat.revenue)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity onPress={() => { setClosingCash(""); setShowZReport(true); }} style={[styles.zReportBtn, { backgroundColor: colors.destructive, borderRadius: colors.radius }]}>
            <Feather name="file-text" size={18} color="#fff" />
            <Text style={styles.zReportBtnText}>Close Register (Z-Report)</Text>
          </TouchableOpacity>

          {currentStaff && (
            <TouchableOpacity onPress={logout} style={[styles.logoutBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="log-out" size={16} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, marginLeft: 8, fontWeight: "600" }}>Lock / Switch Staff</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={showZReport} animationType="fade" transparent>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.sheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>End of Day Z-Report</Text>
            <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>{formatDateLabel(selectedDate)}</Text>

            <View style={[styles.zSummary, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
              <View style={styles.zRow}><Text style={{ color: colors.mutedForeground }}>Total Sales</Text><Text style={{ color: colors.success, fontWeight: "700" }}>{formatCurrency(stats.revenue)}</Text></View>
              <View style={styles.zRow}><Text style={{ color: colors.mutedForeground }}>Total Refunds</Text><Text style={{ color: colors.destructive, fontWeight: "700" }}>-{formatCurrency(stats.refunds)}</Text></View>
              <View style={styles.zRow}><Text style={{ color: colors.mutedForeground }}>Net Sales</Text><Text style={{ color: colors.foreground, fontWeight: "700" }}>{formatCurrency(stats.revenue - stats.refunds)}</Text></View>
              <View style={styles.zRow}><Text style={{ color: colors.mutedForeground }}>VAT Collected</Text><Text style={{ color: colors.foreground, fontWeight: "700" }}>{formatCurrency(stats.vatCollected)}</Text></View>
              <View style={styles.zRow}><Text style={{ color: colors.mutedForeground }}>Transactions</Text><Text style={{ color: colors.foreground, fontWeight: "700" }}>{stats.transactionCount}</Text></View>
              {stats.discountTotal > 0 && <View style={styles.zRow}><Text style={{ color: colors.mutedForeground }}>Discounts</Text><Text style={{ color: "#F39C12", fontWeight: "700" }}>{formatCurrency(stats.discountTotal)}</Text></View>}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Actual Cash in Drawer</Text>
            <TextInput value={closingCash} onChangeText={setClosingCash} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, textAlign: "center", fontSize: 18, fontWeight: "700" }]} />

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setShowZReport(false)} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleGenerateZReport} style={[styles.confirmBtn, { backgroundColor: colors.destructive, borderRadius: colors.radius }]}>
                <Feather name="check" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Save Z-Report</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showStaffModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowStaffModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Staff Management</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <View style={[styles.staffForm, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>{editingStaff ? "Edit Staff" : "Add Staff"}</Text>
              <TextInput value={staffName} onChangeText={setStaffName} placeholder="Staff name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
              <TextInput value={staffPin} onChangeText={setStaffPin} placeholder="4-digit PIN" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" secureTextEntry maxLength={6} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, marginTop: 10 }]} />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                {(["admin", "cashier"] as const).map((r) => (
                  <TouchableOpacity key={r} onPress={() => setStaffRole(r)} style={[styles.roleBtn, { borderColor: staffRole === r ? colors.primary : colors.border, backgroundColor: staffRole === r ? colors.primary + "18" : "transparent", borderRadius: colors.radius }]}>
                    <Text style={{ color: staffRole === r ? colors.primary : colors.mutedForeground, fontWeight: "600", textTransform: "capitalize" }}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={handleSaveStaff} style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{editingStaff ? "Update" : "Add Staff"}</Text>
              </TouchableOpacity>
            </View>
            {staffList.map((s) => (
              <View key={s.id} style={[styles.staffRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={[styles.staffAvatar, { backgroundColor: (s.role === "admin" ? "#9B59B6" : colors.primary) + "20" }]}>
                  <Text style={{ color: s.role === "admin" ? "#9B59B6" : colors.primary, fontWeight: "700" }}>{s.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.staffName, { color: colors.foreground }]}>{s.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, textTransform: "capitalize" }}>{s.role}</Text>
                </View>
                <TouchableOpacity onPress={() => { setEditingStaff(s); setStaffName(s.name); setStaffPin(s.pin); setStaffRole(s.role); }} style={{ padding: 8 }}><Feather name="edit-2" size={14} color={colors.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteStaff(s)} style={{ padding: 8 }}><Feather name="trash-2" size={14} color={colors.destructive} /></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showTaxModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowTaxModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Tax Groups</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <View style={[styles.staffForm, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>{editingTax ? "Edit Tax Group" : "Add Tax Group"}</Text>
              <TextInput value={taxName} onChangeText={setTaxName} placeholder="e.g. Zero-rated, Exempt" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
              <TextInput value={taxRate} onChangeText={setTaxRate} placeholder="Rate % (e.g. 0, 5, 10)" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, marginTop: 10 }]} />
              <TouchableOpacity onPress={handleSaveTax} style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{editingTax ? "Update" : "Add Tax Group"}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.staffRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={{ flex: 1 }}><Text style={[styles.staffName, { color: colors.foreground }]}>Default VAT</Text><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>5% (UAE standard)</Text></View>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>5%</Text>
            </View>
            {taxList.map((tg) => (
              <View key={tg.id} style={[styles.staffRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={{ flex: 1 }}><Text style={[styles.staffName, { color: colors.foreground }]}>{tg.name}</Text></View>
                <Text style={{ color: colors.primary, fontWeight: "700", marginRight: 8 }}>{(tg.rate * 100).toFixed(0)}%</Text>
                <TouchableOpacity onPress={() => { setEditingTax(tg); setTaxName(tg.name); setTaxRate(String(tg.rate * 100)); }} style={{ padding: 8 }}><Feather name="edit-2" size={14} color={colors.primary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteTax(tg)} style={{ padding: 8 }}><Feather name="trash-2" size={14} color={colors.destructive} /></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <BusinessSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  dateArrow: { padding: 6 },
  dateLabelWrap: { flexDirection: "row", alignItems: "center" },
  dateLabel: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  dateRightActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  settingsBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: { flex: 1, minWidth: "45%", padding: 16, borderWidth: 1 },
  statLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold" },
  section: { padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 14 },
  paymentItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  paymentIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  paymentInfo: { flex: 1 },
  paymentType: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  paymentSub: { fontSize: 12, marginTop: 2 },
  paymentAmount: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  peakText: { fontSize: 12, marginBottom: 12 },
  chartWrap: { flexDirection: "row", alignItems: "flex-end", height: 80, gap: 2 },
  barCol: { flex: 1, alignItems: "center" },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "70%", minWidth: 4 },
  barLabel: { fontSize: 8, marginTop: 4 },
  topProductRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  topProductRank: { width: 28, alignItems: "center" },
  rankText: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  topProductInfo: { flex: 1, marginHorizontal: 8 },
  topProductName: { fontSize: 14, fontWeight: "500", marginBottom: 4 },
  topProductBar: { height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2 },
  topProductBarFill: { height: "100%" },
  topProductStats: { alignItems: "flex-end", minWidth: 70 },
  topProductQty: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  topProductRev: { fontSize: 12, marginTop: 2 },
  catRow: { marginBottom: 12 },
  catInfo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  catName: { fontSize: 14, fontWeight: "500" },
  catPct: { fontSize: 12 },
  catBarTrack: { height: 6, borderRadius: 3, marginBottom: 4 },
  catBarFill: { height: "100%" },
  catRevenue: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  zReportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, marginTop: 8 },
  zReportBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, marginTop: 12, borderWidth: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: { width: "100%", maxWidth: 460, padding: 24 },
  sheetTitle: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 4 },
  sheetSub: { fontSize: 13, marginBottom: 16 },
  zSummary: { padding: 16, marginBottom: 16 },
  zRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 12 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  confirmBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: 8 },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  form: { padding: 20, paddingBottom: 60 },
  staffForm: { padding: 16, borderWidth: 1, marginBottom: 16 },
  formLabel: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  roleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderWidth: 1 },
  saveBtn: { marginTop: 14, paddingVertical: 12, alignItems: "center" },
  staffRow: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, marginBottom: 8 },
  staffAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  staffName: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
