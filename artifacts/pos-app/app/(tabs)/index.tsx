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
import { CloseRegisterModal } from "@/components/CloseRegisterModal";
import { EmptyState } from "@/components/EmptyState";
import { ProductCard } from "@/components/ProductCard";
import { CustomerSelectModal } from "@/components/CustomerSelectModal";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useCart } from "@/context/CartContext";
import { useDatabase } from "@/context/DatabaseCore";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { generateKitchenTicketHTML, getUniqueStations } from "@/lib/kitchenTicketTemplate";
import { generateBillHTML } from "@/lib/billTemplate";
import type { BusinessSettings, Category, Customer, KOTSettings, OrderType, PosTable, Product, Rider, Sale, SplitPaymentEntry, TaxGroup } from "@/types";
import { DEFAULT_KOT_SETTINGS, VAT_RATE, formatCurrency } from "@/types";

type PaymentMethod = "Card" | "Cash" | "Credit" | "Split";

const PRODUCT_ITEM_HEIGHT = 148;

const ORDER_TYPES: { key: OrderType; label: string; icon: string }[] = [
  { key: "dine-in", label: "Dine-in", icon: "coffee" },
  { key: "takeaway", label: "Takeaway", icon: "shopping-bag" },
  { key: "delivery", label: "Delivery", icon: "truck" },
];

