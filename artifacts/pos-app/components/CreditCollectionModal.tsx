import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Customer, Sale } from "@/types";
import { formatCurrency } from "@/types";

interface CreditEntry {
  customer: Customer;
  sales: Sale[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CreditCollectionModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { loadCustomers, loadSales, recordCreditPayment } = useDatabase();

  const [query, setQuery] = useState("");
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<CreditEntry | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payMethod, setPayMethod] = useState<"Cash" | "Card" | "Bank Transfer" | "Cheque">("Cash");
  const [saving, setSaving] = useState(false);

  const PAYMENT_METHODS = [
    { key: "Cash" as const, icon: "dollar-sign" as const },
    { key: "Card" as const, icon: "credit-card" as const },
    { key: "Bank Transfer" as const, icon: "repeat" as const },
    { key: "Cheque" as const, icon: "file-text" as const },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [customers, sales] = await Promise.all([loadCustomers(), loadSales()]);
      setAllCustomers(customers);
      setAllSales(sales);
    } catch {
      setAllCustomers([]); setAllSales([]);
    } finally {
      setLoading(false);
    }
  }, [loadCustomers, loadSales]);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setSelected(null);
      setPayAmount("");
      setPayNote("");
      fetchData();
    }
  }, [visible]);

  const creditCustomers = useMemo(() =>
    allCustomers.filter((c) => c.creditBalance > 0),
    [allCustomers]
  );

  const results = useMemo((): CreditEntry[] => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return creditCustomers.map((c) => ({
        customer: c,
        sales: allSales.filter((s) => s.customerId === c.id && s.paymentMethod === "Credit" && !s.isRefund),
      }));
    }

    const byInvoice = allSales.find(
      (s) => s.invoiceNumber?.toLowerCase() === q && s.paymentMethod === "Credit" && !s.isRefund
    );
    if (byInvoice && byInvoice.customerId) {
      const cust = allCustomers.find((c) => c.id === byInvoice.customerId);
      if (cust && cust.creditBalance > 0) {
        return [{
          customer: cust,
          sales: allSales.filter((s) => s.customerId === cust.id && s.paymentMethod === "Credit" && !s.isRefund),
        }];
      }
    }

    const matched = creditCustomers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
    return matched.map((c) => ({
      customer: c,
      sales: allSales.filter((s) => s.customerId === c.id && s.paymentMethod === "Credit" && !s.isRefund),
    }));
  }, [query, creditCustomers, allSales, allCustomers]);

  const handleSelectEntry = (entry: CreditEntry) => {
    setSelected(entry);
    setPayAmount(entry.customer.creditBalance.toFixed(2));
    setPayNote("");
  };

  const handleRecordPayment = async () => {
    if (!selected) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }
    if (amt > selected.customer.creditBalance) {
      Alert.alert("Exceeds Balance", `Payment cannot exceed outstanding balance of ${formatCurrency(selected.customer.creditBalance)}.`);
      return;
    }
    setSaving(true);
    try {
      const noteText = [payMethod, payNote.trim()].filter(Boolean).join(" — ");
      await recordCreditPayment(selected.customer.id, amt, noteText || "Credit payment collected");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchData();
      setSelected(null);
      setPayAmount("");
      setPayNote("");
      setPayMethod("Cash");
      Alert.alert("Payment Recorded", `${formatCurrency(amt)} collected from ${selected.customer.name} via ${payMethod}.`);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  };

  const renderSearchResults = () => {
    if (loading) {
      return (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.hint, { color: colors.mutedForeground }]}>Loading…</Text>
        </View>
      );
    }
    if (creditCustomers.length === 0) {
      return (
        <View style={s.centerBox}>
          <Feather name="check-circle" size={40} color={colors.success} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No Outstanding Credit</Text>
          <Text style={[s.hint, { color: colors.mutedForeground }]}>All customers are fully paid up.</Text>
        </View>
      );
    }
    if (results.length === 0) {
      return (
        <View style={s.centerBox}>
          <Feather name="search" size={32} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No Match</Text>
          <Text style={[s.hint, { color: colors.mutedForeground }]}>Try the customer name, phone, or invoice number.</Text>
        </View>
      );
    }
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {results.map((entry) => (
          <TouchableOpacity
            key={entry.customer.id}
            onPress={() => handleSelectEntry(entry)}
            style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <View style={[s.avatar, { backgroundColor: colors.primary + "20" }]}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>
                {entry.customer.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.custName, { color: colors.foreground }]}>{entry.customer.name}</Text>
              {!!entry.customer.phone && (
                <Text style={[s.custSub, { color: colors.mutedForeground }]}>
                  <Feather name="phone" size={11} /> {entry.customer.phone}
                </Text>
              )}
              <Text style={[s.custSub, { color: colors.mutedForeground }]}>
                {entry.sales.length} credit invoice{entry.sales.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <View style={s.balanceCol}>
              <Text style={[s.balanceLabel, { color: colors.mutedForeground }]}>Outstanding</Text>
              <Text style={[s.balanceAmt, { color: colors.destructive }]}>
                {formatCurrency(entry.customer.creditBalance)}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderPaymentForm = () => {
    if (!selected) return null;
    const cust = selected.customer;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Customer card */}
          <View style={[s.custCard, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
            <View style={[s.avatar, { backgroundColor: colors.primary + "20" }]}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 18 }}>
                {cust.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.custName, { color: colors.foreground }]}>{cust.name}</Text>
              {!!cust.phone && <Text style={[s.custSub, { color: colors.mutedForeground }]}>{cust.phone}</Text>}
            </View>
            <View style={s.balanceCol}>
              <Text style={[s.balanceLabel, { color: colors.mutedForeground }]}>Outstanding</Text>
              <Text style={[s.balanceAmt, { color: colors.destructive }]}>{formatCurrency(cust.creditBalance)}</Text>
            </View>
          </View>

          {/* Invoices */}
          {selected.sales.length > 0 && (
            <View style={[s.invoiceBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
              <Text style={[s.sectionLabel, { color: colors.foreground }]}>Credit Invoices</Text>
              {selected.sales
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((sale) => (
                  <View key={sale.id} style={[s.invoiceRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.invNum, { color: colors.foreground }]}>{sale.invoiceNumber}</Text>
                      <Text style={[s.invDate, { color: colors.mutedForeground }]}>
                        {new Date(sale.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    <Text style={[s.invAmt, { color: colors.foreground }]}>{formatCurrency(sale.total)}</Text>
                  </View>
                ))}
            </View>
          )}

          {/* Payment method */}
          <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Payment Method</Text>
          <View style={s.methodRow}>
            {PAYMENT_METHODS.map((m) => {
              const active = payMethod === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setPayMethod(m.key)}
                  style={[s.methodBtn, {
                    borderRadius: colors.radius,
                    backgroundColor: active ? colors.primary : colors.secondary,
                    borderColor: active ? colors.primary : colors.border,
                  }]}
                >
                  <Feather name={m.icon} size={14} color={active ? "#fff" : colors.mutedForeground} />
                  <Text style={{ color: active ? "#fff" : colors.mutedForeground, fontSize: 12, fontWeight: active ? "700" : "500", marginTop: 3 }}>
                    {m.key}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount input */}
          <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Amount Received</Text>
          <View style={[s.amtRow, {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
            borderRadius: colors.radius,
          }]}>
            <View style={[s.aedBadge, { backgroundColor: colors.primary }]}>
              <Text style={s.aedText}>AED</Text>
            </View>
            <TextInput
              value={payAmount}
              onChangeText={setPayAmount}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              style={[s.amtInput, { color: colors.foreground, flex: 1 }]}
            />
          </View>
          <TouchableOpacity
            onPress={() => setPayAmount(cust.creditBalance.toFixed(2))}
            style={s.fullPayBtn}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
              Pay full balance ({formatCurrency(cust.creditBalance)})
            </Text>
          </TouchableOpacity>

          <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Note (optional)</Text>
          <TextInput
            value={payNote}
            onChangeText={setPayNote}
            placeholder="Reference number, remarks…"
            placeholderTextColor={colors.mutedForeground}
            style={[s.noteInput, {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
              color: colors.foreground,
              borderRadius: colors.radius,
            }]}
          />
        </ScrollView>

        <View style={s.actions}>
          <TouchableOpacity
            onPress={() => setSelected(null)}
            disabled={saving}
            style={[s.backBtn, { borderColor: colors.border, borderRadius: colors.radius, opacity: saving ? 0.4 : 1 }]}
          >
            <Feather name="arrow-left" size={15} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontWeight: "600", marginLeft: 4 }}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRecordPayment}
            disabled={saving}
            style={[s.payBtn, { backgroundColor: colors.success, borderRadius: colors.radius, opacity: saving ? 0.6 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="check-circle" size={16} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>
              {saving ? "Recording…" : "Record Payment"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.card, borderRadius: 20 }]}>
          {/* Header */}
          <View style={[s.header, { borderBottomColor: colors.border }]}>
            {selected ? (
              <TouchableOpacity onPress={() => setSelected(null)} style={s.headerBack}>
                <Feather name="arrow-left" size={20} color={colors.foreground} />
              </TouchableOpacity>
            ) : (
              <View style={[s.headerIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="credit-card" size={18} color={colors.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: colors.foreground }]}>
                {selected ? `Collect from ${selected.customer.name}` : "Collect Credit Payment"}
              </Text>
              {!selected && (
                <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
                  {creditCustomers.length} customer{creditCustomers.length !== 1 ? "s" : ""} with outstanding balance
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Search bar — only on list view */}
          {!selected && (
            <View style={[s.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Invoice #, customer name, or phone…"
                placeholderTextColor={colors.mutedForeground}
                style={[s.searchInput, { color: colors.foreground }]}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Feather name="x" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ flex: 1 }}>
            {selected ? renderPaymentForm() : renderSearchResults()}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { height: "92%", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 14, borderBottomWidth: 1, marginBottom: 12 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerBack: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 4 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
  hint: { fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  resultCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, marginBottom: 8, borderWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  custName: { fontSize: 15, fontWeight: "700" },
  custSub: { fontSize: 12, marginTop: 2 },
  balanceCol: { alignItems: "flex-end", marginRight: 6 },
  balanceLabel: { fontSize: 10, fontWeight: "600" },
  balanceAmt: { fontSize: 15, fontWeight: "700" },
  custCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 14 },
  invoiceBox: { padding: 14, marginBottom: 14 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  invoiceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1 },
  invNum: { fontSize: 14, fontWeight: "600" },
  invDate: { fontSize: 12, marginTop: 2 },
  invAmt: { fontSize: 14, fontWeight: "700" },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 8 },
  methodRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  methodBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderWidth: 1, gap: 2 },
  amtRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, marginBottom: 6, overflow: "hidden" },
  aedBadge: { paddingHorizontal: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  aedText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  amtInput: { paddingVertical: 14, paddingHorizontal: 16, fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 0 },
  fullPayBtn: { alignItems: "center", marginBottom: 6 },
  noteInput: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 16 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8, paddingTop: 8 },
  backBtn: { flex: 1, flexDirection: "row", borderWidth: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  payBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center" },
});
