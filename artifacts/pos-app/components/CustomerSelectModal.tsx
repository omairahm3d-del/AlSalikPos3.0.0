import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Customer } from "@/types";
import { formatCurrency } from "@/types";

interface Props {
  visible: boolean;
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}

export function CustomerSelectModal({ visible, onSelect, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadCustomers, createCustomer } = useDatabase();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");

  const fetchCustomers = useCallback(async () => {
    const data = await loadCustomers();
    setCustomers(data);
  }, [loadCustomers]);

  useEffect(() => {
    if (visible) {
      fetchCustomers();
      setSearch("");
      setShowCreate(false);
    }
  }, [visible, fetchCustomers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      Alert.alert("Required", "Customer name is required.");
      return;
    }
    const customer = await createCustomer({
      name: newName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim(),
      company: newCompany.trim(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCreate(false);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewCompany("");
    onSelect(customer);
  };

  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity
      onPress={() => onSelect(item)}
      style={[styles.customerRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.customerInfo}>
        <Text style={[styles.customerName, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.company ? (
          <Text style={[styles.customerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.company}
          </Text>
        ) : null}
        {item.phone ? (
          <Text style={[styles.customerSub, { color: colors.mutedForeground }]}>
            {item.phone}
          </Text>
        ) : null}
      </View>
      {item.creditBalance > 0 && (
        <View style={styles.balanceCol}>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Balance</Text>
          <Text style={[styles.balanceValue, { color: colors.destructive }]}>
            {formatCurrency(item.creditBalance)}
          </Text>
        </View>
      )}
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Select Customer</Text>
          <TouchableOpacity onPress={() => setShowCreate(true)}>
            <Feather name="user-plus" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {showCreate ? (
          <View style={styles.createForm}>
            <Text style={[styles.createTitle, { color: colors.foreground }]}>New Customer</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name *</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Customer name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Phone</Text>
            <TextInput
              value={newPhone}
              onChangeText={setNewPhone}
              placeholder="+971 XX XXX XXXX"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="email@example.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Company</Text>
            <TextInput
              value={newCompany}
              onChangeText={setNewCompany}
              placeholder="Company name (optional)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />

            <View style={styles.createActions}>
              <TouchableOpacity
                onPress={() => setShowCreate(false)}
                style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Create & Select</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search customers..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="users" size={40} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {customers.length === 0 ? "No customers yet" : "No results"}
                </Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  {customers.length === 0
                    ? "Tap + to create your first customer"
                    : "Try a different search term"}
                </Text>
                {customers.length === 0 && (
                  <TouchableOpacity
                    onPress={() => setShowCreate(true)}
                    style={[styles.emptyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                  >
                    <Feather name="user-plus" size={16} color="#fff" />
                    <Text style={styles.emptyBtnText}>Add Customer</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <FlatList
                data={filtered}
                renderItem={renderCustomer}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  list: { padding: 16, gap: 8 },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  customerInfo: { flex: 1, minWidth: 0 },
  customerName: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  customerSub: { fontSize: 12, marginTop: 2 },
  balanceCol: { alignItems: "flex-end", marginRight: 4 },
  balanceLabel: { fontSize: 10, textTransform: "uppercase" },
  balanceValue: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14, fontFamily: "Inter_700Bold" },
  createForm: { padding: 20 },
  createTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 10 },
  fieldLabel: {
    fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6,
    marginBottom: 8, marginTop: 16,
  },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  createActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  saveBtn: {
    flex: 2, flexDirection: "row", paddingVertical: 14,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
