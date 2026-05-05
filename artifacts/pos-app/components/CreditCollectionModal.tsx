import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { generateCreditPaymentReceiptHTML } from "@/lib/receiptTemplate";
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

type PayMethod = "Cash" | "Card" | "Bank Transfer" | "Cheque";

const PAYMENT_METHODS: { key: PayMethod; icon: "dollar-sign" | "credit-card" | "repeat" | "file-text" }[] = [
  { key: "Cash", icon: "dollar-sign" },
  { key: "Card", icon: "credit-card" },
  { key: "Bank Transfer", icon: "repeat" },
  { key: "Cheque", icon: "file-text" },
];

export function CreditCollectionModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { loadCustomers, loadSales, recordCreditPayment, loadBusinessSettings } = useDatabase();

  const [query, setQuery] = useState("");
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<CreditEntry | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("Cash");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successInfo, setSuccessInfo] = useState<{
    name: string;
    phone?: string;
    amount: number;
    method: PayMethod;
    remainingBalance: number;
    note: string;
    paidAt: number;
    invoices: { invoiceNumber: string; total: number; createdAt: number }[];
  } | null>(null);

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
      setPayMethod("Cash");
      setErrorMsg("");
      setSuccessInfo(null);
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
    if (byInvoice?.customerId) {
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
    setPayMethod("Cash");
    setErrorMsg("");
  };

  const handleRecordPayment = async () => {
    if (!selected) return;
    setErrorMsg("");

    const amt = Math.round(parseFloat(payAmount) * 100) / 100;
    const balance = Math.round(selected.customer.creditBalance * 100) / 100;

    if (isNaN(amt) || amt <= 0) {
      setErrorMsg("Please enter a valid payment amount.");
      return;
    }
    if (amt > balance + 0.005) {
      setErrorMsg(`Payment (${formatCurrency(amt)}) cannot exceed outstanding balance of ${formatCurrency(balance)}.`);
      return;
    }

    const custName = selected.customer.name;
    const custPhone = selected.customer.phone;
    const custId = selected.customer.id;
    const method = payMethod;
    const currentInvoices = selected.sales.map((s) => ({
      invoiceNumber: s.invoiceNumber ?? "",
      total: s.total,
      createdAt: s.createdAt,
    }));
    const noteText = [method, payNote.trim()].filter(Boolean).join(" — ");
    const remaining = Math.max(0, Math.round((balance - amt) * 100) / 100);

    setSaving(true);
    try {
      await recordCreditPayment(custId, amt, noteText || "Credit payment collected");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore on web */ }
      setSuccessInfo({
        name: custName,
        phone: custPhone,
        amount: amt,
        method,
        remainingBalance: remaining,
        note: payNote.trim(),
        paidAt: Date.now(),
        invoices: currentInvoices,
      });
      await fetchData();
      setSelected(null);
      setPayAmount("");
      setPayNote("");
      setPayMethod("Cash");
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to record payment. Please try again.");
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
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {results.map((entry) => (
          <TouchableOpacity
            key={entry.customer.id}
            onPress={() => handleSelectEntry(entry)}
            style={[s.resultCard, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}
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
                  {entry.customer.phone}
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
    const balance = Math.round(cust.creditBalance * 100) / 100;
    return (
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>

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
              <Text style={[s.balanceAmt, { color: colors.destructive }]}>{formatCurrency(balance)}</Text>
            </View>
          </View>

          {/* Invoices */}
          {selected.sales.length > 0 && (
            <View style={[s.invoiceBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
              <Text style={[s.sectionLabel, { color: colors.foreground }]}>Credit Invoices</Text>
              {[...selected.sales]
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
                  onPress={() => { setPayMethod(m.key); setErrorMsg(""); }}
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
            borderColor: errorMsg ? colors.destructive : colors.border,
            borderRadius: colors.radius,
          }]}>
            <View style={[s.aedBadge, { backgroundColor: colors.primary }]}>
              <Text style={s.aedText}>AED</Text>
            </View>
            <TextInput
              value={payAmount}
              onChangeText={(v) => { setPayAmount(v); setErrorMsg(""); }}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              style={[s.amtInput, { color: colors.foreground, flex: 1 }]}
            />
          </View>

          <TouchableOpacity
            onPress={() => { setPayAmount(balance.toFixed(2)); setErrorMsg(""); }}
            style={s.fullPayBtn}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
              Pay full balance ({formatCurrency(balance)})
            </Text>
          </TouchableOpacity>

          {/* Inline error */}
          {!!errorMsg && (
            <View style={[s.errorBox, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "40", borderRadius: colors.radius }]}>
              <Feather name="alert-circle" size={14} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: 13, flex: 1, marginLeft: 6 }}>{errorMsg}</Text>
            </View>
          )}

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

        {/* Sticky action buttons */}
        <View style={[s.actions, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => { setSelected(null); setErrorMsg(""); }}
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
      </View>
    );
  };

  const handlePrintReceipt = async () => {
    if (!successInfo) return;
    try {
      const business = await loadBusinessSettings();
      const html = generateCreditPaymentReceiptHTML({
        customerName: successInfo.name,
        customerPhone: successInfo.phone,
        paymentMethod: successInfo.method,
        amountPaid: successInfo.amount,
        remainingBalance: successInfo.remainingBalance,
        note: successInfo.note || undefined,
        paidAt: successInfo.paidAt,
        invoices: successInfo.invoices,
      }, business);
      const { printHtml } = await import("@/lib/printBridge");
      const ps = business.printerSettings;
      await printHtml(html, {
        deviceName: ps?.windowsReceiptPrinterName || "",
        paperWidth: ps?.paperWidth || "80mm",
        rawMode: !!ps?.rawTextMode,
        autoCut: ps?.autoCutPaper !== false,
        codepage: ps?.rawCodepage || "cp1252",
      });
    } catch { /* ignore */ }
  };

  const renderSuccess = () => {
    if (!successInfo) return null;
    return (
      <View style={s.successBox}>
        <View style={[s.successIcon, { backgroundColor: colors.success + "20" }]}>
          <Feather name="check-circle" size={44} color={colors.success} />
        </View>
        <Text style={[s.successTitle, { color: colors.foreground }]}>Payment Recorded</Text>
        <Text style={[s.successAmt, { color: colors.success }]}>{formatCurrency(successInfo.amount)}</Text>
        <Text style={[s.successSub, { color: colors.mutedForeground }]}>
          Collected from <Text style={{ fontWeight: "700", color: colors.foreground }}>{successInfo.name}</Text>
        </Text>
        <Text style={[s.successSub, { color: colors.mutedForeground }]}>
          via <Text style={{ fontWeight: "700", color: colors.foreground }}>{successInfo.method}</Text>
        </Text>
        {successInfo.remainingBalance > 0 ? (
          <View style={[s.balancePill, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "40" }]}>
            <Feather name="alert-circle" size={12} color={colors.destructive} />
            <Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
              Remaining: {formatCurrency(successInfo.remainingBalance)}
            </Text>
          </View>
        ) : (
          <View style={[s.balancePill, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}>
            <Feather name="check" size={12} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
              Account fully settled
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handlePrintReceipt}
          style={[s.printBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <Feather name="printer" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14, marginLeft: 6 }}>Print Receipt</Text>
        </TouchableOpacity>

        <View style={s.successBtns}>
          <TouchableOpacity
            onPress={() => setSuccessInfo(null)}
            style={[s.anotherBtn, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.secondary }]}
          >
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "600", marginLeft: 6 }}>Collect Another</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[s.doneBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const showingSuccess = !!successInfo;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[s.sheet, { backgroundColor: colors.card, borderRadius: 20 }]}
        >
          {/* Header */}
          <View style={[s.header, { borderBottomColor: colors.border }]}>
            {selected && !showingSuccess ? (
              <TouchableOpacity onPress={() => { setSelected(null); setErrorMsg(""); }} style={s.headerBack}>
                <Feather name="arrow-left" size={20} color={colors.foreground} />
              </TouchableOpacity>
            ) : (
              <View style={[s.headerIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="credit-card" size={18} color={colors.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: colors.foreground }]}>
                {showingSuccess ? "Payment Confirmed" : selected ? `Collect from ${selected.customer.name}` : "Collect Credit Payment"}
              </Text>
              {!selected && !showingSuccess && (
                <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
                  {creditCustomers.length} customer{creditCustomers.length !== 1 ? "s" : ""} with outstanding balance
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Search bar — list view only */}
          {!selected && !showingSuccess && (
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
            {showingSuccess
              ? renderSuccess()
              : selected
                ? renderPaymentForm()
                : renderSearchResults()
            }
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", minHeight: 400, paddingHorizontal: 16, paddingTop: 16, paddingBottom: Platform.OS === "ios" ? 0 : 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 14, borderBottomWidth: 1, marginBottom: 12 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerBack: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 6 },
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
  custCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 10 },
  invoiceBox: { padding: 14, marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  invoiceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1 },
  invNum: { fontSize: 14, fontWeight: "600" },
  invDate: { fontSize: 12, marginTop: 2 },
  invAmt: { fontSize: 14, fontWeight: "700" },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 8 },
  methodRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  methodBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderWidth: 1, gap: 2 },
  amtRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, marginBottom: 4, overflow: "hidden" },
  aedBadge: { paddingHorizontal: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  aedText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  amtInput: { paddingVertical: 14, paddingHorizontal: 16, fontSize: 28, fontWeight: "700", textAlign: "center" },
  fullPayBtn: { alignItems: "center", marginBottom: 4 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", padding: 10, borderWidth: 1, marginBottom: 4 },
  noteInput: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  actions: { flexDirection: "row", gap: 10, paddingTop: 10, borderTopWidth: 1, marginTop: 4 },
  backBtn: { flex: 1, flexDirection: "row", borderWidth: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  payBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  successBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 24, paddingHorizontal: 16, gap: 6 },
  successIcon: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { fontSize: 20, fontWeight: "700" },
  successAmt: { fontSize: 32, fontWeight: "800", marginVertical: 4 },
  successSub: { fontSize: 14, textAlign: "center" },
  balancePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  printBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, marginTop: 12, width: "100%" },
  successBtns: { flexDirection: "row", gap: 10, marginTop: 12, width: "100%" },
  anotherBtn: { flex: 1, flexDirection: "row", borderWidth: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  doneBtn: { flex: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
});
