import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useCart } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkMode } from "@/context/WorkModeContext";
import type { HeldOrder, PosTable, Product } from "@/types";
import { VAT_RATE } from "@/types";

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  available: { bg: "#2ECC71", fg: "#fff", label: "Available" },
  occupied: { bg: "#E74C3C", fg: "#fff", label: "Occupied" },
  reserved: { bg: "#F39C12", fg: "#fff", label: "Reserved" },
};

export default function TablesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { loadTables, createTable, updateTable, deleteTable, setTableStatus, loadHeldOrderByTable, loadProducts, loadTaxGroups } = useDatabase();
  const { restoreCart } = useCart();
  const permissions = usePermissions();
  const { tableLabelSingular, tableLabel } = useWorkMode();

  const [tables, setTables] = useState<PosTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTable, setEditingTable] = useState<PosTable | null>(null);
  const [tableName, setTableName] = useState("");
  const [capacity, setCapacity] = useState("4");

  const topPadding = insets.top + (Platform.OS === "web" ? 8 : 0);
  const numColumns = width >= 1200 ? 6 : width >= 900 ? 5 : width >= 600 ? 4 : 3;

  const fetchTables = useCallback(async () => {
    const data = await loadTables();
    setTables(data);
    setLoading(false);
  }, [loadTables]);

  useFocusEffect(useCallback(() => { fetchTables(); }, [fetchTables]));

  const stats = {
    total: tables.length,
    available: tables.filter((t) => t.status === "available").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    reserved: tables.filter((t) => t.status === "reserved").length,
  };

  const openAdd = () => {
    setEditingTable(null);
    setTableName("");
    setCapacity("4");
    setShowEditor(true);
  };

  const openEdit = (table: PosTable) => {
    setEditingTable(table);
    setTableName(table.name);
    setCapacity(String(table.capacity));
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!tableName.trim()) {
      Alert.alert("Required", `${tableLabelSingular} name is required.`);
      return;
    }
    const cap = parseInt(capacity, 10) || 4;
    if (editingTable) {
      await updateTable({ ...editingTable, name: tableName.trim(), capacity: cap });
    } else {
      await createTable({ name: tableName.trim(), capacity: cap });
    }
    setShowEditor(false);
    await fetchTables();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = (table: PosTable) => {
    if (table.status === "occupied") {
      Alert.alert("Cannot Delete", `${tableLabelSingular} is currently occupied.`);
      return;
    }
    Alert.alert(`Delete ${tableLabelSingular}`, `Delete "${table.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => { await deleteTable(table.id); await fetchTables(); },
      },
    ]);
  };

  const handleTableTap = async (table: PosTable) => {
    if (table.status === "occupied") {
      try {
        const heldOrder = await loadHeldOrderByTable(table.id);
        if (heldOrder && heldOrder.items.length > 0) {
          const [allProducts, taxGroups] = await Promise.all([loadProducts(), loadTaxGroups()]);
          const productMap: Record<string, Product> = {};
          allProducts.forEach((p) => { productMap[p.id] = p; });
          const taxMap: Record<string, number> = {};
          taxGroups.forEach((g) => { taxMap[g.id] = g.rate; });
          const cartItems = heldOrder.items.map((hi) => {
            const product = productMap[hi.productId] || {
              id: hi.productId, name: hi.productName, price: hi.productPrice,
              category: hi.category, description: "", colorHex: hi.colorHex,
              stockQuantity: 999, lowStockThreshold: 10,
            };
            const taxRate = product.taxGroupId ? (taxMap[product.taxGroupId] ?? hi.taxRate ?? VAT_RATE) : (hi.taxRate ?? VAT_RATE);
            return {
              product,
              quantity: hi.quantity,
              taxRate,
              discountType: hi.discountType,
              discountValue: hi.discountValue,
              discountAmount: hi.discountAmount ?? 0,
            };
          });
          restoreCart(cartItems, { id: heldOrder.id, tableId: table.id, tableName: table.name, orderType: heldOrder.orderType });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.navigate("/");
          return;
        }
      } catch (e: any) {
        Alert.alert("Error", "Could not load held order");
        return;
      }
    }
    if (table.status === "available") {
      await setTableStatus(table.id, "reserved");
    } else if (table.status === "reserved") {
      await setTableStatus(table.id, "available");
    } else {
      return;
    }
    await fetchTables();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderTable = ({ item }: { item: PosTable }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.available;
    return (
      <TouchableOpacity
        onPress={() => handleTableTap(item)}
        onLongPress={permissions.canManageTables ? () => openEdit(item) : undefined}
        activeOpacity={0.8}
        style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
      >
        <View style={[styles.statusDot, { backgroundColor: sc.bg }]} />
        <Text style={[styles.tableIcon, { color: colors.foreground }]}>
          <Feather name="layout" size={28} color={sc.bg} />
        </Text>
        <Text style={[styles.tableName, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.tableCapacity, { color: colors.mutedForeground }]}>
          {item.capacity} seats
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg + "20" }]}>
          <Text style={[styles.statusText, { color: sc.bg }]}>{sc.label}</Text>
        </View>
        {permissions.deleteTables && (
          <View style={styles.tableActions}>
            <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="trash-2" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total</Text>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{stats.total}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Available</Text>
          <Text style={[styles.statValue, { color: "#2ECC71" }]}>{stats.available}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Occupied</Text>
          <Text style={[styles.statValue, { color: "#E74C3C" }]}>{stats.occupied}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Reserved</Text>
          <Text style={[styles.statValue, { color: "#F39C12" }]}>{stats.reserved}</Text>
        </View>
      </View>

      {!loading && tables.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="grid" size={40} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {tableLabel.toLowerCase()} yet</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Tap + to add your first {tableLabelSingular.toLowerCase()}</Text>
        </View>
      ) : (
        <FlatList
          data={tables}
          renderItem={renderTable}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          key={String(numColumns)}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        />
      )}

      {permissions.canManageTables && (
        <TouchableOpacity
          onPress={openAdd}
          style={[styles.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}
        >
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal visible={showEditor} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowEditor(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingTable ? `Edit ${tableLabelSingular}` : `New ${tableLabelSingular}`}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{tableLabelSingular} Name *</Text>
            <TextInput
              value={tableName}
              onChangeText={setTableName}
              placeholder={`e.g. ${tableLabelSingular} 1, Station A`}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Capacity (seats)</Text>
            <TextInput
              value={capacity}
              onChangeText={setCapacity}
              placeholder="4"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statsRow: { flexDirection: "row", padding: 16, paddingBottom: 8, gap: 8 },
  statCard: { flex: 1, padding: 12, borderWidth: 1, alignItems: "center" },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  grid: { padding: 10, paddingBottom: 100 },
  tableCard: {
    flex: 1, margin: 5, padding: 16, borderWidth: 1,
    alignItems: "center", minWidth: 100, minHeight: 140,
  },
  statusDot: { position: "absolute", top: 10, right: 10, width: 10, height: 10, borderRadius: 5 },
  tableIcon: { marginBottom: 8, marginTop: 4 },
  tableName: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", textAlign: "center" },
  tableCapacity: { fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginTop: 8 },
  statusText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  tableActions: { position: "absolute", top: 8, left: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13 },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  form: { padding: 20, paddingBottom: 60 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 20 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
});
