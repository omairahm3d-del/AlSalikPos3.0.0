import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLicense } from "@/context/LicenseContext";
import { posApi, type PosSupplier } from "@/lib/posPurchasing";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SuppliersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useLicense();
  const token = session?.token;

  const [suppliers, setSuppliers] = useState<PosSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<PosSupplier | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const { suppliers: list } = await posApi.listSuppliers(token);
      setSuppliers(list);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to load suppliers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const openAdd = () => {
    setEditingSupplier(null);
    setName(""); setPhone(""); setEmail("");
    setAddress(""); setPaymentTerms(""); setNotes("");
    setIsActive(true);
    setShowModal(true);
  };

  const openEdit = (sup: PosSupplier) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setPhone(sup.phone ?? "");
    setEmail(sup.email ?? "");
    setAddress(sup.address ?? "");
    setPaymentTerms(sup.paymentTerms ?? "");
    setNotes(sup.notes ?? "");
    setIsActive(sup.isActive);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Invalid", "Supplier name is required.");
      return;
    }
    if (!token) return;
    setSaving(true);
    try {
      const patch = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        notes: notes.trim() || null,
        isActive,
      };
      if (editingSupplier) {
        await posApi.updateSupplier(token, editingSupplier.id, patch);
      } else {
        await posApi.createSupplier(token, patch);
      }
      setShowModal(false);
      await load(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (sup: PosSupplier) => {
    const action = sup.isActive ? "Deactivate" : "Reactivate";
    const msg = sup.isActive
      ? `"${sup.name}" will no longer appear in the supplier picker. Existing purchases are unaffected.`
      : `"${sup.name}" will appear in the supplier picker again.`;
    Alert.alert(`${action} Supplier`, msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: action,
        style: sup.isActive ? "destructive" : "default",
        onPress: async () => {
          if (!token) return;
          try {
            await posApi.updateSupplier(token, sup.id, { isActive: !sup.isActive });
            await load(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to update supplier");
          }
        },
      },
    ]);
  };

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q)
    );
  });

  const active = filtered.filter((s) => s.isActive);
  const inactive = filtered.filter((s) => !s.isActive);
  const sections = [
    ...(active.length > 0 ? [{ type: "header" as const, title: `Active (${active.length})` }, ...active.map((s) => ({ type: "item" as const, data: s }))] : []),
    ...(inactive.length > 0 ? [{ type: "header" as const, title: `Inactive (${inactive.length})` }, ...inactive.map((s) => ({ type: "item" as const, data: s }))] : []),
  ];

  const renderRow = ({ item }: { item: typeof sections[number] }) => {
    if (item.type === "header") {
      return (
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
          {item.title}
        </Text>
      );
    }
    const sup = item.data;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: sup.isActive ? 1 : 0.6 }]}
        onPress={() => openEdit(sup)}
        activeOpacity={0.75}
      >
        <View style={[styles.cardIcon, { backgroundColor: "#8E44AD18" }]}>
          <Feather name="truck" size={20} color="#8E44AD" />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
              {sup.name}
            </Text>
            {!sup.isActive && (
              <View style={[styles.inactiveBadge, { borderColor: colors.mutedForeground }]}>
                <Text style={[styles.inactiveBadgeText, { color: colors.mutedForeground }]}>Inactive</Text>
              </View>
            )}
          </View>
          {(sup.phone || sup.email) && (
            <View style={styles.metaRow}>
              {sup.phone ? (
                <View style={styles.metaItem}>
                  <Feather name="phone" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{sup.phone}</Text>
                </View>
              ) : null}
              {sup.email ? (
                <View style={styles.metaItem}>
                  <Feather name="mail" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{sup.email}</Text>
                </View>
              ) : null}
            </View>
          )}
          {sup.paymentTerms ? (
            <Text style={[styles.paymentTerms, { color: colors.mutedForeground }]} numberOfLines={1}>
              Terms: {sup.paymentTerms}
            </Text>
          ) : null}
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            Added {fmtDate(sup.createdAt)}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={() => handleDeactivate(sup)}
            style={[styles.actionBtn, { backgroundColor: sup.isActive ? colors.destructive + "12" : "#27AE6012" }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather
              name={sup.isActive ? "user-x" : "user-check"}
              size={15}
              color={sup.isActive ? colors.destructive : "#27AE60"}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Suppliers", headerBackTitle: "Back Office" }} />

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, marginTop: insets.top > 0 ? 0 : 8 }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search suppliers…"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : suppliers.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: "#8E44AD18", borderRadius: 40 }]}>
            <Feather name="truck" size={36} color="#8E44AD" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Suppliers Yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Add suppliers to track who you buy from and link them to goods received notes.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={openAdd}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.emptyBtnText}>Add First Supplier</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item, i) => item.type === "header" ? `h-${i}` : item.data.id}
          renderItem={renderRow}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 24, borderRadius: colors.radius * 2 }]}
        onPress={openAdd}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingSupplier ? "Edit Supplier" : "New Supplier"}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Name *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Al Madina Wholesale"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.secondary, borderColor: name.trim() ? colors.primary : colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                autoFocus={!editingSupplier}
              />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Phone</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+971 50 123 4567"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="orders@supplier.com"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: colors.mutedForeground }]}>Address</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Street, City, Country"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={2}
                style={[styles.input, styles.multiline, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              />

              <Text style={[styles.label, { color: colors.mutedForeground }]}>Payment Terms</Text>
              <TextInput
                value={paymentTerms}
                onChangeText={setPaymentTerms}
                placeholder="e.g. Net 30, COD, 50% upfront"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              />

              <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Internal notes about this supplier…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                style={[styles.input, styles.multiline, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              />

              {editingSupplier && (
                <View style={[styles.toggleRow, { borderColor: colors.border, borderRadius: colors.radius }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Active</Text>
                    <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>
                      Inactive suppliers won't appear in the Receive Stock picker.
                    </Text>
                  </View>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>
              )}

              {editingSupplier && (
                <View style={[styles.metaCard, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Text style={[styles.metaCardRow, { color: colors.mutedForeground }]}>
                    Created: {fmtDate(editingSupplier.createdAt)}
                  </Text>
                  <Text style={[styles.metaCardRow, { color: colors.mutedForeground }]}>
                    Last updated: {fmtDate(editingSupplier.updatedAt)}
                  </Text>
                  {editingSupplier.branchId && (
                    <Text style={[styles.metaCardRow, { color: colors.mutedForeground }]}>
                      Scope: branch-private
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: { width: 80, height: 80, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  emptySubtitle: { fontSize: 13, textAlign: "center", marginBottom: 24, lineHeight: 19 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 16, marginBottom: 6, paddingLeft: 2 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    gap: 12,
  },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: 2 },
  cardBody: { flex: 1, gap: 3 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
  inactiveBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  inactiveBadgeText: { fontSize: 10, fontWeight: "600" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12 },
  paymentTerms: { fontSize: 12, marginTop: 2 },
  cardDate: { fontSize: 11, marginTop: 4 },
  cardActions: { justifyContent: "flex-start", paddingTop: 2 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  form: { padding: 20, gap: 4 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: { height: 70, textAlignVertical: "top", paddingTop: 10 },
  row: { flexDirection: "row", gap: 12 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 20,
  },
  toggleLabel: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  toggleHint: { fontSize: 12, lineHeight: 17 },
  metaCard: { borderWidth: 1, padding: 12, marginTop: 20, gap: 4 },
  metaCardRow: { fontSize: 12 },
});
