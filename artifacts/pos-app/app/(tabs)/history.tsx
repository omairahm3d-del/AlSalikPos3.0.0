import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { SaleCard } from "@/components/SaleCard";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Sale, SaleItem } from "@/types";

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadSales, loadSaleWithItems } = useDatabase();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, SaleItem[]>>({});

  const fetchSales = useCallback(async () => {
    const data = await loadSales();
    setSales(data);
    setLoading(false);
  }, [loadSales]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleExpand = async (saleId: string) => {
    if (expandedId === saleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(saleId);
    if (!expandedItems[saleId]) {
      const sale = await loadSaleWithItems(saleId);
      if (sale?.items) {
        setExpandedItems((prev) => ({ ...prev, [saleId]: sale.items! }));
      }
    }
  };

  const todayStats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todaySales = sales.filter((s) => new Date(s.createdAt).toDateString() === todayStr);
    const revenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const vatCollected = todaySales.reduce((sum, s) => sum + s.vatAmount, 0);
    return { count: todaySales.length, revenue, vatCollected };
  }, [sales]);

  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: topPadding,
        },
      ]}
    >
      <View style={styles.statsRow}>
        <View
          style={[
            styles.statCard,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Today's Revenue</Text>
          <Text style={[styles.statValue, { color: colors.foreground }]}>
            €{todayStats.revenue.toFixed(2)}
          </Text>
          <Text style={[styles.statSub, { color: colors.mutedForeground }]}>
            {todayStats.count} transaction{todayStats.count !== 1 ? "s" : ""}
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>VAT Collected</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            €{todayStats.vatCollected.toFixed(2)}
          </Text>
          <Text style={[styles.statSub, { color: colors.mutedForeground }]}>Today (20%)</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
        All Transactions
      </Text>

      {sales.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No sales yet"
          subtitle="Completed sales will appear here"
        />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <SaleCard
              sale={item}
              expanded={expandedId === item.id}
              items={expandedItems[item.id]}
              onPress={() => handleExpand(item.id)}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsRow: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 8,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
  },
  statLabel: { fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  statSub: { fontSize: 12 },
  sectionTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 4,
    marginTop: 8,
  },
});
