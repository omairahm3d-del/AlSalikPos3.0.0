import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLicense } from "@/context/LicenseContext";
import { posApi, type PosPurchaseRow } from "@/lib/posPurchasing";
import { formatCurrency } from "@/types";

/**
 * POS-side recent Goods Received list. Tapping an entry opens the receive
 * form for a new GRN; we keep this read-only for now and route to the
 * Receive Stock screen via the floating button.
 */
export default function PurchasesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useLicense();
  const token = session?.token;

  const [purchases, setPurchases] = useState<PosPurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const r = await posApi.listPurchases(token, { limit: 200 });
      setPurchases(r.purchases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchases");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Reload whenever the screen comes back into focus (e.g. after returning
  // from /receive-stock). Plain useEffect would only fire on mount and
  // leave stale data when the screen stays mounted across navigation.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!token) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Sign in to view purchases.</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Purchases</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      {error && (
        <View style={s.center}>
          <Text style={{ color: "#E74C3C", textAlign: "center" }}>{error}</Text>
        </View>
      )}

      {purchases && (
        <FlatList
          data={purchases}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Text style={[s.empty, { color: colors.mutedForeground }]}>
              No purchases yet. Tap + to receive stock.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[s.row, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.supplier, { color: colors.foreground }]}>{item.supplierName}</Text>
                <Text style={[s.meta, { color: colors.mutedForeground }]}>
                  {new Date(item.receivedAt).toLocaleString()}
                  {item.referenceNumber ? ` · #${item.referenceNumber}` : ""}
                </Text>
                <Text style={[s.meta, { color: colors.mutedForeground }]}>
                  {item.itemCount} item{item.itemCount === 1 ? "" : "s"} · VAT {formatCurrency(Number(item.vatAmount))}
                </Text>
              </View>
              <Text style={[s.total, { color: colors.foreground }]}>
                {formatCurrency(Number(item.total))}
              </Text>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        onPress={() => router.push("/receive-stock")}
        style={[s.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  supplier: { fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 12, marginTop: 2 },
  total: { fontSize: 16, fontWeight: "700", minWidth: 80, textAlign: "right" },
  empty: { textAlign: "center", padding: 32, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
