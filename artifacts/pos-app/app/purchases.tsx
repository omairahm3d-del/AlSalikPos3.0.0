import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLicense } from "@/context/LicenseContext";
import { posApi, type PosPurchaseItem, type PosPurchaseRow } from "@/lib/posPurchasing";
import { formatCurrency } from "@/types";

const CURRENCY = "AED";

function fmt(n: string | number) {
  return `${CURRENCY} ${Math.abs(Number(n)).toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildGrnHtml(purchase: PosPurchaseRow, items: PosPurchaseItem[]): string {
  const rows = items.map((it) => `
    <tr>
      <td style="padding:6px 4px;border-bottom:1px solid #eee">${it.productName}${it.sku ? `<br><span style="font-size:11px;color:#888">SKU: ${it.sku}</span>` : ""}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${fmt(it.unitCost)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${fmt(it.vatAmount)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${fmt(it.lineTotal)}</td>
    </tr>`).join("");

  const subtotal = Number(purchase.subtotal);
  const vat = Number(purchase.vatAmount);
  const total = Number(purchase.total);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>GRN – ${purchase.referenceNumber ?? purchase.id.slice(0, 8)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 24px; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .badge { display: inline-block; background: #0D6EFD; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-bottom: 16px; }
    .meta { margin-bottom: 16px; }
    .meta p { margin-bottom: 4px; color: #444; }
    .meta strong { color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead th { background: #f4f4f4; padding: 8px 4px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th.r { text-align: right; }
    thead th.c { text-align: center; }
    .totals { margin-left: auto; width: 260px; }
    .totals tr td { padding: 5px 8px; }
    .totals tr td:last-child { text-align: right; font-weight: 600; }
    .totals tr.grand td { border-top: 2px solid #111; font-size: 15px; }
    .notes { margin-top: 16px; padding: 10px; background: #f9f9f9; border-radius: 6px; font-size: 12px; color: #555; }
    @media print { body { padding: 8px; } }
  </style>
</head>
<body>
  <h1>Goods Received Note</h1>
  <div class="badge">PURCHASE RECORD</div>
  <div class="meta">
    <p><strong>Supplier:</strong> ${purchase.supplierName}</p>
    <p><strong>Date:</strong> ${fmtDate(purchase.receivedAt)}</p>
    ${purchase.referenceNumber ? `<p><strong>Reference #:</strong> ${purchase.referenceNumber}</p>` : ""}
    <p><strong>Items:</strong> ${purchase.itemCount}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="c">Qty</th>
        <th class="r">Unit Cost</th>
        <th class="r">VAT</th>
        <th class="r">Line Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td>${fmt(subtotal)}</td></tr>
    <tr><td>VAT</td><td>${fmt(vat)}</td></tr>
    <tr class="grand"><td>Total</td><td>${fmt(total)}</td></tr>
  </table>
  ${purchase.notes ? `<div class="notes"><strong>Notes:</strong> ${purchase.notes}</div>` : ""}
</body>
</html>`;
}

export default function PurchasesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useLicense();
  const token = session?.token;
  const isOffline = session?.license.licenseType === "offline";

  const [purchases, setPurchases] = useState<PosPurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Detail modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ purchase: PosPurchaseRow; items: PosPurchaseItem[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const r = await posApi.listPurchases(token, { limit: 200 });
      setPurchases(r.purchases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchases");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => { load(); }, [load]),
  );

  // Load detail whenever a row is tapped
  useEffect(() => {
    if (!selectedId || !token) return;
    setDetail(null);
    setDetailLoading(true);
    posApi.getPurchase(token, selectedId)
      .then((r) => setDetail(r))
      .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Could not load purchase"))
      .finally(() => setDetailLoading(false));
  }, [selectedId, token]);

  const handlePrint = useCallback(async () => {
    if (!detail) return;
    setPrinting(true);
    try {
      const html = buildGrnHtml(detail.purchase, detail.items);
      const { printHtml } = await import("@/lib/printBridge");
      const handled = await printHtml(html, {});
      if (!handled) {
        const ExpoP = await import("expo-print");
        await ExpoP.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert("Print Error", e?.message || "Could not print");
    } finally {
      setPrinting(false);
    }
  }, [detail]);

  const handleExportPdf = useCallback(async () => {
    if (!detail) return;
    setPrinting(true);
    try {
      const html = buildGrnHtml(detail.purchase, detail.items);
      const ExpoP = await import("expo-print");
      const Sharing = await import("expo-sharing");
      const { uri } = await ExpoP.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Export GRN" });
      } else {
        Alert.alert("Saved", `PDF saved to:\n${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Export Error", e?.message || "Could not export PDF");
    } finally {
      setPrinting(false);
    }
  }, [detail]);

  if (!token) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Sign in to view purchases.</Text>
      </View>
    );
  }

  if (isOffline) {
    return <OfflineLockout colors={colors} insets={insets} onBack={() => router.back()} title="Purchase History" />;
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Purchases</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      )}
      {error && (
        <View style={s.center}>
          <Text style={{ color: "#E74C3C", textAlign: "center" }}>{error}</Text>
        </View>
      )}

      {purchases && (
        <FlatList
          data={purchases}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
          ListEmptyComponent={
            <Text style={[s.empty, { color: colors.mutedForeground }]}>
              No purchases yet. Tap + to receive stock.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedId(item.id)}
              style={[s.row, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.supplier, { color: colors.foreground }]}>{item.supplierName}</Text>
                <Text style={[s.meta, { color: colors.mutedForeground }]}>
                  {fmtDate(item.receivedAt)}
                  {item.referenceNumber ? ` · #${item.referenceNumber}` : ""}
                </Text>
                <Text style={[s.meta, { color: colors.mutedForeground }]}>
                  {item.itemCount} item{item.itemCount === 1 ? "" : "s"} · VAT {formatCurrency(Number(item.vatAmount))}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[s.total, { color: colors.foreground }]}>
                  {formatCurrency(Number(item.total))}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        onPress={() => router.push("/receive-stock")}
        style={[s.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* ── Purchase Detail Modal ── */}
      <Modal
        visible={!!selectedId}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setSelectedId(null); setDetail(null); }}
      >
        <View style={[s.detailRoot, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[s.detailHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              onPress={() => { setSelectedId(null); setDetail(null); }}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.detailTitle, { color: colors.foreground }]}>Purchase Detail</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={handleExportPdf}
                disabled={!detail || printing}
                style={[s.actionBtn, { borderColor: colors.border, opacity: (!detail || printing) ? 0.4 : 1 }]}
              >
                <Feather name="file-text" size={16} color={colors.foreground} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePrint}
                disabled={!detail || printing}
                style={[s.actionBtn, { borderColor: colors.border, opacity: (!detail || printing) ? 0.4 : 1 }]}
              >
                <Feather name="printer" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>
          </View>

          {detailLoading && (
            <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
          )}

          {detail && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
              {/* Summary card */}
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Row label="Supplier" value={detail.purchase.supplierName} colors={colors} bold />
                <Row label="Date" value={fmtDate(detail.purchase.receivedAt)} colors={colors} />
                {detail.purchase.referenceNumber && (
                  <Row label="Reference #" value={detail.purchase.referenceNumber} colors={colors} />
                )}
                {detail.purchase.notes && (
                  <Row label="Notes" value={detail.purchase.notes} colors={colors} />
                )}
              </View>

              {/* Line items */}
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>ITEMS</Text>
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
                {/* Table header */}
                <View style={[s.tableHeader, { borderBottomColor: colors.border, backgroundColor: colors.secondary }]}>
                  <Text style={[s.thProduct, { color: colors.mutedForeground }]}>Product</Text>
                  <Text style={[s.thNum, { color: colors.mutedForeground }]}>Qty</Text>
                  <Text style={[s.thNum, { color: colors.mutedForeground }]}>Unit Cost</Text>
                  <Text style={[s.thNum, { color: colors.mutedForeground }]}>VAT</Text>
                  <Text style={[s.thNum, { color: colors.mutedForeground }]}>Total</Text>
                </View>
                {detail.items.map((it, idx) => (
                  <View
                    key={it.id}
                    style={[s.itemRow, { borderBottomColor: colors.border, borderBottomWidth: idx < detail.items.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                  >
                    <View style={{ flex: 2 }}>
                      <Text style={[s.itemName, { color: colors.foreground }]}>{it.productName}</Text>
                      {it.sku && <Text style={[s.itemSku, { color: colors.mutedForeground }]}>SKU: {it.sku}</Text>}
                    </View>
                    <Text style={[s.itemNum, { color: colors.foreground }]}>{it.quantity}</Text>
                    <Text style={[s.itemNum, { color: colors.foreground }]}>{fmt(it.unitCost)}</Text>
                    <Text style={[s.itemNum, { color: colors.foreground }]}>{fmt(it.vatAmount)}</Text>
                    <Text style={[s.itemNum, { color: colors.foreground, fontWeight: "600" }]}>{fmt(it.lineTotal)}</Text>
                  </View>
                ))}
              </View>

              {/* Totals */}
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>TOTALS</Text>
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Row label="Subtotal" value={fmt(detail.purchase.subtotal)} colors={colors} />
                <Row label="VAT" value={fmt(detail.purchase.vatAmount)} colors={colors} />
                <View style={[s.divider, { backgroundColor: colors.border }]} />
                <Row label="Total" value={fmt(detail.purchase.total)} colors={colors} bold large />
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={handlePrint}
                  disabled={printing}
                  style={[s.bigBtn, { borderColor: colors.border, flex: 1, opacity: printing ? 0.5 : 1 }]}
                >
                  <Feather name="printer" size={16} color={colors.foreground} />
                  <Text style={[s.bigBtnText, { color: colors.foreground }]}>Print</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleExportPdf}
                  disabled={printing}
                  style={[s.bigBtn, { backgroundColor: colors.primary, borderColor: colors.primary, flex: 1, opacity: printing ? 0.5 : 1 }]}
                >
                  <Feather name="download" size={16} color="#fff" />
                  <Text style={[s.bigBtnText, { color: "#fff" }]}>Export PDF</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

function Row({
  label, value, colors, bold = false, large = false,
}: {
  label: string; value: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  bold?: boolean; large?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: large ? 15 : 13 }}>{label}</Text>
      <Text style={{ color: colors.foreground, fontWeight: bold ? "700" : "500", fontSize: large ? 15 : 13 }}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  supplier: { fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 12, marginTop: 2 },
  total: { fontSize: 16, fontWeight: "700" },
  empty: { textAlign: "center", padding: 32, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56,
    borderRadius: 28, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  // Detail modal
  detailRoot: { flex: 1 },
  detailHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  detailTitle: { fontSize: 17, fontWeight: "700" },
  closeBtn: { padding: 4 },
  actionBtn: {
    borderWidth: 1, borderRadius: 8, padding: 8,
    alignItems: "center", justifyContent: "center",
  },
  card: {
    borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16,
  },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  tableHeader: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderTopLeftRadius: 10, borderTopRightRadius: 10,
  },
  thProduct: { flex: 2, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  thNum: { flex: 1, fontSize: 11, fontWeight: "700", textTransform: "uppercase", textAlign: "right" },
  itemRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" },
  itemName: { fontSize: 13, fontWeight: "600" },
  itemSku: { fontSize: 11, marginTop: 2 },
  itemNum: { flex: 1, fontSize: 12, textAlign: "right" },
  divider: { height: 1, marginVertical: 8 },
  bigBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderWidth: 1, borderRadius: 10,
  },
  bigBtnText: { fontSize: 14, fontWeight: "700" },
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
