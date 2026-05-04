import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BusinessSettingsModal } from "@/components/BusinessSettingsModal";
import { EmptyState } from "@/components/EmptyState";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Sale, SaleItem } from "@/types";
import { formatCurrency } from "@/types";

function getStartOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getEndOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime() + 1;
}

function formatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface TopProduct {
  productName: string;
  productId: string;
  totalQty: number;
  totalRevenue: number;
}

interface CategoryBreakdown {
  category: string;
  revenue: number;
  count: number;
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadSalesWithItemsByDateRange, loadProducts } = useDatabase();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [productCategories, setProductCategories] = useState<Record<string, string>>({});
  const [showSettings, setShowSettings] = useState(false);

  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;
  const isToday = selectedDate.toDateString() === new Date().toDateString();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const startMs = getStartOfDay(selectedDate);
      const endMs = getEndOfDay(selectedDate);
      const result = await loadSalesWithItemsByDateRange(startMs, endMs);
      setSales(result.sales);
      setItems(result.items);
    } catch {
      setSales([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, loadSalesWithItemsByDateRange]);

  const fetchCategories = useCallback(async () => {
    try {
      const prods = await loadProducts();
      const map: Record<string, string> = {};
      prods.forEach((p) => { map[p.id] = p.category; });
      setProductCategories(map);
    } catch {
      setProductCategories({});
    }
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      fetchReport();
      fetchCategories();
    }, [fetchReport, fetchCategories])
  );

  const goToPrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const goToNextDay = () => {
    if (isToday) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  const goToToday = () => setSelectedDate(new Date());

  const stats = useMemo(() => {
    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    const subtotal = sales.reduce((sum, s) => sum + s.subtotal, 0);
    const vatCollected = sales.reduce((sum, s) => sum + s.vatAmount, 0);
    const avgOrder = sales.length > 0 ? revenue / sales.length : 0;
    const cardSales = sales.filter((s) => s.paymentMethod === "Card");
    const cashSales = sales.filter((s) => s.paymentMethod === "Cash");
    return {
      transactionCount: sales.length,
      revenue,
      subtotal,
      vatCollected,
      avgOrder,
      cardCount: cardSales.length,
      cardRevenue: cardSales.reduce((s, sale) => s + sale.total, 0),
      cashCount: cashSales.length,
      cashRevenue: cashSales.reduce((s, sale) => s + sale.total, 0),
    };
  }, [sales]);

  const topProducts = useMemo((): TopProduct[] => {
    const map = new Map<string, TopProduct>();
    items.forEach((item) => {
      const existing = map.get(item.productId);
      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalRevenue += item.lineTotal;
      } else {
        map.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          totalQty: item.quantity,
          totalRevenue: item.lineTotal,
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);
  }, [items]);

  const categoryBreakdown = useMemo((): CategoryBreakdown[] => {
    const map = new Map<string, CategoryBreakdown>();
    items.forEach((item) => {
      const cat = productCategories[item.productId] || "Other";
      const existing = map.get(cat);
      if (existing) {
        existing.revenue += item.lineTotal;
        existing.count += item.quantity;
      } else {
        map.set(cat, { category: cat, revenue: item.lineTotal, count: item.quantity });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [items, productCategories]);

  const maxProductQty = topProducts.length > 0 ? topProducts[0].totalQty : 1;

  const hourlyData = useMemo(() => {
    const hours = new Array(24).fill(0);
    sales.forEach((s) => {
      const h = new Date(s.createdAt).getHours();
      hours[h] += s.total;
    });
    const max = Math.max(...hours, 1);
    return hours.map((val, hour) => ({
      hour,
      value: val,
      pct: val / max,
      label: `${hour.toString().padStart(2, "0")}:00`,
    }));
  }, [sales]);

  const peakHour = useMemo(() => {
    if (sales.length === 0) return null;
    let maxIdx = 0;
    hourlyData.forEach((h, i) => {
      if (h.value > hourlyData[maxIdx].value) maxIdx = i;
    });
    return hourlyData[maxIdx].value > 0 ? hourlyData[maxIdx] : null;
  }, [hourlyData, sales]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={[styles.dateNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={goToPrevDay} style={styles.dateArrow}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToToday} style={styles.dateLabelWrap}>
          <Feather name="calendar" size={14} color={colors.mutedForeground} style={{ marginRight: 6 }} />
          <Text style={[styles.dateLabel, { color: colors.foreground }]}>
            {formatDate(selectedDate)}
          </Text>
        </TouchableOpacity>
        <View style={styles.dateRightActions}>
          <TouchableOpacity
            onPress={goToNextDay}
            style={[styles.dateArrow, isToday && { opacity: 0.25 }]}
            disabled={isToday}
          >
            <Feather name="chevron-right" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn}>
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? null : sales.length === 0 ? (
        <EmptyState
          icon="bar-chart-2"
          title="No sales this day"
          subtitle="Navigate to a day with transactions to see the report"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Revenue</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {formatCurrency(stats.revenue)}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Transactions</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats.transactionCount}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Avg Order</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {formatCurrency(stats.avgOrder)}
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>VAT Collected</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {formatCurrency(stats.vatCollected)}
              </Text>
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Payment Methods</Text>
            <View style={styles.paymentRow}>
              <View style={styles.paymentItem}>
                <View style={[styles.paymentIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="credit-card" size={16} color={colors.primary} />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={[styles.paymentType, { color: colors.foreground }]}>Card</Text>
                  <Text style={[styles.paymentSub, { color: colors.mutedForeground }]}>
                    {stats.cardCount} sale{stats.cardCount !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={[styles.paymentAmount, { color: colors.foreground }]}>
                  {formatCurrency(stats.cardRevenue)}
                </Text>
              </View>
              <View style={[styles.paymentDivider, { backgroundColor: colors.border }]} />
              <View style={styles.paymentItem}>
                <View style={[styles.paymentIcon, { backgroundColor: colors.success + "20" }]}>
                  <Feather name="dollar-sign" size={16} color={colors.success} />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={[styles.paymentType, { color: colors.foreground }]}>Cash</Text>
                  <Text style={[styles.paymentSub, { color: colors.mutedForeground }]}>
                    {stats.cashCount} sale{stats.cashCount !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={[styles.paymentAmount, { color: colors.foreground }]}>
                  {formatCurrency(stats.cashRevenue)}
                </Text>
              </View>
            </View>
          </View>

          {peakHour && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hourly Sales</Text>
              <Text style={[styles.peakText, { color: colors.mutedForeground }]}>
                Peak hour: {peakHour.label} ({formatCurrency(peakHour.value)})
              </Text>
              <View style={styles.chartWrap}>
                {hourlyData.filter((h) => h.value > 0 || (h.hour >= 6 && h.hour <= 23)).map((h) => (
                  <View key={h.hour} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(h.pct * 100, h.value > 0 ? 4 : 0)}%`,
                            backgroundColor: h.pct > 0.8 ? colors.success : colors.primary,
                            borderRadius: 2,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>
                      {h.hour}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Selling Products</Text>
            {topProducts.map((tp, idx) => (
              <View key={tp.productId} style={styles.topProductRow}>
                <View style={styles.topProductRank}>
                  <Text style={[styles.rankText, { color: idx < 3 ? colors.primary : colors.mutedForeground }]}>
                    {idx + 1}
                  </Text>
                </View>
                <View style={styles.topProductInfo}>
                  <Text style={[styles.topProductName, { color: colors.foreground }]} numberOfLines={1}>
                    {tp.productName}
                  </Text>
                  <View style={styles.topProductBar}>
                    <View
                      style={[
                        styles.topProductBarFill,
                        {
                          width: `${(tp.totalQty / maxProductQty) * 100}%`,
                          backgroundColor: idx < 3 ? colors.primary : colors.mutedForeground + "40",
                          borderRadius: 2,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.topProductStats}>
                  <Text style={[styles.topProductQty, { color: colors.foreground }]}>
                    x{tp.totalQty}
                  </Text>
                  <Text style={[styles.topProductRev, { color: colors.mutedForeground }]}>
                    {formatCurrency(tp.totalRevenue)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {categoryBreakdown.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, marginBottom: 30 }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Revenue by Category</Text>
              {categoryBreakdown.map((cat) => {
                const pct = stats.subtotal > 0 ? (cat.revenue / stats.subtotal) * 100 : 0;
                return (
                  <View key={cat.category} style={styles.catRow}>
                    <View style={styles.catInfo}>
                      <Text style={[styles.catName, { color: colors.foreground }]}>{cat.category}</Text>
                      <Text style={[styles.catPct, { color: colors.mutedForeground }]}>
                        {pct.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={[styles.catBarTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.catBarFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: colors.primary,
                            borderRadius: 3,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.catRevenue, { color: colors.foreground }]}>
                      {formatCurrency(cat.revenue)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <BusinessSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dateArrow: { padding: 6 },
  dateLabelWrap: { flexDirection: "row", alignItems: "center" },
  dateLabel: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  dateRightActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  settingsBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    padding: 16,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  section: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    marginBottom: 14,
  },
  paymentRow: { gap: 0 },
  paymentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  paymentInfo: { flex: 1 },
  paymentType: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  paymentSub: { fontSize: 12, marginTop: 2 },
  paymentAmount: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  paymentDivider: { height: 1, marginVertical: 2 },
  peakText: { fontSize: 12, marginBottom: 12 },
  chartWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 80,
    gap: 2,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  bar: {
    width: "70%",
    minWidth: 4,
  },
  barLabel: {
    fontSize: 8,
    marginTop: 4,
  },
  topProductRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  topProductRank: {
    width: 28,
    alignItems: "center",
  },
  rankText: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  topProductInfo: {
    flex: 1,
    marginHorizontal: 8,
  },
  topProductName: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  topProductBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 2,
  },
  topProductBarFill: {
    height: "100%",
  },
  topProductStats: {
    alignItems: "flex-end",
    minWidth: 70,
  },
  topProductQty: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  topProductRev: {
    fontSize: 12,
    marginTop: 2,
  },
  catRow: {
    marginBottom: 12,
  },
  catInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  catName: {
    fontSize: 14,
    fontWeight: "500",
  },
  catPct: {
    fontSize: 12,
  },
  catBarTrack: {
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  catBarFill: {
    height: "100%",
  },
  catRevenue: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
