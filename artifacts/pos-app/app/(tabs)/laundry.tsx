import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useDatabase } from "@/context/DatabaseCore";
import { useLicense } from "@/context/LicenseContext";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { pullLaundryOrders, pushLaundryStatus } from "@/lib/laundryApi";
import {
  formatWhatsAppPhone,
  generateLaundryReadyWhatsAppText,
} from "@/lib/textReceipt";
import { formatCurrency } from "@/types";
import type { BusinessSettings, LaundryOrder, LaundryOrderStatus, Product, Sale } from "@/types";
import type { CartItem } from "@/types";

type StatusTab = LaundryOrderStatus;

const STATUS_TABS: { key: StatusTab; label: string; color: string }[] = [
  { key: "received", label: "Received", color: "#3B82F6" },
  { key: "ready", label: "Ready", color: "#F59E0B" },
  { key: "collected", label: "Collected", color: "#10B981" },
];

type PaymentMethod = "Card" | "Cash" | "Credit";

function elapsedLabel(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function promisedLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-AE", { weekday: "short", month: "short", day: "numeric" })
    + " " + d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" });
}

export default function LaundryOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loadLaundryOrders, updateLaundryOrderStatus, collectLaundryOrder, saveSale, loadBusinessSettings } = useDatabase();
  const { session } = useLicense();
  const { currentStaff } = useStaff();

  const [activeTab, setActiveTab] = useState<StatusTab>("received");
  const [allOrders, setAllOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  const [collectingOrder, setCollectingOrder] = useState<LaundryOrder | null>(null);
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("Card");
  const [collectBusy, setCollectBusy] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  const [detailOrder, setDetailOrder] = useState<LaundryOrder | null>(null);
  const [pendingReadyId, setPendingReadyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      // Try to pull from the server first so all devices see every ticket.
      // Only for online licenses — offline devices stay local-only.
      if (session?.token && session.license.licenseType !== "offline") {
        const serverOrders = await pullLaundryOrders(session.token);
        if (serverOrders !== null) {
          setAllOrders(serverOrders);
          setLoading(false);
          return;
        }
      }
      // Fallback: load from local DB when offline or not yet authenticated.
      const orders = await loadLaundryOrders();
      setAllOrders(orders);
    } catch {
      // ignore load errors; list stays as-is
    } finally {
      setLoading(false);
    }
  }, [loadLaundryOrders, session?.token]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    reload();
    loadBusinessSettings().then(setBusinessSettings).catch(() => null);
  }, [reload, loadBusinessSettings]));

  const displayed = allOrders.filter((o) => o.status === activeTab);

  const sendReadyWhatsApp = useCallback(
    (order: LaundryOrder) => {
      if (!order.customerPhone) return;
      const biz = businessSettings;
      const text = generateLaundryReadyWhatsAppText(order, biz ?? {
        businessName: "",
        trn: "",
        address: "",
        phone: "",
        email: "",
        loyaltyPointsPerAed: 1,
        loyaltyRedemptionRate: 0.01,
        vatEnabled: true,
      } as BusinessSettings);
      const phone = formatWhatsAppPhone(order.customerPhone);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      Linking.openURL(url).catch(() => {
        Alert.alert("WhatsApp", "Could not open WhatsApp. Make sure it is installed.");
      });
    },
    [businessSettings],
  );

  const handleMarkReady = useCallback((order: LaundryOrder) => {
    setPendingReadyId(order.id);
  }, []);

  const handleConfirmReady = useCallback(async (order: LaundryOrder) => {
    setPendingReadyId(null);
    await updateLaundryOrderStatus(order.id, "ready");
    // Push to server so the driver's tablet sees the status change.
    if (session?.token && session.license.licenseType !== "offline") {
      pushLaundryStatus(session.token, order.id, "ready");
    }
    reload();
    // Offer WhatsApp notification if the customer has a phone number.
    if (order.customerPhone) {
      Alert.alert(
        "Order Ready",
        `Notify ${order.customerName} via WhatsApp?`,
        [
          { text: "Skip", style: "cancel" },
          {
            text: "Send WhatsApp",
            onPress: () => sendReadyWhatsApp(order),
          },
        ],
      );
    }
  }, [updateLaundryOrderStatus, reload, session?.token, sendReadyWhatsApp]);

  const handleCollect = useCallback(async () => {
    if (!collectingOrder) return;
    setCollectBusy(true);
    try {
      const syntheticItems: CartItem[] = collectingOrder.items.map((it) => ({
        product: {
          id: it.productId,
          name: it.productName,
          price: it.productPrice,
          category: "Laundry",
          vatEnabled: businessSettings?.vatEnabled !== false,
          inStock: true,
          trackStock: false,
          sku: null,
          barcode: null,
          cost: null,
          imageUrl: null,
          loyaltyPoints: null,
          description: null,
          updatedAt: Date.now(),
          isDeleted: false,
          modifierGroupIds: [],
        } as unknown as Product,
        quantity: it.quantity,
        notes: it.notes ?? undefined,
      }));

      const sale = await saveSale(syntheticItems, {
        paymentMethod: collectMethod,
        orderType: "takeaway",
        customerId: collectingOrder.customerId,
        customerName: collectingOrder.customerName,
        staffId: currentStaff?.id,
        staffName: currentStaff?.name,
        allowNegativeStock: businessSettings?.allowNegativeStock !== false,
      });

      await collectLaundryOrder(collectingOrder.id, sale.id, collectMethod);

      // Push collected status + sale link to server (fire-and-forget).
      if (session?.token) {
        pushLaundryStatus(session.token, collectingOrder.id, "collected", {
          saleId: sale.id,
          paidAt: Date.now(),
          paymentMethod: collectMethod,
        });
      }

      setCollectingOrder(null);
      setReceiptSale(sale);
      reload();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not complete collection.");
    } finally {
      setCollectBusy(false);
    }
  }, [collectingOrder, collectMethod, saveSale, collectLaundryOrder, currentStaff, businessSettings, reload, session?.token]);

  const renderCard = useCallback(({ item }: { item: LaundryOrder }) => {
    const isOverdue = item.status !== "collected" && Date.now() > item.promisedAt;
    const awaitingConfirm = pendingReadyId === item.id;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        onPress={() => { if (!awaitingConfirm) setDetailOrder(item); }}
        activeOpacity={0.75}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={[styles.ticketNum, { color: colors.foreground }]}>{item.ticketNumber}</Text>
            <View style={[styles.typeBadge, { backgroundColor: item.orderType === "express" ? "#EF444418" : "#3B82F618" }]}>
              <Feather
                name={item.orderType === "express" ? "zap" : "package"}
                size={10}
                color={item.orderType === "express" ? "#EF4444" : "#3B82F6"}
              />
              <Text style={[styles.typeBadgeTxt, { color: item.orderType === "express" ? "#EF4444" : "#3B82F6" }]}>
                {item.orderType === "express" ? "Express" : "Drop-off"}
              </Text>
            </View>
          </View>
          <Text style={[styles.total, { color: colors.foreground }]}>{formatCurrency(item.total)}</Text>
        </View>

        <Text style={[styles.customerName, { color: colors.foreground }]}>{item.customerName}</Text>
        {item.customerPhone ? (
          <Text style={[styles.customerPhone, { color: colors.mutedForeground }]}>{item.customerPhone}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <Feather name="clock" size={12} color={isOverdue ? "#EF4444" : colors.mutedForeground} />
          <Text style={[styles.metaTxt, { color: isOverdue ? "#EF4444" : colors.mutedForeground }]}>
            {isOverdue ? "OVERDUE · " : ""}Promise: {promisedLabel(item.promisedAt)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Feather name="layers" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaTxt, { color: colors.mutedForeground }]}>
            {item.items.length} item{item.items.length !== 1 ? "s" : ""} · {elapsedLabel(item.createdAt)}
          </Text>
        </View>

        {item.riderName ? (
          <View style={styles.metaRow}>
            <Feather name="truck" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaTxt, { color: colors.mutedForeground }]}>
              Rider: {item.riderName}
            </Text>
          </View>
        ) : null}

        {item.staffName ? (
          <View style={styles.metaRow}>
            <Feather name="user" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaTxt, { color: colors.mutedForeground }]}>
              Staff: {item.staffName}
            </Text>
          </View>
        ) : null}

        {item.notes ? (
          <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={1}>
            📝 {item.notes}
          </Text>
        ) : null}

        {item.status === "received" && !awaitingConfirm && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#F59E0B", borderRadius: colors.radius }]}
            onPress={() => handleMarkReady(item)}
          >
            <Feather name="check-circle" size={15} color="#fff" />
            <Text style={styles.actionBtnTxt}>Mark Ready</Text>
          </TouchableOpacity>
        )}

        {item.status === "received" && awaitingConfirm && (
          <View style={[styles.confirmRow, { borderRadius: colors.radius }]}>
            <Text style={[styles.confirmTxt, { color: colors.foreground }]}>Mark {item.ticketNumber} as ready?</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={[styles.confirmNo, { borderColor: colors.border, borderRadius: colors.radius }]}
                onPress={() => setPendingReadyId(null)}
              >
                <Text style={[styles.confirmNoTxt, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmYes, { borderRadius: colors.radius }]}
                onPress={() => handleConfirmReady(item)}
              >
                <Feather name="check" size={14} color="#fff" />
                <Text style={styles.confirmYesTxt}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {item.status === "ready" && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {item.customerPhone ? (
              <TouchableOpacity
                style={[styles.whatsappBtn, { borderRadius: colors.radius }]}
                onPress={() => sendReadyWhatsApp(item)}
              >
                <Feather name="message-circle" size={15} color="#25D366" />
                <Text style={styles.whatsappBtnTxt}>WhatsApp</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.success, borderRadius: colors.radius, flex: 1, marginTop: 0 }]}
              onPress={() => { setCollectMethod("Card"); setCollectingOrder(item); }}
            >
              <Feather name="shopping-bag" size={15} color="#fff" />
              <Text style={styles.actionBtnTxt}>Collect &amp; Pay</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.status === "collected" && (
          <View style={[styles.collectedBadge, { borderRadius: colors.radius }]}>
            <Feather name="check" size={13} color="#10B981" />
            <Text style={styles.collectedTxt}>
              Collected · {item.paymentMethod}{item.paidAt ? " · " + elapsedLabel(item.paidAt) : ""}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [colors, pendingReadyId, handleMarkReady, handleConfirmReady]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === "web" ? 8 : 4) }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Laundry Orders</Text>
        <TouchableOpacity onPress={() => { setLoading(true); reload(); }} style={styles.reloadBtn}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {STATUS_TABS.map((t) => {
          const count = allOrders.filter((o) => o.status === t.key).length;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, activeTab === t.key && { borderBottomColor: t.color, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[styles.tabTxt, { color: activeTab === t.key ? t.color : colors.mutedForeground }]}>
                {t.label}
              </Text>
              {count > 0 && (
                <View style={[styles.badge, { backgroundColor: t.color }]}>
                  <Text style={styles.badgeTxt}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : displayed.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>No {activeTab} orders</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Collect & Pay Modal */}
      <Modal visible={!!collectingOrder} animationType="fade" transparent onRequestClose={() => setCollectingOrder(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Collect {collectingOrder?.ticketNumber}
              </Text>
              <TouchableOpacity onPress={() => setCollectingOrder(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetBody} contentContainerStyle={{ paddingBottom: 24 }}>
              {collectingOrder && (
                <>
                  <View style={[styles.summaryBox, { backgroundColor: colors.background, borderRadius: colors.radius }]}>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Customer</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{collectingOrder.customerName}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Items</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{collectingOrder.items.length}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatCurrency(collectingOrder.subtotal)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>VAT (5%)</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatCurrency(collectingOrder.vatAmount)}</Text>
                    </View>
                    <View style={[styles.summaryRow, styles.totalRow]}>
                      <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
                      <Text style={[styles.totalValue, { color: colors.success }]}>{formatCurrency(collectingOrder.total)}</Text>
                    </View>
                  </View>

                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PAYMENT METHOD</Text>
                  <View style={styles.methodRow}>
                    {(["Card", "Cash", "Credit"] as PaymentMethod[]).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.methodBtn,
                          { borderColor: collectMethod === m ? colors.primary : colors.border, borderRadius: colors.radius },
                          collectMethod === m && { backgroundColor: colors.primary + "15" },
                        ]}
                        onPress={() => setCollectMethod(m)}
                      >
                        <Feather
                          name={m === "Card" ? "credit-card" : m === "Cash" ? "dollar-sign" : "user"}
                          size={16}
                          color={collectMethod === m ? colors.primary : colors.mutedForeground}
                        />
                        <Text style={[styles.methodTxt, { color: collectMethod === m ? colors.primary : colors.foreground }]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: colors.success, borderRadius: colors.radius }, collectBusy && { opacity: 0.6 }]}
                    onPress={handleCollect}
                    disabled={collectBusy}
                  >
                    {collectBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Feather name="check" size={18} color="#fff" />
                        <Text style={styles.confirmBtnTxt}>Confirm Collection · {formatCurrency(collectingOrder.total)}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ReceiptModal visible={!!receiptSale} sale={receiptSale} onClose={() => setReceiptSale(null)} />

      {/* Detail Modal */}
      <Modal visible={!!detailOrder} animationType="slide" transparent onRequestClose={() => setDetailOrder(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2, maxHeight: "85%" }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {detailOrder?.ticketNumber} · Details
              </Text>
              <TouchableOpacity onPress={() => setDetailOrder(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetBody} contentContainerStyle={{ paddingBottom: 32 }}>
              {detailOrder && (
                <>
                  <View style={[styles.summaryBox, { backgroundColor: colors.background, borderRadius: colors.radius, marginBottom: 16 }]}>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Customer</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{detailOrder.customerName}</Text>
                    </View>
                    {detailOrder.customerPhone ? (
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Phone</Text>
                        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{detailOrder.customerPhone}</Text>
                      </View>
                    ) : null}
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Type</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{detailOrder.orderType}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Promise</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{promisedLabel(detailOrder.promisedAt)}</Text>
                    </View>
                    {detailOrder.notes ? (
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Notes</Text>
                        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{detailOrder.notes}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ITEMS</Text>
                  {detailOrder.items.map((it) => (
                    <View key={it.id} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, { color: colors.foreground }]}>{it.productName}</Text>
                        {it.notes ? <Text style={[styles.itemNotes, { color: colors.mutedForeground }]}>{it.notes}</Text> : null}
                      </View>
                      <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>×{it.quantity}</Text>
                      <Text style={[styles.itemTotal, { color: colors.foreground }]}>{formatCurrency(it.lineTotal)}</Text>
                    </View>
                  ))}

                  <View style={[styles.summaryBox, { backgroundColor: colors.background, borderRadius: colors.radius, marginTop: 16 }]}>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatCurrency(detailOrder.subtotal)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>VAT (5%)</Text>
                      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatCurrency(detailOrder.vatAmount)}</Text>
                    </View>
                    <View style={[styles.summaryRow, styles.totalRow]}>
                      <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
                      <Text style={[styles.totalValue, { color: colors.success }]}>{formatCurrency(detailOrder.total)}</Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  reloadBtn: { padding: 4 },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, gap: 6 },
  tabTxt: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  loader: { marginTop: 60 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTxt: { fontSize: 15 },
  list: { padding: 16, gap: 12 },
  card: { padding: 16, borderWidth: 1, gap: 6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTopLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  ticketNum: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  typeBadgeTxt: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  total: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  customerName: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  customerPhone: { fontSize: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaTxt: { fontSize: 12 },
  notes: { fontSize: 12, fontStyle: "italic" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, marginTop: 4 },
  actionBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14, fontFamily: "Inter_700Bold" },
  whatsappBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, borderColor: "#25D366" },
  whatsappBtnTxt: { color: "#25D366", fontWeight: "700", fontSize: 13 },
  collectedBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#10B98118", marginTop: 4 },
  collectedTxt: { color: "#10B981", fontSize: 12, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 480 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  sheetBody: { padding: 20 },
  summaryBox: { padding: 14, gap: 8, marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13, fontWeight: "500" },
  totalRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)", marginTop: 4 },
  totalLabel: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  totalValue: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, marginBottom: 10, marginTop: 8 },
  methodRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  methodBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderWidth: 2 },
  methodTxt: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  confirmBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  itemName: { fontSize: 14, fontWeight: "500" },
  itemNotes: { fontSize: 12, fontStyle: "italic" },
  itemQty: { fontSize: 13 },
  itemTotal: { fontSize: 14, fontWeight: "600", minWidth: 64, textAlign: "right" },
  confirmRow: { backgroundColor: "#F59E0B18", padding: 10, marginTop: 6, gap: 8 },
  confirmTxt: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  confirmBtns: { flexDirection: "row", gap: 8 },
  confirmNo: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderWidth: 1 },
  confirmNoTxt: { fontSize: 13, fontWeight: "600" },
  confirmYes: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, backgroundColor: "#F59E0B" },
  confirmYesTxt: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
