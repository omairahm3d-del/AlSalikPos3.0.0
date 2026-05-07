import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Switch,
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
import {
  posApi,
  type PosStockMovement,
  type PosStockRow,
} from "@/lib/posPurchasing";

/**
 * POS-side Stock screen — read on-hand from the cloud (single source of
 * truth: the unified stock_movements ledger), with manual +/− adjust and
 * a per-product history modal. Mirrors the Back Office StockTab UX.
 */
export default function StockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useLicense();
  const token = session?.token;
  const { loadBusinessSettings, saveBusinessSettings } = useDatabase();

  const [stock, setStock] = useState<PosStockRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<PosStockRow | null>(null);
  const [historyFor, setHistoryFor] = useState<PosStockRow | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const r = await posApi.listStock(token);
      setStock(r.stock);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadBusinessSettings().then((s) => {
      setAllowNegativeStock(s.allowNegativeStock !== false);
    }).catch(() => {});
  }, [loadBusinessSettings]);

  const handleToggleNegativeStock = useCallback(async (value: boolean) => {
    setAllowNegativeStock(value);
    setSavingSettings(true);
    try {
      const current = await loadBusinessSettings();
      await saveBusinessSettings({ ...current, allowNegativeStock: value });
    } catch {
      Alert.alert("Error", "Could not save setting. Please try again.");
      setAllowNegativeStock(!value);
    } finally {
      setSavingSettings(false);
    }
  }, [loadBusinessSettings, saveBusinessSettings]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!stock) return [];
    if (!needle) return stock;
    return stock.filter(
      (r) =>
        r.productName.toLowerCase().includes(needle) ||
        (r.sku ?? "").toLowerCase().includes(needle),
    );
  }, [stock, search]);

  if (!token) {
    return <CenterMessage text="Sign in to view stock." />;
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header
        title="Stock on hand"
        colors={colors}
        onBack={() => router.back()}
        onSettings={() => setShowSettings(true)}
      />

      <View style={[s.searchRow, { borderBottomColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search product or SKU…"
          placeholderTextColor={colors.mutedForeground}
          style={[s.searchInput, { color: colors.foreground }]}
        />
      </View>

      {loading && <CenterSpinner />}
      {error && <CenterMessage text={error} tone="error" />}

      {stock && (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.productClientId}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Text style={[s.empty, { color: colors.mutedForeground }]}>
              {stock.length === 0
                ? "No stock yet. Receive stock or push sales to populate."
                : "No products match your search."}
            </Text>
          }
          renderItem={({ item }) => {
            const onHand = Number(item.onHand);
            const low = onHand <= 0;
            return (
              <View style={[s.row, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowName, { color: colors.foreground }]}>{item.productName}</Text>
                  {item.sku ? (
                    <Text style={[s.rowSku, { color: colors.mutedForeground }]}>SKU: {item.sku}</Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    s.rowQty,
                    { color: low ? "#E74C3C" : colors.foreground },
                  ]}
                >
                  {onHand.toLocaleString()}
                </Text>
                <TouchableOpacity
                  onPress={() => setHistoryFor(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  style={s.iconBtn}
                >
                  <Feather name="clock" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAdjusting(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  style={s.iconBtn}
                >
                  <Feather name="edit-2" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* ── Stock Settings Modal ── */}
      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSettings(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[m.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowSettings(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[m.title, { color: colors.foreground }]}>Stock Settings</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={{ padding: 20, gap: 0 }}>
            <View style={[st.settingRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={[st.settingLabel, { color: colors.foreground }]}>Allow negative stock</Text>
                <Text style={[st.settingDesc, { color: colors.mutedForeground }]}>
                  When enabled, items can be sold even when stock is at zero or below. The quantity will show as negative until stock is received.
                  {"\n"}When disabled, adding an out-of-stock item to the cart is blocked.
                </Text>
              </View>
              <Switch
                value={allowNegativeStock}
                onValueChange={handleToggleNegativeStock}
                disabled={savingSettings}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
            <View style={[st.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[st.infoText, { color: colors.mutedForeground }]}>
                Currently: <Text style={{ fontWeight: "700", color: allowNegativeStock ? "#16a34a" : colors.foreground }}>
                  {allowNegativeStock ? "Negative stock allowed (default)" : "Negative stock blocked"}
                </Text>
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {adjusting && (
        <AdjustModal
          row={adjusting}
          token={token}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            load();
          }}
        />
      )}
      {historyFor && (
        <HistoryModal
          row={historyFor}
          token={token}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </View>
  );
}

function AdjustModal({
  row,
  token,
  onClose,
  onSaved,
}: {
  row: PosStockRow;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const onHand = Number(row.onHand);
  const [direction, setDirection] = useState<"+" | "-">("+");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const delta = (direction === "-" ? -1 : 1) * Math.max(0, parseInt(qty || "0", 10) || 0);
  const newOnHand = onHand + delta;

  async function submit() {
    if (delta === 0) return;
    setSaving(true);
    try {
      await posApi.createAdjustment(token, {
        productClientId: row.productClientId,
        productName: row.productName,
        sku: row.sku,
        delta,
        reason: reason.trim() || null,
      });
      onSaved();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not save adjustment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[m.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[m.title, { color: colors.foreground }]}>Adjust stock</Text>
          <TouchableOpacity onPress={submit} disabled={delta === 0 || saving}>
            <Text style={{ color: delta === 0 ? colors.mutedForeground : colors.primary, fontWeight: "700" }}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: 20, gap: 14 }}>
          <Text style={[m.product, { color: colors.foreground }]}>{row.productName}</Text>
          <Text style={{ color: colors.mutedForeground }}>
            Current on hand: <Text style={{ color: colors.foreground, fontWeight: "700" }}>{onHand}</Text>
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["-", "+"] as const).map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDirection(d)}
                style={[
                  m.dirBtn,
                  {
                    borderColor: direction === d ? colors.primary : colors.border,
                    backgroundColor: direction === d ? colors.primary + "18" : colors.card,
                  },
                ]}
              >
                <Text style={{ color: direction === d ? colors.primary : colors.foreground, fontWeight: "700" }}>
                  {d === "+" ? "Add (+)" : "Remove (−)"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View>
            <Text style={[m.label, { color: colors.mutedForeground }]}>Quantity</Text>
            <TextInput
              value={qty}
              onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              style={[m.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>
          <View>
            <Text style={[m.label, { color: colors.mutedForeground }]}>Reason</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. damaged, recount"
              placeholderTextColor={colors.mutedForeground}
              style={[m.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>
          <View style={[m.preview, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>New on hand will be:</Text>
            <Text style={{ color: newOnHand < 0 ? "#E74C3C" : colors.foreground, fontWeight: "700", fontSize: 18 }}>
              {newOnHand}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function HistoryModal({
  row,
  token,
  onClose,
}: {
  row: PosStockRow;
  token: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PosStockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    posApi
      .listMovements(token, { productClientId: row.productClientId, limit: 200 })
      .then((r) => {
        if (!cancelled) setItems(r.movements);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [token, row.productClientId]);

  return (
    <Modal animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[m.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[m.title, { color: colors.foreground }]}>History</Text>
          <View style={{ width: 22 }} />
        </View>
        <Text style={[m.product, { color: colors.foreground, paddingHorizontal: 20, paddingTop: 12 }]}>
          {row.productName}
        </Text>
        {!items && !error && <CenterSpinner />}
        {error && <CenterMessage text={error} tone="error" />}
        {items && (
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={
              <Text style={[s.empty, { color: colors.mutedForeground }]}>No movements yet.</Text>
            }
            renderItem={({ item }) => {
              const d = Number(item.delta);
              const positive = d > 0;
              return (
                <View style={[s.row, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontWeight: "600", textTransform: "capitalize" }}>
                      {item.kind}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                      {new Date(item.createdAt).toLocaleString()}
                      {item.reason ? ` · ${item.reason}` : ""}
                    </Text>
                  </View>
                  <Text style={{ color: positive ? "#16A085" : "#E74C3C", fontWeight: "700" }}>
                    {positive ? "+" : ""}
                    {d}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

/* ---------------- shared bits ---------------- */

function Header({
  title,
  colors,
  onBack,
  onSettings,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
  onBack: () => void;
  onSettings?: () => void;
}) {
  return (
    <View style={[s.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="chevron-left" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[s.headerTitle, { color: colors.foreground }]}>{title}</Text>
      {onSettings ? (
        <TouchableOpacity onPress={onSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="settings" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 24 }} />
      )}
    </View>
  );
}

function CenterSpinner() {
  const colors = useColors();
  return (
    <View style={s.center}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function CenterMessage({ text, tone }: { text: string; tone?: "error" }) {
  const colors = useColors();
  return (
    <View style={s.center}>
      <Text style={{ color: tone === "error" ? "#E74C3C" : colors.mutedForeground, textAlign: "center" }}>
        {text}
      </Text>
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: { fontSize: 15, fontWeight: "600" },
  rowSku: { fontSize: 12, marginTop: 2 },
  rowQty: { fontSize: 16, fontWeight: "700", minWidth: 50, textAlign: "right" },
  iconBtn: { padding: 6 },
  empty: { textAlign: "center", padding: 32, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});

const m = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: "700" },
  product: { fontSize: 16, fontWeight: "600" },
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderRadius: 8 },
  dirBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderRadius: 8 },
  preview: { padding: 12, borderWidth: 1, borderRadius: 8, marginTop: 4 },
});

const st = StyleSheet.create({
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLabel: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  settingDesc: { fontSize: 13, lineHeight: 19 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
