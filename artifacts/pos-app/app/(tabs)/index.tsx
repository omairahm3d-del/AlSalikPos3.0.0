import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { CartItemRow } from "@/components/CartItemRow";
import { CategoryFilter } from "@/components/CategoryFilter";
import { EmptyState } from "@/components/EmptyState";
import { ProductCard } from "@/components/ProductCard";
import { CustomerSelectModal } from "@/components/CustomerSelectModal";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useCart } from "@/context/CartContext";
import { useDatabase } from "@/context/DatabaseCore";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { generateKitchenTicketHTML } from "@/lib/kitchenTicketTemplate";
import type { Customer, PosTable, Product, Sale, SplitPaymentEntry, TaxGroup } from "@/types";
import { CATEGORIES, VAT_RATE, formatCurrency } from "@/types";

type PaymentMethod = "Card" | "Cash" | "Credit" | "Split";

const PRODUCT_ITEM_HEIGHT = 148;

export default function POSScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  const { loadProducts, saveSale, loadTables, loadBusinessSettings, loadTaxGroups } = useDatabase();
  const { currentStaff } = useStaff();
  const {
    items: cartItems,
    itemCount,
    subtotal,
    itemDiscountTotal,
    effectiveSubtotal,
    vatAmount,
    total,
    quantityMap,
    addItem,
    removeItem,
    updateQuantity,
    setItemDiscount,
    clearCart,
  } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [taxGroupMap, setTaxGroupMap] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Card");
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);

  const [orderDiscountType, setOrderDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [orderDiscountValue, setOrderDiscountValue] = useState("");
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  const [splitEntries, setSplitEntries] = useState<SplitPaymentEntry[]>([]);
  const [splitMethod, setSplitMethod] = useState<"Card" | "Cash" | "Credit">("Card");
  const [splitAmount, setSplitAmount] = useState("");

  const [showItemDiscount, setShowItemDiscount] = useState<string | null>(null);
  const [itemDiscType, setItemDiscType] = useState<"percentage" | "fixed">("percentage");
  const [itemDiscValue, setItemDiscValue] = useState("");

  const [loyaltyRedeemPts, setLoyaltyRedeemPts] = useState("");
  const [loyaltyRate, setLoyaltyRate] = useState(0.01);

  const orderDiscAmt = useMemo(() => {
    const val = parseFloat(orderDiscountValue);
    if (isNaN(val) || val <= 0) return 0;
    if (orderDiscountType === "percentage") return Math.min(effectiveSubtotal, effectiveSubtotal * val / 100);
    return Math.min(effectiveSubtotal, val);
  }, [orderDiscountType, orderDiscountValue, effectiveSubtotal]);

  const loyaltyRedeemAmount = useMemo(() => {
    const pts = parseInt(loyaltyRedeemPts, 10);
    if (isNaN(pts) || pts <= 0 || !selectedCustomer) return 0;
    const maxPts = Math.min(pts, selectedCustomer.loyaltyPoints || 0);
    return maxPts * loyaltyRate;
  }, [loyaltyRedeemPts, selectedCustomer, loyaltyRate]);

  const loyaltyRedeemPtsActual = useMemo(() => {
    const pts = parseInt(loyaltyRedeemPts, 10);
    if (isNaN(pts) || pts <= 0 || !selectedCustomer) return 0;
    return Math.min(pts, selectedCustomer.loyaltyPoints || 0);
  }, [loyaltyRedeemPts, selectedCustomer]);

  const finalSubtotal = Math.max(0, effectiveSubtotal - orderDiscAmt - loyaltyRedeemAmount);
  const finalVat = useMemo(() => {
    const discountRatio = effectiveSubtotal > 0 ? finalSubtotal / effectiveSubtotal : 0;
    let vat = 0;
    for (const item of cartItems) {
      const lineAfterDisc = item.product.price * item.quantity - (item.discountAmount ?? 0);
      const rate = item.taxRate ?? VAT_RATE;
      vat += Math.max(0, lineAfterDisc) * rate * discountRatio;
    }
    return vat;
  }, [cartItems, effectiveSubtotal, finalSubtotal]);
  const finalTotal = finalSubtotal + finalVat;
  const splitRemaining = finalTotal - splitEntries.reduce((s, e) => s + e.amount, 0);

  const fetchData = useCallback(async () => {
    const [prods, tbls, biz, tgs] = await Promise.all([loadProducts(), loadTables(), loadBusinessSettings(), loadTaxGroups()]);
    setProducts(prods);
    setTables(tbls);
    setLoyaltyRate(biz.loyaltyRedemptionRate || 0.01);
    const map: Record<string, number> = {};
    tgs.forEach((g: TaxGroup) => { map[g.id] = g.rate; });
    setTaxGroupMap(map);
    setLoading(false);
  }, [loadProducts, loadTables, loadBusinessSettings, loadTaxGroups]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory !== "All") list = list.filter((p) => p.category === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q));
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  const numColumns = width >= 1200 ? 5 : width >= 960 ? 4 : width >= 768 ? 3 : 2;
  const availableTables = useMemo(
    () => tables.filter((t) => t.status === "available" || t.status === "reserved"),
    [tables]
  );

  const productById = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const p of products) map[p.id] = p;
    return map;
  }, [products]);

  const handleAddById = useCallback((productId: string) => {
    const product = productById[productId];
    if (!product) return;
    if (product.stockQuantity <= 0) {
      Alert.alert("Out of Stock", `${product.name} is out of stock.`);
      return;
    }
    const rate = product.taxGroupId ? (taxGroupMap[product.taxGroupId] ?? VAT_RATE) : VAT_RATE;
    addItem(product, rate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [productById, taxGroupMap, addItem]);

  const handleAddItem = useCallback((product: Product) => {
    handleAddById(product.id);
  }, [handleAddById]);

  const handleChargeSale = useCallback(async () => {
    if (cartItems.length === 0) return;
    if (paymentMethod === "Credit" && !selectedCustomer) {
      setShowCustomerSelect(true);
      return;
    }
    if (paymentMethod === "Split") {
      if (Math.abs(splitRemaining) > 0.01) {
        Alert.alert("Split Incomplete", `Remaining: ${formatCurrency(splitRemaining)}`);
        return;
      }
    }

    try {
      const totalDiscAmt = orderDiscAmt + loyaltyRedeemAmount;
      const sale = await saveSale(cartItems, {
        paymentMethod,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        staffId: currentStaff?.id,
        staffName: currentStaff?.name,
        tableId: selectedTable?.id,
        tableName: selectedTable?.name,
        discountType: totalDiscAmt > 0 ? orderDiscountType : undefined,
        discountValue: totalDiscAmt > 0 ? parseFloat(orderDiscountValue || "0") : undefined,
        discountAmount: totalDiscAmt,
        loyaltyPointsRedeemed: loyaltyRedeemPtsActual > 0 ? loyaltyRedeemPtsActual : undefined,
        splitPayments: paymentMethod === "Split" ? splitEntries : undefined,
      });

      if (selectedTable) {
        try {
          const ticketHtml = generateKitchenTicketHTML(
            cartItems, sale.invoiceNumber, selectedTable.name, currentStaff?.name
          );
          if (Platform.OS === "web") {
            const w = window.open("", "_blank", "width=400,height=600");
            if (w) { w.document.write(ticketHtml); w.document.close(); w.print(); }
          } else {
            await Print.printAsync({ html: ticketHtml });
          }
        } catch (printErr: any) {
          Alert.alert("Kitchen Ticket", "Could not print kitchen ticket: " + (printErr?.message || "Unknown error"));
        }
      }

      clearCart();
      setShowPayment(false);
      setShowCart(false);
      setSelectedCustomer(null);
      setSelectedTable(null);
      setOrderDiscountValue("");
      setShowDiscountInput(false);
      setSplitEntries([]);
      setLoyaltyRedeemPts("");
      setReceiptSale(sale);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save sale");
    }
  }, [cartItems, paymentMethod, selectedCustomer, splitRemaining, orderDiscAmt, loyaltyRedeemAmount,
    saveSale, currentStaff, selectedTable, orderDiscountType, orderDiscountValue,
    loyaltyRedeemPtsActual, splitEntries, clearCart, fetchData]);

  const handleAddSplit = useCallback(() => {
    const amt = parseFloat(splitAmount);
    if (isNaN(amt) || amt <= 0) return;
    const capped = Math.min(amt, splitRemaining);
    if (capped <= 0) return;
    setSplitEntries((prev) => [...prev, { method: splitMethod, amount: capped }]);
    setSplitAmount("");
  }, [splitAmount, splitRemaining, splitMethod]);

  const handleApplyItemDiscount = useCallback((productId: string) => {
    const val = parseFloat(itemDiscValue);
    if (isNaN(val) || val <= 0) {
      setItemDiscount(productId, undefined, undefined);
    } else {
      setItemDiscount(productId, itemDiscType, val);
    }
    setShowItemDiscount(null);
    setItemDiscValue("");
  }, [itemDiscValue, itemDiscType, setItemDiscount]);

  const handleScanFound = useCallback((product: Product) => {
    handleAddItem(product);
    setShowScanner(false);
  }, [handleAddItem]);

  const handleScanNotFound = useCallback((barcode: string) => {
    setShowScanner(false);
    Alert.alert("Product not found", `No product linked to barcode: ${barcode}`);
  }, []);

  const openPayment = useCallback(() => {
    setPaymentMethod("Card");
    setSelectedCustomer(null);
    setOrderDiscountValue("");
    setShowDiscountInput(false);
    setSplitEntries([]);
    setLoyaltyRedeemPts("");
    setShowPayment(true);
  }, []);

  const openScanner = useCallback(() => setShowScanner(true), []);
  const closeCart = useCallback(() => setShowCart(false), []);
  const openCart = useCallback(() => setShowCart(true), []);
  const closePayment = useCallback(() => setShowPayment(false), []);
  const closeReceipt = useCallback(() => setReceiptSale(null), []);
  const clearSearch = useCallback(() => setSearchQuery(""), []);
  const toggleDiscount = useCallback(() => setShowDiscountInput((p) => !p), []);

  const renderProductItem = useCallback(({ item }: { item: Product }) => (
    <ProductCard product={item} onAdd={handleAddById} quantity={quantityMap[item.id] ?? 0} />
  ), [handleAddById, quantityMap]);

  const productKeyExtractor = useCallback((item: Product) => item.id, []);

  const renderCartItem = useCallback(({ item }: { item: import("@/types").CartItem }) => (
    <View>
      <CartItemRow item={item} onUpdateQuantity={updateQuantity} onRemoveItem={removeItem} />
      {item.discountAmount && item.discountAmount > 0 ? (
        <View style={styles.itemDiscRow}>
          <Text style={{ color: colors.success, fontSize: 11 }}>
            Discount: -{formatCurrency(item.discountAmount)}
          </Text>
          <TouchableOpacity onPress={() => setItemDiscount(item.product.id, undefined, undefined)}>
            <Feather name="x" size={12} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      ) : null}
      <TouchableOpacity
        onPress={() => {
          setShowItemDiscount(item.product.id);
          setItemDiscType(item.discountType || "percentage");
          setItemDiscValue(item.discountValue ? String(item.discountValue) : "");
        }}
        style={styles.itemDiscBtn}
      >
        <Feather name="percent" size={10} color={colors.primary} />
      </TouchableOpacity>
    </View>
  ), [colors, setItemDiscount, updateQuantity, removeItem]);

  const cartKeyExtractor = useCallback((item: import("@/types").CartItem) => item.product.id, []);

  const SearchBar = useMemo(() => (
    <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
      <Feather name="search" size={16} color={colors.mutedForeground} />
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search products..."
        placeholderTextColor={colors.mutedForeground}
        style={[styles.searchInput, { color: colors.foreground }]}
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}
    </View>
  ), [colors, searchQuery, clearSearch]);

  const ScanButton = useMemo(() => (
    <TouchableOpacity
      onPress={openScanner}
      style={[styles.scanBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
    >
      <Feather name="maximize" size={18} color={colors.primary} />
    </TouchableOpacity>
  ), [colors, openScanner]);

  const CartContent = (
    <View style={styles.cartInner}>
      <View style={[styles.cartHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.cartTitle, { color: colors.foreground }]}>Order</Text>
        <View style={styles.cartHeaderRight}>
          {currentStaff && (
            <Text style={[styles.staffLabel, { color: colors.mutedForeground }]}>
              {currentStaff.name}
            </Text>
          )}
          {cartItems.length > 0 && (
            <TouchableOpacity onPress={clearCart}>
              <Text style={{ color: colors.destructive, fontSize: 13 }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {cartItems.length === 0 ? (
        <EmptyState icon="shopping-cart" title="Cart is empty" subtitle="Tap products or scan a barcode" />
      ) : (
        <FlatList
          data={cartItems}
          renderItem={renderCartItem}
          keyExtractor={cartKeyExtractor}
          style={styles.cartList}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== "web"}
        />
      )}

      {cartItems.length > 0 && (
        <View style={[styles.cartFooter, { borderTopColor: colors.border }]}>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatCurrency(subtotal)}</Text>
          </View>
          {itemDiscountTotal > 0 && (
            <View style={styles.totalsRow}>
              <Text style={[styles.totalLabel, { color: colors.success }]}>Item Discounts</Text>
              <Text style={[styles.totalValue, { color: colors.success }]}>-{formatCurrency(itemDiscountTotal)}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>VAT</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatCurrency(vatAmount)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: colors.foreground }]}>{formatCurrency(total)}</Text>
          </View>
          <TouchableOpacity
            onPress={openPayment}
            style={[styles.chargeBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
          >
            <Feather name="credit-card" size={18} color="#fff" />
            <Text style={styles.chargeBtnText}>Charge {formatCurrency(total)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? insets.top + 8 : 0 }]}>
      {isTablet ? (
        <View style={styles.splitRow}>
          <View style={styles.catalogPane}>
            <View style={[styles.catalogHeader, { borderBottomColor: colors.border }]}>
              <CategoryFilter categories={CATEGORIES} selected={selectedCategory} onSelect={setSelectedCategory} />
              {ScanButton}
            </View>
            {SearchBar}
            {loading ? (
              <ActivityIndicator style={styles.loader} color={colors.primary} />
            ) : (
              <FlatList
                data={filteredProducts}
                renderItem={renderProductItem}
                keyExtractor={productKeyExtractor}
                numColumns={numColumns}
                key={String(numColumns)}
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews={Platform.OS !== "web"}
                getItemLayout={(_data, index) => ({
                  length: PRODUCT_ITEM_HEIGHT,
                  offset: PRODUCT_ITEM_HEIGHT * Math.floor(index / numColumns),
                  index,
                })}
              />
            )}
          </View>
          <View style={[styles.cartPane, { borderLeftColor: colors.border }]}>{CartContent}</View>
        </View>
      ) : (
        <>
          <View style={styles.mobileContent}>
            <View style={[styles.catalogHeader, { borderBottomColor: colors.border }]}>
              <CategoryFilter categories={CATEGORIES} selected={selectedCategory} onSelect={setSelectedCategory} />
              {ScanButton}
            </View>
            {SearchBar}
            {loading ? (
              <ActivityIndicator style={styles.loader} color={colors.primary} />
            ) : (
              <FlatList
                data={filteredProducts}
                renderItem={renderProductItem}
                keyExtractor={productKeyExtractor}
                numColumns={2}
                key="2"
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
                maxToRenderPerBatch={6}
                windowSize={5}
                removeClippedSubviews={Platform.OS !== "web"}
              />
            )}
          </View>
          {itemCount > 0 && (
            <TouchableOpacity
              onPress={openCart}
              style={[styles.cartBar, { backgroundColor: colors.success, paddingBottom: insets.bottom + 14 }]}
            >
              <View style={styles.cartBarLeft}>
                <View style={styles.cartBarBadge}><Text style={styles.cartBarBadgeText}>{itemCount}</Text></View>
                <Text style={styles.cartBarText}>View Order</Text>
              </View>
              <Text style={styles.cartBarTotal}>{formatCurrency(total)}</Text>
            </TouchableOpacity>
          )}
          <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
            <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
              <View style={[styles.modalTopBar, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Cart</Text>
                <TouchableOpacity onPress={closeCart}>
                  <Feather name="x" size={22} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              {CartContent}
            </View>
          </Modal>
        </>
      )}

      <Modal visible={showPayment} animationType="fade" transparent>
        <View style={styles.paymentOverlay}>
          <ScrollView contentContainerStyle={styles.paymentScrollContent}>
            <View style={[styles.paymentSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
              <Text style={[styles.paymentTitle, { color: colors.foreground }]}>Payment</Text>

              {availableTables.length > 0 && (
                <>
                  <Text style={[styles.paymentLabel, { color: colors.mutedForeground }]}>Table (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScrollRow}>
                    <TouchableOpacity
                      onPress={() => setSelectedTable(null)}
                      style={[styles.tableChip, { borderColor: !selectedTable ? colors.primary : colors.border, backgroundColor: !selectedTable ? colors.primary + "18" : "transparent", borderRadius: colors.radius }]}
                    >
                      <Text style={{ color: !selectedTable ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>None</Text>
                    </TouchableOpacity>
                    {availableTables.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => setSelectedTable(t)}
                        style={[styles.tableChip, { borderColor: selectedTable?.id === t.id ? colors.primary : colors.border, backgroundColor: selectedTable?.id === t.id ? colors.primary + "18" : "transparent", borderRadius: colors.radius }]}
                      >
                        <Text style={{ color: selectedTable?.id === t.id ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={[styles.paymentLabel, { color: colors.mutedForeground }]}>Payment method</Text>
              <View style={styles.paymentMethods}>
                {(["Card", "Cash", "Credit", "Split"] as PaymentMethod[]).map((m) => {
                  const active = paymentMethod === m;
                  const iconName = m === "Card" ? "credit-card" : m === "Cash" ? "dollar-sign" : m === "Credit" ? "users" : "columns";
                  const activeColor = m === "Credit" ? colors.destructive : m === "Split" ? "#F39C12" : colors.primary;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        setPaymentMethod(m);
                        if (m !== "Split") setSplitEntries([]);
                      }}
                      style={[styles.methodBtn, { borderColor: active ? activeColor : colors.border, backgroundColor: active ? activeColor + "18" : "transparent", borderRadius: colors.radius }]}
                    >
                      <Feather name={iconName} size={14} color={active ? activeColor : colors.mutedForeground} />
                      <Text style={{ color: active ? activeColor : colors.mutedForeground, fontWeight: "600", fontSize: 12, marginLeft: 4 }}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() => setShowCustomerSelect(true)}
                style={[styles.customerPickerBtn, { backgroundColor: colors.secondary, borderColor: selectedCustomer ? colors.success : colors.border, borderRadius: colors.radius }]}
              >
                {selectedCustomer ? (
                  <View style={styles.customerPickerRow}>
                    <View style={[styles.customerPickerAvatar, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{selectedCustomer.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.customerInfoCol}>
                      <Text style={[styles.customerPickerName, { color: colors.foreground }]}>{selectedCustomer.name}</Text>
                      {(selectedCustomer.loyaltyPoints ?? 0) > 0 && (
                        <Text style={styles.loyaltyPtsLabel}>{selectedCustomer.loyaltyPoints} loyalty pts</Text>
                      )}
                      {paymentMethod === "Credit" && selectedCustomer.creditBalance > 0 && (
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Balance: {formatCurrency(selectedCustomer.creditBalance)}</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => { setSelectedCustomer(null); setLoyaltyRedeemPts(""); }} style={styles.clearCustomerBtn}>
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.customerPickerRow}>
                    <Feather name="user-plus" size={16} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, marginLeft: 8 }}>
                      {paymentMethod === "Credit" ? "Select customer (required)" : "Select customer (optional, for loyalty)"}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {paymentMethod === "Split" && (
                <View style={[styles.splitBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <Text style={[styles.splitLabel, { color: colors.foreground }]}>Split Payment</Text>
                  {splitEntries.map((e, i) => (
                    <View key={i} style={styles.splitEntryRow}>
                      <Text style={{ color: colors.foreground, flex: 1 }}>{e.method}</Text>
                      <Text style={{ color: colors.foreground, fontWeight: "700" }}>{formatCurrency(e.amount)}</Text>
                      <TouchableOpacity onPress={() => setSplitEntries(splitEntries.filter((_, j) => j !== i))} style={styles.splitRemoveBtn}>
                        <Feather name="x" size={14} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {splitRemaining > 0.01 && (
                    <>
                      <Text style={[styles.splitRemainingLabel, { color: colors.mutedForeground }]}>Remaining: {formatCurrency(splitRemaining)}</Text>
                      <View style={styles.splitAddRow}>
                        <View style={styles.splitMethodsRow}>
                          {(["Card", "Cash", "Credit"] as const).map((m) => (
                            <TouchableOpacity
                              key={m}
                              onPress={() => setSplitMethod(m)}
                              style={[styles.splitMethodBtn, { borderColor: splitMethod === m ? colors.primary : colors.border, borderRadius: colors.radius }]}
                            >
                              <Text style={{ color: splitMethod === m ? colors.primary : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>{m}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={styles.splitInputRow}>
                          <TextInput
                            value={splitAmount}
                            onChangeText={setSplitAmount}
                            placeholder="Amount"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="decimal-pad"
                            style={[styles.splitInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                          />
                          <TouchableOpacity onPress={handleAddSplit} style={[styles.splitAddBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                            <Feather name="plus" size={16} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              )}

              <TouchableOpacity onPress={toggleDiscount} style={styles.discountToggle}>
                <Feather name="percent" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, marginLeft: 6 }}>
                  {showDiscountInput ? "Remove order discount" : "Add order discount"}
                </Text>
              </TouchableOpacity>

              {showDiscountInput && (
                <View style={[styles.discountBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <View style={styles.discTypeRow}>
                    {(["percentage", "fixed"] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setOrderDiscountType(t)}
                        style={[styles.discTypeBtn, { borderColor: orderDiscountType === t ? colors.primary : colors.border, borderRadius: colors.radius }]}
                      >
                        <Text style={{ color: orderDiscountType === t ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>
                          {t === "percentage" ? "%" : "AED"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    value={orderDiscountValue}
                    onChangeText={setOrderDiscountValue}
                    placeholder={orderDiscountType === "percentage" ? "e.g. 10" : "e.g. 5.00"}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    style={[styles.discInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                  />
                  {orderDiscAmt > 0 && (
                    <Text style={[styles.discAppliedLabel, { color: colors.success }]}>Discount: -{formatCurrency(orderDiscAmt)}</Text>
                  )}
                </View>
              )}

              {selectedCustomer && (selectedCustomer.loyaltyPoints ?? 0) > 0 && (
                <View style={[styles.discountBox, { backgroundColor: colors.secondary, borderRadius: colors.radius, marginBottom: 12 }]}>
                  <View style={styles.loyaltyHeader}>
                    <Feather name="award" size={14} color="#F39C12" />
                    <Text style={styles.loyaltyTitle}>
                      Loyalty Points ({selectedCustomer.loyaltyPoints} available)
                    </Text>
                  </View>
                  <Text style={[styles.loyaltyRateLabel, { color: colors.mutedForeground }]}>
                    1 point = {formatCurrency(loyaltyRate)} discount
                  </Text>
                  <TextInput
                    value={loyaltyRedeemPts}
                    onChangeText={setLoyaltyRedeemPts}
                    placeholder={`Points to redeem (max ${selectedCustomer.loyaltyPoints})`}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    style={[styles.discInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                  />
                  {loyaltyRedeemAmount > 0 && (
                    <Text style={styles.loyaltyRedeemLabel}>
                      Redeeming {loyaltyRedeemPtsActual} pts = -{formatCurrency(loyaltyRedeemAmount)}
                    </Text>
                  )}
                </View>
              )}

              <View style={[styles.summaryBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.mutedForeground }}>Subtotal</Text>
                  <Text style={{ color: colors.foreground }}>{formatCurrency(effectiveSubtotal)}</Text>
                </View>
                {orderDiscAmt > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={{ color: colors.success }}>Order Discount</Text>
                    <Text style={{ color: colors.success }}>-{formatCurrency(orderDiscAmt)}</Text>
                  </View>
                )}
                {loyaltyRedeemAmount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.loyaltyPtsLabel}>Loyalty Redemption</Text>
                    <Text style={styles.loyaltyPtsLabel}>-{formatCurrency(loyaltyRedeemAmount)}</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={{ color: colors.mutedForeground }}>VAT</Text>
                  <Text style={{ color: colors.foreground }}>{formatCurrency(finalVat)}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: 10 }]} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Total</Text>
                  <Text style={[styles.grandTotalValue, { color: colors.foreground }]}>{formatCurrency(finalTotal)}</Text>
                </View>
              </View>

              <View style={styles.paymentActions}>
                <TouchableOpacity onPress={closePayment} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleChargeSale} style={[styles.confirmBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}>
                  <Feather name="check" size={16} color="#fff" />
                  <Text style={styles.confirmBtnText}>Confirm Sale</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!showItemDiscount} animationType="fade" transparent>
        <View style={styles.paymentOverlay}>
          <View style={[styles.itemDiscSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <Text style={[styles.paymentTitle, { color: colors.foreground, fontSize: 18 }]}>Item Discount</Text>
            <View style={styles.discTypeRow}>
              {(["percentage", "fixed"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setItemDiscType(t)}
                  style={[styles.discTypeBtn, { borderColor: itemDiscType === t ? colors.primary : colors.border, borderRadius: colors.radius }]}
                >
                  <Text style={{ color: itemDiscType === t ? colors.primary : colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>
                    {t === "percentage" ? "%" : "AED"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={itemDiscValue}
              onChangeText={setItemDiscValue}
              placeholder={itemDiscType === "percentage" ? "e.g. 10" : "e.g. 5.00"}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              autoFocus
              style={[styles.discInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />
            <View style={[styles.paymentActions, { marginTop: 16 }]}>
              <TouchableOpacity onPress={() => { setShowItemDiscount(null); setItemDiscValue(""); }} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => showItemDiscount && handleApplyItemDiscount(showItemDiscount)} style={[styles.confirmBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ReceiptModal visible={!!receiptSale} sale={receiptSale} onClose={closeReceipt} />
      <CustomerSelectModal
        visible={showCustomerSelect}
        onSelect={(customer) => { setSelectedCustomer(customer); setShowCustomerSelect(false); }}
        onClose={() => setShowCustomerSelect(false)}
      />
      <BarcodeScannerModal
        visible={showScanner}
        products={products}
        onFound={handleScanFound}
        onNotFound={handleScanNotFound}
        onClose={() => setShowScanner(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splitRow: { flex: 1, flexDirection: "row" },
  catalogPane: { flex: 3 },
  catalogHeader: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingRight: 12 },
  cartPane: { width: 350, borderLeftWidth: 1 },
  mobileContent: { flex: 1 },
  grid: { padding: 10, paddingTop: 4 },
  loader: { flex: 1 },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginTop: 8, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  scanBtn: { padding: 10, marginLeft: 4 },
  cartInner: { flex: 1 },
  cartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  cartHeaderRight: { flexDirection: "row", gap: 12, alignItems: "center" },
  cartTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  staffLabel: { fontSize: 11 },
  cartList: { flex: 1 },
  cartFooter: { padding: 16, borderTopWidth: 1 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 13, fontWeight: "600" },
  divider: { height: 1, marginVertical: 8 },
  grandTotal: { marginBottom: 14 },
  grandTotalLabel: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  grandTotalValue: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chargeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  chargeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  cartBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 14 },
  cartBarLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  cartBarBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  cartBarBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cartBarText: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily: "Inter_700Bold" },
  cartBarTotal: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily: "Inter_700Bold" },
  modalRoot: { flex: 1 },
  modalTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  paymentOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center" },
  paymentScrollContent: { alignItems: "center", justifyContent: "center", flexGrow: 1, padding: 24 },
  paymentSheet: { width: "100%", maxWidth: 460, padding: 24 },
  paymentTitle: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 20 },
  paymentLabel: { fontSize: 12, marginBottom: 8, textTransform: "uppercase" },
  paymentMethods: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  methodBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderWidth: 2, minWidth: 80 },
  customerPickerBtn: { padding: 14, borderWidth: 1, marginBottom: 12 },
  customerPickerRow: { flexDirection: "row", alignItems: "center" },
  customerPickerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  customerPickerName: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  customerInfoCol: { flex: 1 },
  clearCustomerBtn: { padding: 4 },
  loyaltyPtsLabel: { color: "#F39C12", fontSize: 11 },
  tableScrollRow: { marginBottom: 12 },
  tableChip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, marginRight: 8 },
  summaryBox: { padding: 16, marginBottom: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  paymentActions: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  confirmBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: 8 },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  discountToggle: { flexDirection: "row", alignItems: "center", marginBottom: 12, paddingVertical: 4 },
  discountBox: { padding: 14, marginBottom: 12 },
  discTypeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  discTypeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  discInput: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1 },
  discAppliedLabel: { fontSize: 12, marginTop: 6 },
  loyaltyHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  loyaltyTitle: { color: "#F39C12", fontSize: 13, fontWeight: "600", marginLeft: 6 },
  loyaltyRateLabel: { fontSize: 11, marginBottom: 8 },
  loyaltyRedeemLabel: { color: "#F39C12", fontSize: 12, marginTop: 6 },
  splitBox: { padding: 14, marginBottom: 12 },
  splitLabel: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 8 },
  splitEntryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  splitRemoveBtn: { marginLeft: 8 },
  splitRemainingLabel: { fontSize: 12, marginTop: 8 },
  splitMethodsRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  splitMethodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  splitAddRow: { marginTop: 8 },
  splitInputRow: { flexDirection: "row", gap: 8 },
  splitInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1 },
  splitAddBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  itemDiscRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 4 },
  itemDiscBtn: { position: "absolute", right: 8, top: 2, padding: 4 },
  itemDiscSheet: { width: "100%", maxWidth: 360, padding: 24 },
});
