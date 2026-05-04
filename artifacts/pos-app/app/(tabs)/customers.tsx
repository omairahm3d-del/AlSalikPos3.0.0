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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { CreditPayment, Customer, Sale } from "@/types";
import { formatCurrency } from "@/types";

export default function CustomersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    loadCustomers, createCustomer, updateCustomer, deleteCustomer,
    recordCreditPayment, loadCreditPayments, loadSales,
  } = useDatabase();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showEditor, setShowEditor] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditPayment[]>([]);
  const [creditSales, setCreditSales] = useState<Sale[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;

  const fetchCustomers = useCallback(async () => {
    const data = await loadCustomers();
    setCustomers(data);
    setLoading(false);
  }, [loadCustomers]);

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, [fetchCustomers])
  );

  const filtered = search.trim()
    ? customers.filter((c) => {
        const q = search.toLowerCase().trim();
        return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.company.toLowerCase().includes(q);
      })
    : customers;

  const totalOutstanding = customers.reduce((sum, c) => sum + c.creditBalance, 0);

  const openAdd = () => {
    setEditingCustomer(null);
    setName(""); setPhone(""); setEmail(""); setCompany("");
    setShowEditor(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name); setPhone(customer.phone);
    setEmail(customer.email); setCompany(customer.company);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Customer name is required.");
      return;
    }
    if (editingCustomer) {
      await updateCustomer({ ...editingCustomer, name: name.trim(), phone: phone.trim(), email: email.trim(), company: company.trim() });
    } else {
      await createCustomer({ name: name.trim(), phone: phone.trim(), email: email.trim(), company: company.trim() });
    }
    setShowEditor(false);
    await fetchCustomers();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = (customer: Customer) => {
    if (customer.creditBalance > 0) {
      Alert.alert("Cannot Delete", `${customer.name} has an outstanding balance of ${formatCurrency(customer.creditBalance)}. Collect payment first.`);
      return;
    }
    Alert.alert("Delete Customer", `Delete "${customer.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCustomer(customer.id);
          await fetchCustomers();
          if (selectedCustomer?.id === customer.id) setSelectedCustomer(null);
        },
      },
    ]);
  };

  const openCustomerDetail = async (customer: Customer) => {
    setSelectedCustomer(customer);
    const [payments, allSales] = await Promise.all([
      loadCreditPayments(customer.id),
      loadSales(),
    ]);
    setCreditHistory(payments);
    setCreditSales(allSales.filter((s) => s.customerId === customer.id));
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid", "Enter a valid payment amount.");
      return;
    }
    if (amt > selectedCustomer.creditBalance) {
      Alert.alert("Exceeds Balance", `Payment cannot exceed outstanding balance of ${formatCurrency(selectedCustomer.creditBalance)}.`);
      return;
    }
    await recordCreditPayment(selectedCustomer.id, amt, paymentNote.trim());
    setShowPaymentModal(false);
    setPaymentAmount("");
    setPaymentNote("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await fetchCustomers();
    const updated = (await loadCustomers()).find((c) => c.id === selectedCustomer.id);
    if (updated) {
      setSelectedCustomer(updated);
      setCreditHistory(await loadCreditPayments(updated.id));
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity
      onPress={() => openCustomerDetail(item)}
      onLongPress={() => handleDelete(item)}
      activeOpacity={0.8}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
        {item.company ? <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>{item.company}</Text> : null}
        {item.phone ? <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{item.phone}</Text> : null}
      </View>
      <View style={styles.cardRight}>
        {item.creditBalance > 0 ? (
          <>
            <Text style={[styles.balLabel, { color: colors.mutedForeground }]}>Owes</Text>
            <Text style={[styles.balValue, { color: colors.destructive }]}>{formatCurrency(item.creditBalance)}</Text>
          </>
        ) : (
          <Text style={[styles.balValue, { color: colors.success }]}>Clear</Text>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Customers</Text>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{customers.length}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Outstanding Credit</Text>
          <Text style={[styles.statValue, { color: totalOutstanding > 0 ? colors.destructive : colors.success }]}>
            {formatCurrency(totalOutstanding)}
          </Text>
        </View>
      </View>

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

      {!loading && filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="users" size={40} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {customers.length === 0 ? "No customers yet" : "No results"}
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {customers.length === 0 ? "Tap + to add your first customer" : "Try a different search"}
          </Text>
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

      <TouchableOpacity
        onPress={openAdd}
        style={[styles.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}
      >
        <Feather name="user-plus" size={22} color="#fff" />
      </TouchableOpacity>

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
              {editingCustomer ? "Edit Customer" : "New Customer"}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name *</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Customer name" placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="+971 XX XXX XXXX" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad"
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address"
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Company</Text>
            <TextInput value={company} onChangeText={setCompany} placeholder="Company name (optional)" placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!selectedCustomer} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
              {selectedCustomer?.name}
            </Text>
            <TouchableOpacity onPress={() => selectedCustomer && openEdit(selectedCustomer)}>
              <Feather name="edit-2" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {selectedCustomer && (
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[styles.balanceCardLabel, { color: colors.mutedForeground }]}>Outstanding Balance</Text>
                <Text style={[styles.balanceCardValue, { color: selectedCustomer.creditBalance > 0 ? colors.destructive : colors.success }]}>
                  {formatCurrency(selectedCustomer.creditBalance)}
                </Text>
                {selectedCustomer.creditBalance > 0 && (
                  <TouchableOpacity
                    onPress={() => { setPaymentAmount(""); setPaymentNote(""); setShowPaymentModal(true); }}
                    style={[styles.collectBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
                  >
                    <Feather name="dollar-sign" size={16} color="#fff" />
                    <Text style={styles.collectBtnText}>Collect Payment</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.detailInfo}>
                {selectedCustomer.company ? (
                  <View style={styles.detailRow}>
                    <Feather name="briefcase" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.detailText, { color: colors.foreground }]}>{selectedCustomer.company}</Text>
                  </View>
                ) : null}
                {selectedCustomer.phone ? (
                  <View style={styles.detailRow}>
                    <Feather name="phone" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.detailText, { color: colors.foreground }]}>{selectedCustomer.phone}</Text>
                  </View>
                ) : null}
                {selectedCustomer.email ? (
                  <View style={styles.detailRow}>
                    <Feather name="mail" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.detailText, { color: colors.foreground }]}>{selectedCustomer.email}</Text>
                  </View>
                ) : null}
              </View>

              {creditSales.length > 0 && (
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Credit Sales</Text>
                  {creditSales.map((sale) => (
                    <View key={sale.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                      <View>
                        <Text style={[styles.historyAmount, { color: colors.destructive }]}>+{formatCurrency(sale.total)}</Text>
                        <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>{formatDate(sale.createdAt)}</Text>
                      </View>
                      <Text style={[styles.historyNote, { color: colors.mutedForeground }]}>{sale.invoiceNumber}</Text>
                    </View>
                  ))}
                </View>
              )}

              {creditHistory.length > 0 && (
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Payments Received</Text>
                  {creditHistory.map((p) => (
                    <View key={p.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                      <View>
                        <Text style={[styles.historyAmount, { color: colors.success }]}>-{formatCurrency(p.amount)}</Text>
                        <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>{formatDate(p.createdAt)}</Text>
                      </View>
                      {p.note ? <Text style={[styles.historyNote, { color: colors.mutedForeground }]}>{p.note}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal visible={showPaymentModal} animationType="fade" transparent>
        <View style={styles.payOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[styles.paySheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}
          >
            <Text style={[styles.payTitle, { color: colors.foreground }]}>Collect Payment</Text>
            <Text style={[styles.paySubtitle, { color: colors.mutedForeground }]}>
              Outstanding: {formatCurrency(selectedCustomer?.creditBalance ?? 0)}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Amount</Text>
            <TextInput
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              autoFocus
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, fontSize: 20, fontWeight: "700", textAlign: "center" }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Note (optional)</Text>
            <TextInput
              value={paymentNote}
              onChangeText={setPaymentNote}
              placeholder="e.g. Cash payment, Bank transfer"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />

            <View style={styles.payActions}>
              <TouchableOpacity
                onPress={() => setShowPaymentModal(false)}
                style={[styles.cancelPayBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRecordPayment}
                style={[styles.confirmPayBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.confirmPayText}>Record Payment</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statsRow: { flexDirection: "row", padding: 16, paddingBottom: 8, gap: 12 },
  statCard: { flex: 1, padding: 16, borderWidth: 1 },
  statLabel: { fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", marginHorizontal: 16,
    marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, marginTop: 2 },
  cardRight: { alignItems: "flex-end", marginRight: 4 },
  balLabel: { fontSize: 10, textTransform: "uppercase" },
  balValue: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
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
  modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", flex: 1, textAlign: "center", marginHorizontal: 8 },
  form: { padding: 20, paddingBottom: 60 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 20 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  detailContent: { padding: 16, paddingBottom: 40 },
  balanceCard: { padding: 20, borderWidth: 1, alignItems: "center", marginBottom: 16 },
  balanceCardLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  balanceCardValue: { fontSize: 28, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  collectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12, paddingHorizontal: 24, gap: 8,
  },
  collectBtnText: { color: "#fff", fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  detailInfo: { gap: 10, marginBottom: 16 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailText: { fontSize: 14 },
  section: { padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  historyAmount: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  historyDate: { fontSize: 11, marginTop: 2 },
  historyNote: { fontSize: 12, maxWidth: 150, textAlign: "right" },
  payOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  paySheet: { width: "100%", maxWidth: 440, padding: 24 },
  payTitle: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 4 },
  paySubtitle: { fontSize: 13 },
  payActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelPayBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  confirmPayBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: 8 },
  confirmPayText: { color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
