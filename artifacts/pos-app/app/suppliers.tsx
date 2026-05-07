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
import { Stack, router, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLicense } from "@/context/LicenseContext";
import { posApi, type PosSupplier, type PosPurchaseRow } from "@/lib/posPurchasing";
import { printHtml } from "@/lib/printBridge";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildSupplierStatementHtml(
  supplier: PosSupplier,
  purchases: PosPurchaseRow[],
  companyName: string,
): string {
  const now = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const totalSpend = purchases.reduce((s, p) => s + parseFloat(p.total), 0);
  const totalVat = purchases.reduce((s, p) => s + parseFloat(p.vatAmount), 0);
  const totalNet = totalSpend - totalVat;

  const rows = purchases
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .map((p) => `
      <tr>
        <td>${fmtDateTime(p.receivedAt)}</td>
        <td>${p.referenceNumber ?? "—"}</td>
        <td style="text-align:center">${p.itemCount}</td>
        <td style="text-align:right">AED ${(parseFloat(p.total) - parseFloat(p.vatAmount)).toFixed(2)}</td>
        <td style="text-align:right">AED ${parseFloat(p.vatAmount).toFixed(2)}</td>
        <td style="text-align:right;font-weight:600">AED ${parseFloat(p.total).toFixed(2)}</td>
      </tr>
    `).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Supplier Statement — ${supplier.name}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:24px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#666;font-size:12px;margin-bottom:20px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:12px}
  .info-label{color:#888;font-size:10px;text-transform:uppercase;margin-bottom:2px}
  .summary{display:flex;gap:16px;margin-bottom:20px}
  .stat{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:12px;text-align:center}
  .stat-label{color:#888;font-size:10px;text-transform:uppercase;margin-bottom:4px}
  .stat-value{font-size:16px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#f3f4f6;padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:10px;text-transform:uppercase;color:#666}
  td{padding:8px;border-bottom:1px solid #f3f4f6}
  tr:last-child td{border-bottom:none}
  .footer{margin-top:24px;font-size:10px;color:#999;text-align:center}
  @media print{body{padding:12px}}
</style></head><body>
<h1>${companyName}</h1>
<div class="sub">Supplier Statement — Printed ${now}</div>

<div class="info-grid">
  <div>
    <div class="info-label">Supplier</div>
    <div style="font-weight:600;font-size:14px">${supplier.name}</div>
    ${supplier.trnNumber ? `<div style="color:#666">TRN: ${supplier.trnNumber}</div>` : ""}
    ${supplier.phone ? `<div style="color:#666">${supplier.phone}</div>` : ""}
    ${supplier.email ? `<div style="color:#666">${supplier.email}</div>` : ""}
  </div>
  <div>
    ${supplier.address ? `<div class="info-label">Address</div><div style="color:#444">${supplier.address}</div>` : ""}
    ${supplier.paymentTerms ? `<div class="info-label" style="margin-top:8px">Payment Terms</div><div style="color:#444">${supplier.paymentTerms}</div>` : ""}
  </div>
</div>

<div class="summary">
  <div class="stat">
    <div class="stat-label">Total GRNs</div>
    <div class="stat-value">${purchases.length}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Net Amount</div>
    <div class="stat-value">AED ${totalNet.toFixed(2)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">VAT (5%)</div>
    <div class="stat-value">AED ${totalVat.toFixed(2)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Total Spend</div>
    <div class="stat-value" style="color:#1d4ed8">AED ${totalSpend.toFixed(2)}</div>
  </div>
</div>

${purchases.length > 0 ? `
<table>
  <thead><tr>
    <th>Date</th><th>Reference</th><th style="text-align:center">Items</th>
    <th style="text-align:right">Net</th><th style="text-align:right">VAT</th>
    <th style="text-align:right">Total</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>` : `<div style="text-align:center;padding:40px;color:#999">No purchases recorded</div>`}

<div class="footer">${companyName} · Generated ${now}</div>
</body></html>`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAmount(val: string) {
  return `AED ${parseFloat(val).toFixed(2)}`;
}

export default function SuppliersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useLicense();
  const token = session?.token;
  const isOffline = session?.license.licenseType === "offline";

  const [suppliers, setSuppliers] = useState<PosSupplier[]>([]);
  const [allPurchases, setAllPurchases] = useState<PosPurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const [selectedSupplier, setSelectedSupplier] = useState<PosSupplier | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<PosSupplier | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [trnNumber, setTrnNumber] = useState("");
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
      const [{ suppliers: list }, { purchases }] = await Promise.all([
        posApi.listSuppliers(token),
        posApi.listPurchases(token),
      ]);
      setSuppliers(list);
      setAllPurchases(purchases);
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
    setName(""); setTrnNumber(""); setPhone(""); setEmail("");
    setAddress(""); setPaymentTerms(""); setNotes("");
    setIsActive(true);
    setShowModal(true);
  };

  const openEdit = (sup: PosSupplier) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setTrnNumber(sup.trnNumber ?? "");
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
        trnNumber: trnNumber.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        notes: notes.trim() || null,
        isActive,
      };
      if (editingSupplier) {
        const { supplier: updated } = await posApi.updateSupplier(token, editingSupplier.id, patch);
        setShowModal(false);
        if (selectedSupplier?.id === updated.id) setSelectedSupplier(updated);
      } else {
        await posApi.createSupplier(token, patch);
        setShowModal(false);
      }
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
            const { supplier: updated } = await posApi.updateSupplier(token, sup.id, { isActive: !sup.isActive });
            await load(true);
            if (selectedSupplier?.id === updated.id) setSelectedSupplier(updated);
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
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.trnNumber ?? "").toLowerCase().includes(q)
    );
  });

  const active = filtered.filter((s) => s.isActive);
  const inactive = filtered.filter((s) => !s.isActive);
  const sections = [
    ...(active.length > 0 ? [{ type: "header" as const, title: `Active (${active.length})` }, ...active.map((s) => ({ type: "item" as const, data: s }))] : []),
    ...(inactive.length > 0 ? [{ type: "header" as const, title: `Inactive (${inactive.length})` }, ...inactive.map((s) => ({ type: "item" as const, data: s }))] : []),
  ];

  const supplierPurchases = selectedSupplier
    ? [...allPurchases]
        .filter((p) => p.supplierId === selectedSupplier.id)
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    : [];

  const totalSpend = supplierPurchases.reduce((s, p) => s + parseFloat(p.total), 0);

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
        onPress={() => setSelectedSupplier(sup)}
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
          {sup.trnNumber ? (
            <View style={styles.metaItem}>
              <Feather name="hash" size={11} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>TRN: {sup.trnNumber}</Text>
            </View>
          ) : null}
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

  const handlePrintSupplier = async () => {
    if (!selectedSupplier) return;
    const html = buildSupplierStatementHtml(
      selectedSupplier,
      supplierPurchases,
      session?.company?.name ?? "Al Salik POS",
    );
    await printHtml(html);
  };

  if (isOffline) {
    return <OfflineLockout colors={colors} insets={insets} onBack={() => router.back()} title="Suppliers" />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Suppliers",
          headerBackTitle: "Back",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 4, paddingVertical: 4 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
          ),
        }}
      />

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

      {/* ── Supplier Detail Modal ── */}
      <Modal visible={!!selectedSupplier} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedSupplier(null)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedSupplier(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
              {selectedSupplier?.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <TouchableOpacity onPress={handlePrintSupplier} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="printer" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => selectedSupplier && openEdit(selectedSupplier)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="edit-2" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {selectedSupplier && (
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              {/* Stats row */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Purchases</Text>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{supplierPurchases.length}</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, flex: 1 }]}>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Spend</Text>
                  <Text style={[styles.statValue, { color: colors.primary }]}>AED {totalSpend.toFixed(2)}</Text>
                </View>
              </View>

              {/* Contact info */}
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {selectedSupplier.trnNumber ? (
                  <View style={styles.infoRow}>
                    <Feather name="hash" size={15} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>TRN</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedSupplier.trnNumber}</Text>
                    </View>
                  </View>
                ) : null}
                {selectedSupplier.phone ? (
                  <View style={[styles.infoRow, { borderTopWidth: selectedSupplier.trnNumber ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }]}>
                    <Feather name="phone" size={15} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Phone</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedSupplier.phone}</Text>
                    </View>
                  </View>
                ) : null}
                {selectedSupplier.email ? (
                  <View style={[styles.infoRow, { borderTopWidth: (selectedSupplier.trnNumber || selectedSupplier.phone) ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }]}>
                    <Feather name="mail" size={15} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Email</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedSupplier.email}</Text>
                    </View>
                  </View>
                ) : null}
                {selectedSupplier.address ? (
                  <View style={[styles.infoRow, { borderTopWidth: (selectedSupplier.trnNumber || selectedSupplier.phone || selectedSupplier.email) ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }]}>
                    <Feather name="map-pin" size={15} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Address</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedSupplier.address}</Text>
                    </View>
                  </View>
                ) : null}
                {selectedSupplier.paymentTerms ? (
                  <View style={[styles.infoRow, { borderTopWidth: (selectedSupplier.trnNumber || selectedSupplier.phone || selectedSupplier.email || selectedSupplier.address) ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }]}>
                    <Feather name="clock" size={15} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Payment Terms</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedSupplier.paymentTerms}</Text>
                    </View>
                  </View>
                ) : null}
                {selectedSupplier.notes ? (
                  <View style={[styles.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <Feather name="file-text" size={15} color={colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Notes</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedSupplier.notes}</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Deactivate / Reactivate */}
              <TouchableOpacity
                onPress={() => { setSelectedSupplier(null); handleDeactivate(selectedSupplier); }}
                style={[styles.deactivateBtn, {
                  borderColor: selectedSupplier.isActive ? colors.destructive : colors.success,
                  borderRadius: colors.radius,
                }]}
              >
                <Feather
                  name={selectedSupplier.isActive ? "user-x" : "user-check"}
                  size={15}
                  color={selectedSupplier.isActive ? colors.destructive : colors.success}
                />
                <Text style={{ color: selectedSupplier.isActive ? colors.destructive : colors.success, fontWeight: "600", fontSize: 14 }}>
                  {selectedSupplier.isActive ? "Deactivate Supplier" : "Reactivate Supplier"}
                </Text>
              </TouchableOpacity>

              {/* Purchase history */}
              {supplierPurchases.length > 0 && (
                <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <View style={styles.txCardHeader}>
                    <Text style={[styles.txCardTitle, { color: colors.foreground }]}>Purchase History</Text>
                    <Text style={[styles.txCardCount, { color: colors.mutedForeground }]}>{supplierPurchases.length} GRN{supplierPurchases.length !== 1 ? "s" : ""}</Text>
                  </View>
                  {supplierPurchases.map((p, idx) => {
                    const isLast = idx === supplierPurchases.length - 1;
                    const hasRef = !!p.referenceNumber;
                    return (
                      <View key={p.id} style={[styles.txRow, { borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                        <View style={[styles.txIcon, { backgroundColor: colors.primary + "18" }]}>
                          <Feather name="package" size={15} color={colors.primary} />
                        </View>
                        <View style={styles.txMiddle}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <Text style={[styles.txType, { color: colors.foreground }]}>Goods Received</Text>
                            {hasRef && (
                              <View style={[styles.txBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                                <Text style={[styles.txBadgeText, { color: colors.mutedForeground }]}>{p.referenceNumber}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                            {fmtDateTime(p.receivedAt)} · {p.itemCount} item{p.itemCount !== 1 ? "s" : ""}
                          </Text>
                          {p.notes ? (
                            <Text style={[styles.txNote, { color: colors.mutedForeground }]} numberOfLines={1}>{p.notes}</Text>
                          ) : null}
                        </View>
                        <View style={styles.txRight}>
                          <Text style={[styles.txAmount, { color: colors.foreground }]}>{fmtAmount(p.total)}</Text>
                          {parseFloat(p.vatAmount) > 0 && (
                            <Text style={[styles.txVat, { color: colors.mutedForeground }]}>VAT {fmtAmount(p.vatAmount)}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {supplierPurchases.length === 0 && (
                <View style={[styles.txEmpty, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Feather name="package" size={28} color={colors.mutedForeground} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <Text style={[{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }]}>No purchases recorded yet</Text>
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Editor Modal ── */}
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

              <Text style={[styles.label, { color: colors.mutedForeground }]}>TRN (Tax Registration Number)</Text>
              <TextInput
                value={trnNumber}
                onChangeText={setTrnNumber}
                placeholder="e.g. 100123456700003"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
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
  detailContent: { padding: 16, paddingBottom: 60 },
  statCard: { padding: 14, borderWidth: 1, alignItems: "center" },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: "700" },
  infoCard: { borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 },
  infoLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 14 },
  deactivateBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, padding: 12, justifyContent: "center", marginBottom: 16 },
  txCard: { borderWidth: 1, overflow: "hidden", marginTop: 4 },
  txCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  txCardTitle: { fontSize: 14, fontWeight: "700" },
  txCardCount: { fontSize: 12 },
  txRow: { flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 10 },
  txIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
  txMiddle: { flex: 1 },
  txType: { fontSize: 14, fontWeight: "600" },
  txBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  txBadgeText: { fontSize: 11 },
  txDate: { fontSize: 11, marginTop: 2 },
  txNote: { fontSize: 11, marginTop: 2, fontStyle: "italic" },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 14, fontWeight: "700" },
  txVat: { fontSize: 10, marginTop: 2 },
  txEmpty: { borderWidth: 1, padding: 24, alignItems: "center", marginTop: 4 },
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

function OfflineLockout({
  colors, insets, onBack, title,
}: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: { top: number };
  onBack: () => void;
  title: string;
}) {
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginTop: 16, textAlign: "center" }}>
          Not available on offline license
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
          This feature requires a cloud connection.{"\n"}Upgrade to an online license to access it.
        </Text>
      </View>
    </View>
  );
}
