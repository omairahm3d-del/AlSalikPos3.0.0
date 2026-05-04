import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { EmptyState } from "@/components/EmptyState";
import { ReceiptModal } from "@/components/ReceiptModal";
import { SaleCard } from "@/components/SaleCard";
import { useDatabase } from "@/context/DatabaseCore";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import type { Sale, SaleItem } from "@/types";
import { formatCurrency } from "@/types";

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadSales, loadSaleWithItems, processRefund } = useDatabase();
  const { currentStaff } = useStaff();
  const permissions = usePermissions();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, SaleItem[]>>({});
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  const fetchSales = useCallback(async () => {
    const data = await loadSales();
    setSales(data);
    setLoading(false);
  }, [loadSales]);

  useFocusEffect(useCallback(() => { fetchSales(); }, [fetchSales]));

  const handleExpand = async (saleId: string) => {
    if (expandedId === saleId) { setExpandedId(null); return; }
    setExpandedId(saleId);
    if (!expandedItems[saleId]) {
      const sale = await loadSaleWithItems(saleId);
      if (sale?.items) setExpandedItems((prev) => ({ ...prev, [saleId]: sale.items! }));
    }
  };

  const handleRefund = (sale: Sale) => {
    if (sale.isRefund) return;
    if (sales.some((s) => s.originalSaleId === sale.id && s.isRefund)) {
      Alert.alert("Already Refunded", "This sale has already been refunded.");
      return;
    }
    Alert.alert(
      "Refund Sale",
      `Refund ${formatCurrency(sale.total)} for invoice ${sale.invoiceNumber || "N/A"}?\n\nThis will reverse the sale, restore stock, and create a refund entry.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Refund",
          style: "destructive",
          onPress: async () => {
            try {
              await processRefund(sale.id, currentStaff?.id, currentStaff?.name);
              await fetchSales();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Refund failed");
            }
          },
        },
      ]
    );
  };

  const todayStats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todaySales = sales.filter((s) => new Date(s.createdAt).toDateString() === todayStr);
    const revenue = todaySales.filter((s) => !s.isRefund).reduce((sum, s) => sum + s.total, 0);
    const refunds = todaySales.filter((s) => s.isRefund).reduce((sum, s) => sum + Math.abs(s.total), 0);
    const vatCollected = todaySales.filter((s) => !s.isRefund).reduce((sum, s) => sum + s.vatAmount, 0);
    return { count: todaySales.filter((s) => !s.isRefund).length, revenue, refunds, vatCollected };
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
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Today's Revenue</Text>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCurrency(todayStats.revenue)}</Text>
          <Text style={[styles.statSub, { color: colors.mutedForeground }]}>{todayStats.count} sale{todayStats.count !== 1 ? "s" : ""}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>VAT Collected</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{formatCurrency(todayStats.vatCollected)}</Text>
          <Text style={[styles.statSub, { color: colors.mutedForeground }]}>Today (5%)</Text>
        </View>
        {todayStats.refunds > 0 && (
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Refunds</Text>
            <Text style={[styles.statValue, { color: colors.destructive }]}>{formatCurrency(todayStats.refunds)}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>All Transactions</Text>

      {sales.length === 0 ? (
        <EmptyState icon="clock" title="No sales yet" subtitle="Completed sales will appear here" />
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
              onPrintReceipt={() => setReceiptSale(item)}
              onRefund={permissions.canRefund ? () => handleRefund(item) : undefined}
              isRefunded={sales.some((s) => s.originalSaleId === item.id && s.isRefund)}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      <ReceiptModal visible={!!receiptSale} sale={receiptSale} onClose={() => setReceiptSale(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", padding: 16, paddingBottom: 8, gap: 12 },
  statCard: { flex: 1, padding: 16, borderWidth: 1 },
  statLabel: { fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 4 },
  statSub: { fontSize: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 4, marginTop: 8 },
});