export default function POSScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  const { loadProducts, saveSale, loadTables, loadBusinessSettings, loadTaxGroups, loadCategories, saveHeldOrder, loadRiders, loadSaleByInvoiceNumber, loadCustomers, recordCreditPayment } = useDatabase();
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
    heldOrderInfo,
    addItem,
    removeItem,
    updateQuantity,
    setItemDiscount,
    restoreCart,
    clearCart,
  } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [taxGroupMap, setTaxGroupMap] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dynamicCategories, setDynamicCategories] = useState<string[]>(["All"]);
  const [kotSettings, setKotSettings] = useState<KOTSettings>(DEFAULT_KOT_SETTINGS);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showCloseRegister, setShowCloseRegister] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Card");
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("dine-in");
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [showHoldTablePicker, setShowHoldTablePicker] = useState(false);
  const [creditPaySale, setCreditPaySale] = useState<Sale | null>(null);
  const [creditPayCustomer, setCreditPayCustomer] = useState<Customer | null>(null);
  const [creditPayAmount, setCreditPayAmount] = useState("");
  const [creditPayNote, setCreditPayNote] = useState("");

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
    const [prods, tbls, biz, tgs, cats, rdrs] = await Promise.all([loadProducts(), loadTables(), loadBusinessSettings(), loadTaxGroups(), loadCategories(), loadRiders()]);
    setProducts(prods);
    setTables(tbls);
    setRiders(rdrs.filter((r: Rider) => r.active));
    setLoyaltyRate(biz.loyaltyRedemptionRate || 0.01);
    setKotSettings(biz.kotSettings ?? DEFAULT_KOT_SETTINGS);
    setBusinessSettings(biz);
    const map: Record<string, number> = {};
    tgs.forEach((g: TaxGroup) => { map[g.id] = g.rate; });
    setTaxGroupMap(map);
    const catNames = cats.length > 0 ? ["All", ...cats.map((c: Category) => c.name)] : ["All"];
    setDynamicCategories(catNames);
    setLoading(false);
  }, [loadProducts, loadTables, loadBusinessSettings, loadTaxGroups, loadCategories, loadRiders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (heldOrderInfo?.orderType) {
      setOrderType(heldOrderInfo.orderType);
    }
  }, [heldOrderInfo]);

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

  const handleHoldOrder = useCallback(async (table: PosTable) => {
    if (cartItems.length === 0) return;
    try {
      await saveHeldOrder({
        id: heldOrderInfo?.id,
        tableId: table.id,
        tableName: table.name,
        orderType,
        staffId: currentStaff?.id,
        staffName: currentStaff?.name,
        items: cartItems.map((ci) => ({
          id: "",
          heldOrderId: "",
          productId: ci.product.id,
          productName: ci.product.name,
          productPrice: ci.product.price,
          quantity: ci.quantity,
          colorHex: ci.product.colorHex,
          category: ci.product.category,
          taxRate: ci.taxRate,
          discountType: ci.discountType,
          discountValue: ci.discountValue,
          discountAmount: ci.discountAmount,
          imageUri: ci.product.imageUri,
        })),
      });
      clearCart();
      setShowHoldTablePicker(false);
      setShowCart(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Order Held", `Order held on ${table.name}`);
      await fetchData();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to hold order");
    }
  }, [cartItems, heldOrderInfo, orderType, currentStaff, saveHeldOrder, clearCart, fetchData]);

  const handlePrintBill = useCallback(async () => {
    if (cartItems.length === 0) return;
    try {
      const tbl = heldOrderInfo ? heldOrderInfo.tableName : selectedTable?.name;
      const html = generateBillHTML(cartItems, {
        businessSettings,
        orderType,
        tableName: tbl,
        staffName: currentStaff?.name,
        subtotal: effectiveSubtotal,
        vatAmount,
        total,
        itemDiscountTotal,
      });
      if (Platform.OS === "web") {
        const w = window.open("", "_blank", "width=400,height=600");
        if (w) { w.document.write(html); w.document.close(); w.print(); }
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert("Print Error", e.message || "Could not print bill");
    }
  }, [cartItems, businessSettings, orderType, heldOrderInfo, selectedTable, currentStaff, effectiveSubtotal, vatAmount, total, itemDiscountTotal]);

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

    const chargeTableId = heldOrderInfo?.tableId ?? selectedTable?.id;
    const chargeTableName = heldOrderInfo?.tableName ?? selectedTable?.name;

    try {
      const totalDiscAmt = orderDiscAmt + loyaltyRedeemAmount;
      const sale = await saveSale(cartItems, {
        paymentMethod,
        orderType,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        staffId: currentStaff?.id,
        staffName: currentStaff?.name,
        tableId: chargeTableId,
        tableName: chargeTableName,
        riderId: selectedRider?.id,
        riderName: selectedRider?.name,
        discountType: totalDiscAmt > 0 ? orderDiscountType : undefined,
        discountValue: totalDiscAmt > 0 ? parseFloat(orderDiscountValue || "0") : undefined,
        discountAmount: totalDiscAmt,
        loyaltyPointsRedeemed: loyaltyRedeemPtsActual > 0 ? loyaltyRedeemPtsActual : undefined,
        splitPayments: paymentMethod === "Split" ? splitEntries : undefined,
      });

      const kotTableName = chargeTableName;
      const shouldPrintKOT = kotSettings.enabled && kotTableName;
      if (shouldPrintKOT) {
        try {
          const stations = getUniqueStations(cartItems, kotSettings);
          if (stations.length > 0) {
            for (const station of stations) {
              const ticketHtml = generateKitchenTicketHTML(
                cartItems, sale.invoiceNumber, kotTableName, currentStaff?.name, kotSettings, station
              );
              if (!ticketHtml) continue;
              if (Platform.OS === "web") {
                const w = window.open("", "_blank", "width=400,height=600");
                if (w) { w.document.write(ticketHtml); w.document.close(); w.print(); }
              } else {
                await Print.printAsync({ html: ticketHtml });
              }
            }
          } else {
            const ticketHtml = generateKitchenTicketHTML(
              cartItems, sale.invoiceNumber, kotTableName, currentStaff?.name, kotSettings
            );
            if (ticketHtml) {
              if (Platform.OS === "web") {
                const w = window.open("", "_blank", "width=400,height=600");
                if (w) { w.document.write(ticketHtml); w.document.close(); w.print(); }
              } else {
                await Print.printAsync({ html: ticketHtml });
              }
            }
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
      setSelectedRider(null);
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
    saveSale, currentStaff, selectedTable, heldOrderInfo, selectedRider, orderType, orderDiscountType, orderDiscountValue,
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

  const handleScanNotFound = useCallback(async (barcode: string) => {
    setShowScanner(false);
    if (barcode.startsWith("INV-")) {
      try {
        const sale = await loadSaleByInvoiceNumber(barcode);
        if (sale && sale.paymentMethod === "Credit" && sale.customerId) {
          const customers = await loadCustomers();
          const customer = customers.find((c) => c.id === sale.customerId);
          if (customer && customer.creditBalance > 0) {
            setCreditPaySale(sale);
            setCreditPayCustomer(customer);
            setCreditPayAmount(String(Math.min(sale.total, customer.creditBalance).toFixed(2)));
            setCreditPayNote(`Payment for ${barcode}`);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            return;
          } else if (customer && customer.creditBalance <= 0) {
            Alert.alert("No Balance", `${customer.name} has no outstanding credit balance.`);
            return;
          }
        }
        if (sale) {
          Alert.alert("Not a Credit Sale", `Invoice ${barcode} was paid by ${sale.paymentMethod}, not Credit.`);
          return;
        }
      } catch {}
    }
    Alert.alert("Not Found", `No product or invoice matched: ${barcode}`);
  }, [loadSaleByInvoiceNumber, loadCustomers]);

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

  const handleCreditPayFromScan = useCallback(async () => {
    if (!creditPayCustomer || !creditPaySale) return;
    const amt = parseFloat(creditPayAmount);
    if (isNaN(amt) || amt <= 0) { Alert.alert("Invalid", "Enter a valid payment amount."); return; }
    if (amt > creditPayCustomer.creditBalance) { Alert.alert("Exceeds Balance", `Payment cannot exceed ${formatCurrency(creditPayCustomer.creditBalance)}.`); return; }
    try {
      await recordCreditPayment(creditPayCustomer.id, amt, creditPayNote.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Payment Recorded", `${formatCurrency(amt)} collected from ${creditPayCustomer.name}.`);
      setCreditPaySale(null);
      setCreditPayCustomer(null);
      setCreditPayAmount("");
      setCreditPayNote("");
    } catch (e: any) {
      Alert.alert("Error", "Failed to record payment.");
    }
  }, [creditPayCustomer, creditPaySale, creditPayAmount, creditPayNote, recordCreditPayment]);

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

  const EndOfDayButton = useMemo(() => (
    <TouchableOpacity
      onPress={() => setShowCloseRegister(true)}
      style={[styles.endOfDayBtn, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "40", borderRadius: colors.radius }]}
    >
      <Feather name="moon" size={15} color={colors.destructive} />
      <Text style={[styles.endOfDayText, { color: colors.destructive }]}>End of Day</Text>
    </TouchableOpacity>
  ), [colors]);

  const CartContent = (
    <View style={styles.cartInner}>
      <View style={[styles.cartHeader, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.cartHeaderRow}>
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
          {heldOrderInfo && (
            <View style={[styles.heldBadge, { backgroundColor: "#F39C12" + "20" }]}>
              <Feather name="clock" size={11} color="#F39C12" />
              <Text style={{ color: "#F39C12", fontSize: 11, fontWeight: "600", marginLeft: 4 }}>
                Held: {heldOrderInfo.tableName}
              </Text>
            </View>
          )}
          <View style={styles.orderTypeRow}>
            {ORDER_TYPES.map((ot) => {
              const active = orderType === ot.key;
              return (
                <TouchableOpacity
                  key={ot.key}
                  onPress={() => { if (!heldOrderInfo) setOrderType(ot.key); }}
                  style={[styles.orderTypeChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : "transparent", borderRadius: colors.radius, opacity: heldOrderInfo && !active ? 0.4 : 1 }]}
                >
                  <Feather name={ot.icon as any} size={12} color={active ? colors.primary : colors.mutedForeground} />
                  <Text style={{ color: active ? colors.primary : colors.mutedForeground, fontSize: 11, fontWeight: "600", marginLeft: 4 }}>{ot.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
          <View style={styles.cartBtnRow}>
            <TouchableOpacity
              onPress={handlePrintBill}
              style={[styles.printBillBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <Feather name="printer" size={16} color={colors.primary} />
            </TouchableOpacity>
            {orderType === "dine-in" && (
              <TouchableOpacity
                onPress={() => {
                  if (heldOrderInfo) {
                    const tbl = tables.find((t) => t.id === heldOrderInfo.tableId);
                    if (tbl) handleHoldOrder(tbl);
                  } else {
                    setShowHoldTablePicker(true);
                  }
                }}
                style={[styles.holdBtn, { backgroundColor: "#F39C12", borderRadius: colors.radius }]}
              >
                <Feather name="pause" size={16} color="#fff" />
                <Text style={styles.holdBtnText}>Hold</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={openPayment}
              style={[styles.chargeBtn, { backgroundColor: colors.success, borderRadius: colors.radius, flex: 1 }]}
            >
              <Feather name="credit-card" size={18} color="#fff" />
              <Text style={styles.chargeBtnText}>Charge {formatCurrency(total)}</Text>
            </TouchableOpacity>
          </View>
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
              <CategoryFilter categories={dynamicCategories} selected={selectedCategory} onSelect={setSelectedCategory} />
              {EndOfDayButton}
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
              <CategoryFilter categories={dynamicCategories} selected={selectedCategory} onSelect={setSelectedCategory} />
              {EndOfDayButton}
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

              {heldOrderInfo && (
                <View style={[styles.heldBadge, { backgroundColor: "#F39C12" + "20", marginBottom: 12 }]}>
                  <Feather name="layout" size={12} color="#F39C12" />
                  <Text style={{ color: "#F39C12", fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
                    {heldOrderInfo.tableName} · {orderType}
                  </Text>
                </View>
              )}

              {!heldOrderInfo && orderType === "dine-in" && availableTables.length > 0 && (
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

              {orderType === "delivery" && riders.length > 0 && (
                <>
                  <Text style={[styles.paymentLabel, { color: colors.mutedForeground }]}>Delivery Rider</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScrollRow}>
                    <TouchableOpacity
                      onPress={() => setSelectedRider(null)}
                      style={[styles.tableChip, { borderColor: !selectedRider ? colors.primary : colors.border, backgroundColor: !selectedRider ? colors.primary + "18" : "transparent", borderRadius: colors.radius }]}
                    >
                      <Text style={{ color: !selectedRider ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>None</Text>
                    </TouchableOpacity>
                    {riders.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        onPress={() => setSelectedRider(r)}
                        style={[styles.tableChip, { borderColor: selectedRider?.id === r.id ? colors.primary : colors.border, backgroundColor: selectedRider?.id === r.id ? colors.primary + "18" : "transparent", borderRadius: colors.radius }]}
                      >
                        <Text style={{ color: selectedRider?.id === r.id ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>{r.name}</Text>
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

      <Modal visible={showHoldTablePicker} animationType="fade" transparent>
        <View style={styles.paymentOverlay}>
          <View style={[styles.itemDiscSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <Text style={[styles.paymentTitle, { color: colors.foreground, fontSize: 18 }]}>Select Table to Hold</Text>
            {availableTables.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", marginBottom: 16 }}>No available tables</Text>
            ) : (
              <View style={styles.holdTableGrid}>
                {availableTables.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => handleHoldOrder(t)}
                    style={[styles.holdTableCard, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}
                  >
                    <Feather name="layout" size={20} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", marginTop: 4 }}>{t.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{t.capacity} seats</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity onPress={() => setShowHoldTablePicker(false)} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius, marginTop: 8 }]}>
              <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ReceiptModal visible={!!receiptSale} sale={receiptSale} onClose={closeReceipt} />
      <CloseRegisterModal
        visible={showCloseRegister}
        onClose={() => setShowCloseRegister(false)}
      />
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

      <Modal visible={!!creditPaySale} animationType="fade" transparent>
        <View style={styles.paymentOverlay}>
          <View style={[styles.itemDiscSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2, maxWidth: 400 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <Feather name="credit-card" size={20} color={colors.primary} />
              <Text style={[styles.paymentTitle, { color: colors.foreground, fontSize: 18, marginLeft: 8, marginBottom: 0 }]}>Collect Credit Payment</Text>
            </View>
            <View style={[styles.riderCard, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius, marginBottom: 12, padding: 12 }]}>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>{creditPayCustomer?.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>Invoice: {creditPaySale?.invoiceNumber}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>Sale Total: {formatCurrency(creditPaySale?.total ?? 0)}</Text>
              <Text style={{ color: "#E74C3C", fontSize: 13, fontWeight: "600", marginTop: 4 }}>Outstanding: {formatCurrency(creditPayCustomer?.creditBalance ?? 0)}</Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600", marginBottom: 4 }}>Payment Amount</Text>
            <TextInput
              value={creditPayAmount}
              onChangeText={setCreditPayAmount}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              style={[styles.searchInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 8 }]}
            />
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600", marginBottom: 4 }}>Note</Text>
            <TextInput
              value={creditPayNote}
              onChangeText={setCreditPayNote}
              placeholder="e.g. Cash payment"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, marginBottom: 12 }]}
            />
            <TouchableOpacity
              onPress={handleCreditPayFromScan}
              style={[styles.chargeBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
            >
              <Feather name="check" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 6 }}>Collect Payment</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setCreditPaySale(null); setCreditPayCustomer(null); setCreditPayAmount(""); setCreditPayNote(""); }}
              style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius, marginTop: 8 }]}
            >
              <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  endOfDayBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, marginLeft: 4, gap: 5 },
  endOfDayText: { fontSize: 12, fontWeight: "700" },
  cartInner: { flex: 1 },
  cartHeader: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  cartHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cartHeaderRight: { flexDirection: "row", gap: 12, alignItems: "center" },
  cartTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  heldBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 6, alignSelf: "flex-start" },
  orderTypeRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  orderTypeChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
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
  cartBtnRow: { flexDirection: "row", gap: 8 },
  printBillBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  holdBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  holdBtnText: { color: "#fff", fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  holdTableGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  holdTableCard: { width: "30%", padding: 12, borderWidth: 1, alignItems: "center", minWidth: 80 },
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
