import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Stack, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLicense } from "@/context/LicenseContext";
import { useDatabase } from "@/context/DatabaseCore";
import { posApi, type PosSupplier } from "@/lib/posPurchasing";
import type { Product } from "@/types";
import { formatCurrency } from "@/types";

/**
 * POS-side Goods Received form. Mirrors the Back Office "Receive Stock"
 * modal: pick supplier (existing or one-off), add lines from the local
 * product catalog (or a custom item), capture qty + unit cost + per-line
 * VAT, and submit. Idempotency key is generated once per form open so
 * accidental double-taps don't create duplicate GRNs / stock movements.
 */
export default function ReceiveStockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useLicense();
  const token = session?.token;
  const isOffline = session?.license.licenseType === "offline";
  const db = useDatabase();

  const [suppliers, setSuppliers] = useState<PosSupplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierMode, setSupplierMode] = useState<"existing" | "new">("existing");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Stable per-form-open key — protects against double-tap duplicates.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    let cancelled = false;
    const suppliersPromise = isOffline
      ? db.loadLocalSuppliers().then((list) =>
          list.map((s): PosSupplier => ({
            id: s.id, branchId: null,
            name: s.name, trnNumber: s.trnNumber ?? null,
            phone: s.phone ?? null, email: s.email ?? null,
            address: s.address ?? null, paymentTerms: s.paymentTerms ?? null,
            notes: s.notes ?? null, isActive: s.isActive,
            createdAt: new Date(s.createdAt).toISOString(),
            updatedAt: new Date(s.createdAt).toISOString(),
          })),
        )
      : (token ? posApi.listSuppliers(token).then((r) => r.suppliers) : Promise.resolve([] as PosSupplier[]));
    Promise.all([suppliersPromise, db.loadProducts()])
      .then(([sups, p]) => {
        if (cancelled) return;
        setSuppliers(sups);
        setProducts(p);
      })
      .catch((e) => {
        if (!cancelled)
          Alert.alert("Failed to load", e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, isOffline, db]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const l of lines) {
      subtotal += l.quantity * l.unitCost;
      vat += l.vatAmount;
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [lines]);

  const finalSupplierName =
    supplierMode === "existing"
      ? (suppliers.find((s) => s.id === supplierId)?.name ?? "")
      : supplierName.trim();

  const canSubmit =
    finalSupplierName.length > 0 &&
    lines.length > 0 &&
    lines.every((l) => l.productName.trim().length > 0 && l.quantity > 0 && l.unitCost >= 0);

  function addProduct(p: Product) {
    setLines((ls) => [
      ...ls,
      {
        key: `${p.id}-${Date.now()}-${Math.random()}`,
        productClientId: p.id,
        productName: p.name,
        sku: p.barcode ?? null,
        quantity: 1,
        unitCost: 0,
        vatAmount: 0,
      },
    ]);
    setShowProductPicker(false);
  }

  function addCustomLine() {
    setLines((ls) => [
      ...ls,
      {
        key: `custom-${Date.now()}-${Math.random()}`,
        productClientId: `custom-${Date.now()}`,
        productName: "",
        sku: null,
        quantity: 1,
        unitCost: 0,
        vatAmount: 0,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  function applyVat5() {
    setLines((ls) =>
      ls.map((l) => ({
        ...l,
        vatAmount: Math.round(l.unitCost * l.quantity * 0.05 * 100) / 100,
      })),
    );
  }

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (isOffline) {
        // Offline: persist to local DB + mirror stock.
        await db.createLocalPurchase({
          supplierName: finalSupplierName,
          referenceNumber: reference.trim() || null,
          notes: notes.trim() || null,
          items: lines.map((l) => ({
            productClientId: l.productClientId,
            productName: l.productName.trim(),
            sku: l.sku,
            quantity: l.quantity,
            unitCost: l.unitCost,
            vatAmount: l.vatAmount,
          })),
        });
      } else {
        if (!token) return;
        await posApi.createPurchase(token, {
          idempotencyKey,
          supplierId: supplierMode === "existing" ? supplierId || null : null,
          supplierName: finalSupplierName,
          referenceNumber: reference.trim() || null,
          notes: notes.trim() || null,
          items: lines.map((l) => ({
            productClientId: l.productClientId,
            productName: l.productName.trim(),
            sku: l.sku,
            quantity: l.quantity,
            unitCost: l.unitCost,
            vatAmount: l.vatAmount,
          })),
        });
      }

      // Mirror the received quantities into the local product catalog so
      // the POS product grid immediately reflects the new stock level.
      // Only real products (non-custom lines matched by id) are updated.
      const productIds = new Set(products.map((p) => p.id));
      for (const l of lines) {
        if (productIds.has(l.productClientId) && l.quantity > 0) {
          try {
            await db.updateStock(l.productClientId, l.quantity);
          } catch {
            // Non-fatal — cloud stock_movements are the source of truth.
          }
        }
      }

      router.back();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not save purchase.");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Sign in to receive stock.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Receive Stock</Text>
        <TouchableOpacity onPress={submit} disabled={!canSubmit || saving}>
          <Text style={{ color: canSubmit && !saving ? colors.primary : colors.mutedForeground, fontWeight: "700" }}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      {loadingMeta ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}>
          {/* Supplier */}
          <View>
            <Text style={[s.label, { color: colors.mutedForeground }]}>Supplier</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              {(["existing", "new"] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setSupplierMode(mode)}
                  style={[
                    s.tab,
                    {
                      borderColor: supplierMode === mode ? colors.primary : colors.border,
                      backgroundColor: supplierMode === mode ? colors.primary + "18" : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: supplierMode === mode ? colors.primary : colors.mutedForeground,
                      fontWeight: "600",
                    }}
                  >
                    {mode === "existing" ? "Directory" : "One-off"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {supplierMode === "existing" ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {suppliers.length === 0 && (
                    <Text style={{ color: colors.mutedForeground, fontStyle: "italic" }}>
                      No suppliers yet — switch to One-off.
                    </Text>
                  )}
                  {suppliers.map((sup) => (
                    <TouchableOpacity
                      key={sup.id}
                      onPress={() => setSupplierId(sup.id)}
                      style={[
                        s.chip,
                        {
                          borderColor: supplierId === sup.id ? colors.primary : colors.border,
                          backgroundColor: supplierId === sup.id ? colors.primary + "18" : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: supplierId === sup.id ? colors.primary : colors.foreground,
                          fontWeight: "600",
                        }}
                      >
                        {sup.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <TextInput
                value={supplierName}
                onChangeText={setSupplierName}
                placeholder="Supplier name"
                placeholderTextColor={colors.mutedForeground}
                style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              />
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.mutedForeground }]}>Reference</Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="INV-2025-001"
                placeholderTextColor={colors.mutedForeground}
                style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.mutedForeground }]}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                placeholderTextColor={colors.mutedForeground}
                style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              />
            </View>
          </View>

          {/* Items */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={[s.label, { color: colors.mutedForeground, marginBottom: 0 }]}>Items</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={() => setShowProductPicker(true)}>
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Product</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addCustomLine}>
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Custom</Text>
                </TouchableOpacity>
              </View>
            </View>

            {lines.length === 0 ? (
              <View style={[s.emptyBox, { borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground }}>No items yet. Pick a product or add a custom item.</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {lines.map((l) => (
                  <View
                    key={l.key}
                    style={[s.lineCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                      <TextInput
                        value={l.productName}
                        onChangeText={(t) => updateLine(l.key, { productName: t })}
                        placeholder="Product name"
                        placeholderTextColor={colors.mutedForeground}
                        style={[s.lineName, { color: colors.foreground }]}
                      />
                      <TouchableOpacity onPress={() => removeLine(l.key)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Feather name="x" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <NumField
                        label="Qty"
                        value={l.quantity}
                        onChange={(n) => updateLine(l.key, { quantity: Math.max(0, Math.floor(n)) })}
                        integer
                      />
                      <NumField
                        label="Unit cost"
                        value={l.unitCost}
                        onChange={(n) => updateLine(l.key, { unitCost: Math.max(0, n) })}
                      />
                      <NumField
                        label="VAT"
                        value={l.vatAmount}
                        onChange={(n) => updateLine(l.key, { vatAmount: Math.max(0, n) })}
                      />
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8, textAlign: "right" }}>
                      Line total: {formatCurrency(l.quantity * l.unitCost + l.vatAmount)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {lines.length > 0 && (
              <TouchableOpacity onPress={applyVat5} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.primary, fontSize: 12 }}>Apply 5% VAT to all lines</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Totals */}
          {lines.length > 0 && (
            <View style={[s.totals, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row label="Subtotal" value={formatCurrency(totals.subtotal)} colors={colors} />
              <Row label="VAT" value={formatCurrency(totals.vat)} colors={colors} />
              <Row
                label="Total"
                value={formatCurrency(totals.total)}
                colors={colors}
                bold
              />
            </View>
          )}
        </ScrollView>
      )}

      <ProductPickerModal
        visible={showProductPicker}
        products={products}
        onClose={() => setShowProductPicker(false)}
        onPick={addProduct}
      />
    </KeyboardAvoidingView>
  );
}

interface DraftLine {
  key: string;
  productClientId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  vatAmount: number;
}

function NumField({
  label,
  value,
  onChange,
  integer,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  integer?: boolean;
}) {
  const colors = useColors();
  const [text, setText] = useState(String(value));
  // Keep local text in sync if the parent resets it (e.g. apply 5% VAT).
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.label, { color: colors.mutedForeground, fontSize: 10, marginBottom: 4 }]}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={(t) => {
          const cleaned = integer ? t.replace(/[^0-9]/g, "") : t.replace(/[^0-9.]/g, "");
          setText(cleaned);
          const n = parseFloat(cleaned);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        keyboardType={integer ? "number-pad" : "decimal-pad"}
        style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, textAlign: "right" }]}
      />
    </View>
  );
}

function Row({
  label,
  value,
  colors,
  bold,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: bold ? colors.foreground : colors.mutedForeground, fontWeight: bold ? "700" : "500" }}>
        {label}
      </Text>
      <Text style={{ color: colors.foreground, fontWeight: bold ? "700" : "500" }}>{value}</Text>
    </View>
  );
}

function ProductPickerModal({
  visible,
  products,
  onClose,
  onPick,
}: {
  visible: boolean;
  products: Product[];
  onClose: () => void;
  onPick: (p: Product) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return products.slice(0, 100);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.barcode ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 100);
  }, [products, q]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Pick product</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ padding: 12 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search…"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 24 }}>
              No products. Add some in Back Office → Products first.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onPick(item)}
              style={[s.row, { borderBottomColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>{item.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {item.barcode ? `SKU ${item.barcode} · ` : ""}
                  {formatCurrency(item.price)}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
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
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 8 },
  emptyBox: {
    padding: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    alignItems: "center",
  },
  lineCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  lineName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 4,
  },
  totals: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
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
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={s.center}>
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
