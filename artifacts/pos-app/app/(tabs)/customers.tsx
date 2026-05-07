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
import { usePermissions } from "@/hooks/usePermissions";
import type { CreditPayment, Customer, Sale } from "@/types";
import { formatCurrency } from "@/types";
import { printHtml } from "@/lib/printBridge";

function buildCustomerStatementHtml(
  customer: Customer,
  timeline: { entry: { kind: string; id: string; date: number; amount: number; invNum?: string; loyaltyPts?: number; method?: string; ref?: string }; balance: number }[],
  companyName: string,
  loyaltyRate: number,
): string {
  const now = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const outstandingBalance = timeline.length > 0 ? timeline[0].balance : 0;

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const formatAmt = (n: number) => `AED ${n.toFixed(2)}`;

  const rows = [...timeline].reverse().map(({ entry, balance }) => {
    const isSale = entry.kind === "sale";
    return `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${isSale ? "Credit Sale" : "Payment"}</td>
        <td>${isSale ? (entry.invNum ?? "") : (entry.method ?? "")}</td>
        <td style="text-align:right;color:${isSale ? "#dc2626" : "#16a34a"};font-weight:600">
          ${isSale ? "+" : "-"}${formatAmt(entry.amount)}
        </td>
        <td style="text-align:right;color:${balance > 0 ? "#374151" : "#16a34a"};font-size:10px">
          ${balance > 0 ? formatAmt(balance) : "Settled"}
        </td>
      </tr>
    `;
  }).join("");

  const totalSales = timeline.filter((t) => t.entry.kind === "sale").reduce((s, t) => s + t.entry.amount, 0);
  const totalPayments = timeline.filter((t) => t.entry.kind !== "sale").reduce((s, t) => s + t.entry.amount, 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Customer Statement — ${customer.name}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:24px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#666;font-size:12px;margin-bottom:20px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
  .info-label{color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px}
  .summary{display:flex;gap:16px;margin-bottom:20px}
  .stat{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:12px;text-align:center}
  .stat-label{color:#888;font-size:10px;text-transform:uppercase;margin-bottom:4px}
  .stat-value{font-size:15px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#f3f4f6;padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:10px;text-transform:uppercase;color:#666}
  td{padding:8px;border-bottom:1px solid #f3f4f6}
  tr:last-child td{border-bottom:none}
  .footer{margin-top:24px;font-size:10px;color:#999;text-align:center}
  @media print{body{padding:12px}}
</style></head><body>
<h1>${companyName}</h1>
<div class="sub">Customer Statement — Printed ${now}</div>

<div class="info-grid">
  <div>
    <div class="info-label">Customer</div>
    <div style="font-weight:600;font-size:14px">${customer.name}</div>
    ${customer.company ? `<div style="color:#666">${customer.company}</div>` : ""}
    ${customer.phone ? `<div style="color:#666">${customer.phone}</div>` : ""}
    ${customer.email ? `<div style="color:#666">${customer.email}</div>` : ""}
  </div>
  <div>
    <div class="info-label">Loyalty Points</div>
    <div style="font-weight:700;color:#d97706">${customer.loyaltyPoints ?? 0} pts</div>
    <div style="color:#666;font-size:11px">Worth AED ${((customer.loyaltyPoints ?? 0) * loyaltyRate).toFixed(2)}</div>
  </div>
</div>

<div class="summary">
  <div class="stat">
    <div class="stat-label">Total Entries</div>
    <div class="stat-value">${timeline.length}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Total Sales</div>
    <div class="stat-value" style="color:#dc2626">AED ${totalSales.toFixed(2)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Total Paid</div>
    <div class="stat-value" style="color:#16a34a">AED ${totalPayments.toFixed(2)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Outstanding</div>
    <div class="stat-value" style="color:${outstandingBalance > 0 ? "#dc2626" : "#16a34a"}">AED ${outstandingBalance.toFixed(2)}</div>
  </div>
</div>

${timeline.length > 0 ? `
<table>
  <thead><tr>
    <th>Date</th><th>Type</th><th>Reference</th>
    <th style="text-align:right">Amount</th><th style="text-align:right">Balance</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>` : `<div style="text-align:center;padding:40px;color:#999">No transactions recorded</div>`}

<div class="footer">${companyName} · Generated ${now}</div>
</body></html>`;
}

export function CustomersScreen({ embedded = false }: { embedded?: boolean }) {
  const permissions = usePermissions();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    loadCustomers, createCustomer, updateCustomer, deleteCustomer,
    recordCreditPayment, loadCreditPayments, loadSales, loadBusinessSettings,
  } = useDatabase();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyName, setCompanyName] = useState("Al Salik POS");

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
  const [loyaltyRate, setLoyaltyRate] = useState(0.01);

  const topPadding = embedded ? 0 : (Platform.OS === "web" ? insets.top + 8 : 0);

  const fetchCustomers = useCallback(async () => {
    const [data, biz] = await Promise.all([loadCustomers(), loadBusinessSettings()]);
    setCustomers(data);
    setLoyaltyRate(biz.loyaltyRedemptionRate || 0.01);
    if (biz.businessName) setCompanyName(biz.businessName);
    setLoading(false);
  }, [loadCustomers, loadBusinessSettings]);

  useFocusEffect(useCallback(() => { fetchCustomers(); }, [fetchCustomers]));

  const filtered = search.trim()
    ? customers.filter((c) => {
        const q = search.toLowerCase().trim();
        return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.company.toLowerCase().includes(q);
      })
    : customers;

  const totalOutstanding = customers.reduce((sum, c) => sum + c.creditBalance, 0);
  const totalLoyaltyPoints = customers.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0);

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
    if (!name.trim()) { Alert.alert("Required", "Customer name is required."); return; }
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
      Alert.alert("Cannot Delete", `${customer.name} has an outstanding balance of ${formatCurrency(customer.creditBalance)}.`);
      return;
    }
    Alert.alert("Delete Customer", `Delete "${customer.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteCustomer(customer.id); await fetchCustomers(); if (selectedCustomer?.id === customer.id) setSelectedCustomer(null); } },
    ]);
  };

  const openCustomerDetail = async (customer: Customer) => {
    setSelectedCustomer(customer);
    const [payments, allSales] = await Promise.all([loadCreditPayments(customer.id), loadSales()]);
    setCreditHistory(payments);
    setCreditSales(allSales.filter((s) => s.customerId === customer.id));
  };

  const handlePrintCustomer = async () => {
    if (!selectedCustomer) return;
    const timeline = buildTimeline();
    const html = buildCustomerStatementHtml(selectedCustomer, timeline, companyName, loyaltyRate);
    await printHtml(html);
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) { Alert.alert("Invalid", "Enter a valid payment amount."); return; }
    if (amt > selectedCustomer.creditBalance) { Alert.alert("Exceeds Balance", `Payment cannot exceed ${formatCurrency(selectedCustomer.creditBalance)}.`); return; }
    await recordCreditPayment(selectedCustomer.id, amt, paymentNote.trim());
    setShowPaymentModal(false); setPaymentAmount(""); setPaymentNote("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await fetchCustomers();
    const updated = (await loadCustomers()).find((c) => c.id === selectedCustomer.id);
    if (updated) { setSelectedCustomer(updated); setCreditHistory(await loadCreditPayments(updated.id)); }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const KNOWN_METHODS = ["Cash", "Card", "Bank Transfer", "Cheque"];

  const parsePaymentNote = (note: string): { method: string; ref: string } => {
    const sep = note.indexOf(" \u2014 ");
    if (sep !== -1) {
      const method = note.slice(0, sep);
      if (KNOWN_METHODS.includes(method)) return { method, ref: note.slice(sep + 3) };
    }
    if (KNOWN_METHODS.includes(note.trim())) return { method: note.trim(), ref: "" };
    return { method: "Cash", ref: note };
  };

  const METHOD_COLORS: Record<string, string> = {
    Cash: "#16a34a",
    Card: "#2563eb",
    "Bank Transfer": "#d97706",
    Cheque: "#7c3aed",
  };

  type TxEntry =
    | { kind: "sale"; id: string; date: number; amount: number; invNum: string; loyaltyPts?: number }
    | { kind: "payment"; id: string; date: number; amount: number; method: string; ref: string };

  const buildTimeline = (): { entry: TxEntry; balance: number }[] => {
    const entries: TxEntry[] = [
      ...creditSales.map((s) => ({ kind: "sale" as const, id: s.id, date: s.createdAt, amount: s.total, invNum: s.invoiceNumber, loyaltyPts: s.loyaltyPointsEarned })),
      ...creditHistory.map((p) => { const { method, ref } = parsePaymentNote(p.note || ""); return { kind: "payment" as const, id: p.id, date: p.createdAt, amount: p.amount, method, ref }; }),
    ].sort((a, b) => a.date - b.date);

    let running = 0;
    const result = entries.map((entry) => {
      running = entry.kind === "sale" ? running + entry.amount : running - entry.amount;
      return { entry, balance: Math.round(running * 100) / 100 };
    });
    return result.reverse();
  };

  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity
      onPress={() => openCustomerDetail(item)}
      onLongPress={permissions.deleteCustomers ? () => handleDelete(item) : undefined}
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
        {(item.loyaltyPoints || 0) > 0 && (
          <View style={styles.loyaltyRow}>
            <Feather name="star" size={10} color="#F39C12" />
            <Text style={{ color: "#F39C12", fontSize: 11, marginLeft: 3 }}>{item.loyaltyPoints} pts</Text>
          </View>
        )}
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
          <Text style={[styles.statValue, { color: totalOutstanding > 0 ? colors.destructive : colors.success }]}>{formatCurrency(totalOutstanding)}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Loyalty Points</Text>
          <Text style={[styles.statValue, { color: "#F39C12" }]}>{totalLoyaltyPoints}</Text>
        </View>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search customers..." placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity>}
      </View>

      {!loading && filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="users" size={40} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{customers.length === 0 ? "No customers yet" : "No results"}</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{customers.length === 0 ? "Tap + to add your first customer" : "Try a different search"}</Text>
        </View>
      ) : (
        <FlatList data={filtered} renderItem={renderCustomer} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} />
      )}

      <TouchableOpacity onPress={openAdd} style={[styles.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
        <Feather name="user-plus" size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showEditor} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowEditor(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingCustomer ? "Edit Customer" : "New Customer"}</Text>
            <TouchableOpacity onPress={handleSave}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name *</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Customer name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="+971 XX XXX XXXX" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Company</Text>
            <TextInput value={company} onChangeText={setCompany} placeholder="Company name (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!selectedCustomer} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSelectedCustomer(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>{selectedCustomer?.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              {(creditSales.length > 0 || creditHistory.length > 0) && (
                <TouchableOpacity onPress={handlePrintCustomer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="printer" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => selectedCustomer && openEdit(selectedCustomer)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="edit-2" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
          {selectedCustomer && (
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}>
                  <Text style={[styles.balanceCardLabel, { color: colors.mutedForeground }]}>Outstanding</Text>
                  <Text style={[styles.balanceCardValue, { color: selectedCustomer.creditBalance > 0 ? colors.destructive : colors.success, fontSize: 22 }]}>
                    {formatCurrency(selectedCustomer.creditBalance)}
                  </Text>
                  {selectedCustomer.creditBalance > 0 && (
                    <TouchableOpacity onPress={() => { setPaymentAmount(""); setPaymentNote(""); setShowPaymentModal(true); }} style={[styles.collectBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}>
                      <Feather name="dollar-sign" size={14} color="#fff" />
                      <Text style={styles.collectBtnText}>Collect</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}>
                  <Text style={[styles.balanceCardLabel, { color: colors.mutedForeground }]}>Loyalty Points</Text>
                  <Text style={[styles.balanceCardValue, { color: "#F39C12", fontSize: 22 }]}>
                    {selectedCustomer.loyaltyPoints || 0}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, textAlign: "center" }}>
                    Worth {formatCurrency((selectedCustomer.loyaltyPoints || 0) * loyaltyRate)}
                  </Text>
                </View>
              </View>

              <View style={styles.detailInfo}>
                {selectedCustomer.company ? <View style={styles.detailRow}><Feather name="briefcase" size={14} color={colors.mutedForeground} /><Text style={[styles.detailText, { color: colors.foreground }]}>{selectedCustomer.company}</Text></View> : null}
                {selectedCustomer.phone ? <View style={styles.detailRow}><Feather name="phone" size={14} color={colors.mutedForeground} /><Text style={[styles.detailText, { color: colors.foreground }]}>{selectedCustomer.phone}</Text></View> : null}
                {selectedCustomer.email ? <View style={styles.detailRow}><Feather name="mail" size={14} color={colors.mutedForeground} /><Text style={[styles.detailText, { color: colors.foreground }]}>{selectedCustomer.email}</Text></View> : null}
              </View>

              {(creditSales.length > 0 || creditHistory.length > 0) && (() => {
                const timeline = buildTimeline();
                return (
                  <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Transaction History</Text>
                      <Text style={[{ fontSize: 11, color: colors.mutedForeground }]}>{timeline.length} entries</Text>
                    </View>

                    {timeline.map(({ entry, balance }, idx) => {
                      const isSale = entry.kind === "sale";
                      const isLast = idx === timeline.length - 1;
                      const methodColor = !isSale ? (METHOD_COLORS[entry.method] ?? "#6b7280") : "";
                      return (
                        <View key={entry.id} style={[styles.txRow, { borderBottomColor: isLast ? "transparent" : colors.border }]}>
                          <View style={[styles.txIcon, { backgroundColor: isSale ? colors.destructive + "18" : colors.success + "18" }]}>
                            <Feather name={isSale ? "file-text" : "arrow-down-circle"} size={15} color={isSale ? colors.destructive : colors.success} />
                          </View>

                          <View style={styles.txMiddle}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <Text style={[styles.txType, { color: colors.foreground }]}>
                                {isSale ? "Credit Sale" : "Payment"}
                              </Text>
                              {isSale ? (
                                <View style={[styles.txBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                                  <Text style={[styles.txBadgeText, { color: colors.mutedForeground }]}>{entry.invNum}</Text>
                                </View>
                              ) : (
                                <View style={[styles.txBadge, { backgroundColor: methodColor + "18", borderColor: methodColor + "40" }]}>
                                  <Text style={[styles.txBadgeText, { color: methodColor }]}>{entry.method}</Text>
                                </View>
                              )}
                              {!isSale && entry.ref ? (
                                <Text style={[styles.txRef, { color: colors.mutedForeground }]} numberOfLines={1}>{entry.ref}</Text>
                              ) : null}
                              {isSale && (entry.loyaltyPts ?? 0) > 0 ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                                  <Feather name="star" size={9} color="#F39C12" />
                                  <Text style={{ color: "#F39C12", fontSize: 10 }}>+{entry.loyaltyPts} pts</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{formatDate(entry.date)}</Text>
                          </View>

                          <View style={styles.txRight}>
                            <Text style={[styles.txAmount, { color: isSale ? colors.destructive : colors.success }]}>
                              {isSale ? "+" : "-"}{formatCurrency(entry.amount)}
                            </Text>
                            <Text style={[styles.txBalance, { color: balance > 0 ? colors.mutedForeground : colors.success }]}>
                              {balance > 0 ? `Bal: ${formatCurrency(balance)}` : "Settled"}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal visible={showPaymentModal} animationType="fade" transparent>
        <View style={styles.payOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.paySheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <Text style={[styles.payTitle, { color: colors.foreground }]}>Collect Payment</Text>
            <Text style={[styles.paySubtitle, { color: colors.mutedForeground }]}>Outstanding: {formatCurrency(selectedCustomer?.creditBalance ?? 0)}</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Amount</Text>
            <TextInput value={paymentAmount} onChangeText={setPaymentAmount} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" autoFocus style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, fontSize: 20, fontWeight: "700", textAlign: "center" }]} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Note (optional)</Text>
            <TextInput value={paymentNote} onChangeText={setPaymentNote} placeholder="e.g. Cash payment" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <View style={styles.payActions}>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)} style={[styles.cancelPayBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRecordPayment} style={[styles.confirmPayBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}>
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
  statsRow: { flexDirection: "row", padding: 16, paddingBottom: 8, gap: 8 },
  statCard: { flex: 1, padding: 12, borderWidth: 1, alignItems: "center" },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, marginTop: 2 },
  loyaltyRow: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  cardRight: { alignItems: "flex-end", marginRight: 4 },
  balLabel: { fontSize: 10, textTransform: "uppercase" },
  balValue: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", flex: 1, textAlign: "center", marginHorizontal: 8 },
  form: { padding: 20, paddingBottom: 60 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 20 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  detailContent: { padding: 16, paddingBottom: 40 },
  balanceCard: { padding: 16, borderWidth: 1, alignItems: "center" },
  balanceCardLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  balanceCardValue: { fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 8 },
  collectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 20, gap: 6 },
  collectBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
  detailInfo: { gap: 10, marginBottom: 16 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailText: { fontSize: 14 },
  section: { padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  historyAmount: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  historyDate: { fontSize: 11, marginTop: 2 },
  historyNote: { fontSize: 12, maxWidth: 150, textAlign: "right" },
  txRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  txIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 1 },
  txMiddle: { flex: 1, minWidth: 0, gap: 3 },
  txType: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  txBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  txBadgeText: { fontSize: 10, fontWeight: "700" },
  txRef: { fontSize: 11, flex: 1 },
  txDate: { fontSize: 11 },
  txRight: { alignItems: "flex-end", gap: 3 },
  txAmount: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  txBalance: { fontSize: 10, fontWeight: "600" },
  payOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  paySheet: { width: "100%", maxWidth: 440, padding: 24 },
  payTitle: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 4 },
  paySubtitle: { fontSize: 13 },
  payActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelPayBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  confirmPayBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: 8 },
  confirmPayText: { color: "#fff", fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
});

export default CustomersScreen;
