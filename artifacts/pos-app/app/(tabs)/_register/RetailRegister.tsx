/**
 * RetailRegister — fully isolated retail-mode POS register screen.
 * No tables, no hold orders, no KOT printing.
 * No saloon packages / stylists / appointments.
 * No laundry tickets / care instructions.
 * Safe to modify without any risk of regressing standard/saloon/laundry modes.
 *
 * Retail-specific behaviour:
 * - Always "sale" order type (no order-type chips shown)
 * - Product modifiers supported (same as standard)
 * - No table or rider selection in payment
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { CartItemRow } from "@/components/CartItemRow";
import { CategoryFilter } from "@/components/CategoryFilter";
import { CloseRegisterModal } from "@/components/CloseRegisterModal";
import { OpenRegisterModal } from "@/components/OpenRegisterModal";
import { CreditCollectionModal } from "@/components/CreditCollectionModal";
import { EmptyState } from "@/components/EmptyState";
import { ProductCard } from "@/components/ProductCard";
import { CustomerSelectModal } from "@/components/CustomerSelectModal";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useCart } from "@/context/CartContext";
import { useDatabase } from "@/context/DatabaseCore";
import { useLicense } from "@/context/LicenseContext";
import { useStaff } from "@/context/StaffContext";
import { activityResetFn } from "@/lib/activityReset";
import { useColors } from "@/hooks/useColors";
import { generateBillHTML } from "@/lib/billTemplate";
import type {
  BusinessSettings,
  Category,
  Customer,
  ModifierGroup,
  Product,
  Sale,
  SaleItem,
  SplitPaymentEntry,
  TaxGroup,
} from "@/types";
import { VAT_RATE, formatCurrency } from "@/types";

type PaymentMethod = "Card" | "Cash" | "Credit" | "Split";

const PRODUCT_ITEM_HEIGHT = 148;

export function RetailRegister() {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;
  const isLandscape = width > height;
  const phoneColumns = isLandscape ? 3 : 2;
  const cartPaneWidth = Math.max(260, Math.min(Math.floor(width * 0.36), 380));

  const {
    loadProducts, saveSale, loadBusinessSettings, loadTaxGroups, loadCategories,
    loadSaleByInvoiceNumber, loadCustomers, recordCreditPayment, loadStaff,
    loadAllModifierGroups,
  } = useDatabase();
  const { currentStaff } = useStaff();
  const { session } = useLicense();
  const {
    items: cartItems, itemCount, netSubtotal, effectiveSubtotal,
    vatAmount, total, quantityMap, addItem, addItemWithModifiers, addWeightedItem,
    removeItem, updateQuantity, setItemDiscount, setItemPrice, clearCart,
  } = useCart();

  // ── Data state ────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [taxGroupMap, setTaxGroupMap] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dynamicCategories, setDynamicCategories] = useState<string[]>(["All"]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loyaltyRate, setLoyaltyRate] = useState(0.01);
  const [modifierGroupsByProduct, setModifierGroupsByProduct] = useState<Record<string, ModifierGroup[]>>({});

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [showCart, setShowCart] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showCloseRegister, setShowCloseRegister] = useState(false);
  const [showOpenRegister, setShowOpenRegister] = useState(false);
  const [showCreditCollection, setShowCreditCollection] = useState(false);
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const [showModifierPicker, setShowModifierPicker] = useState<Product | null>(null);
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  // ── Customer state ────────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // ── Payment state ─────────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Card");
  const [cashTendered, setCashTendered] = useState("");
  const [showCashNumpad, setShowCashNumpad] = useState(false);
  const [splitEntries, setSplitEntries] = useState<SplitPaymentEntry[]>([]);
  const [splitMethod, setSplitMethod] = useState<"Card" | "Cash" | "Credit">("Card");
  const [splitAmount, setSplitAmount] = useState("");
  const [orderDiscountType, setOrderDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [orderDiscountValue, setOrderDiscountValue] = useState("");
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [loyaltyRedeemPts, setLoyaltyRedeemPts] = useState("");

  // ── Item-level state ──────────────────────────────────────────────────────────
  const [showItemDiscount, setShowItemDiscount] = useState<string | null>(null);
  const [itemDiscType, setItemDiscType] = useState<"percentage" | "fixed">("percentage");
  const [itemDiscValue, setItemDiscValue] = useState("");
  const [showPriceEdit, setShowPriceEdit] = useState<string | null>(null);
  const [priceEditInput, setPriceEditInput] = useState("");

  // ── Credit collection state ───────────────────────────────────────────────────
  const [creditPaySale, setCreditPaySale] = useState<Sale | null>(null);
  const [creditPayCustomer, setCreditPayCustomer] = useState<Customer | null>(null);
  const [creditPayAmount, setCreditPayAmount] = useState("");
  const [creditPayNote, setCreditPayNote] = useState("");

  // ── Derived ──────────────────────────────────────────────────────────────────
  const orderDiscAmt = useMemo(() => {
    const val = parseFloat(orderDiscountValue);
    if (isNaN(val) || val <= 0) return 0;
    if (orderDiscountType === "percentage") return Math.min(effectiveSubtotal, effectiveSubtotal * val / 100);
    return Math.min(effectiveSubtotal, val);
  }, [orderDiscountType, orderDiscountValue, effectiveSubtotal]);

  const loyaltyRedeemAmount = useMemo(() => {
    const pts = parseInt(loyaltyRedeemPts, 10);
    if (isNaN(pts) || pts <= 0 || !selectedCustomer) return 0;
    return Math.min(pts, selectedCustomer.loyaltyPoints || 0) * loyaltyRate;
  }, [loyaltyRedeemPts, selectedCustomer, loyaltyRate]);

  const loyaltyRedeemPtsActual = useMemo(() => {
    const pts = parseInt(loyaltyRedeemPts, 10);
    if (isNaN(pts) || pts <= 0 || !selectedCustomer) return 0;
    return Math.min(pts, selectedCustomer.loyaltyPoints || 0);
  }, [loyaltyRedeemPts, selectedCustomer]);

  const finalSubtotal = Math.max(0, effectiveSubtotal - orderDiscAmt - loyaltyRedeemAmount);
  const finalVat = useMemo(() => {
    if (businessSettings?.vatEnabled === false) return 0;
    const discountRatio = effectiveSubtotal > 0 ? finalSubtotal / effectiveSubtotal : 0;
    let vat = 0;
    for (const item of cartItems) {
      const lineAfterDisc = item.product.price * item.quantity - (item.discountAmount ?? 0);
      vat += Math.max(0, lineAfterDisc) * (item.taxRate ?? VAT_RATE) * discountRatio;
    }
    return vat;
  }, [cartItems, effectiveSubtotal, finalSubtotal, businessSettings]);
  const finalTotal = finalSubtotal + finalVat;
  const splitRemaining = finalTotal - splitEntries.reduce((s, e) => s + e.amount, 0);

  // ── Data loading ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [prods, biz, tgs, cats, mgs] = await Promise.all([
      loadProducts(), loadBusinessSettings(), loadTaxGroups(),
      loadCategories(), loadAllModifierGroups(),
    ]);
    setProducts(prods.filter((p: Product) => p.isActive !== false));
    setLoyaltyRate(biz.loyaltyRedemptionRate || 0.01);
    setBusinessSettings(biz);
    const map: Record<string, number> = {};
    tgs.forEach((g: TaxGroup) => { map[g.id] = g.rate; });
    setTaxGroupMap(map);
    const catNames = cats.length > 0
      ? ["All", ...cats.filter((c: Category) => c.isActive !== false).map((c: Category) => c.name)]
      : ["All"];
    setDynamicCategories(catNames);
    const mgByProduct: Record<string, ModifierGroup[]> = {};
    for (const mg of (mgs as ModifierGroup[])) {
      const pid = mg.productId;
      if (!mgByProduct[pid]) mgByProduct[pid] = [];
      mgByProduct[pid]!.push(mg);
    }
    setModifierGroupsByProduct(mgByProduct);
    setLoading(false);
  }, [loadProducts, loadBusinessSettings, loadTaxGroups, loadCategories, loadAllModifierGroups]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  // ── Product helpers ───────────────────────────────────────────────────────────
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

  const productById = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const p of products) map[p.id] = p;
    return map;
  }, [products]);

  const handleAddById = useCallback((productId: string) => {
    const product = productById[productId];
    if (!product) return;
    const allowNegative = businessSettings?.allowNegativeStock !== false;
    if (!allowNegative && product.stockTracked && product.stockQuantity <= 0) {
      Alert.alert("Out of Stock", `${product.name} is out of stock.`);
      return;
    }
    const vatEnabled = businessSettings?.vatEnabled !== false;
    const rate = vatEnabled
      ? (product.taxGroupId ? (taxGroupMap[product.taxGroupId] ?? VAT_RATE) : VAT_RATE)
      : 0;
    const productModGroups = modifierGroupsByProduct[product.id];
    if (productModGroups && productModGroups.length > 0) {
      setShowModifierPicker(product);
      return;
    }
    addItem(product, rate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [productById, taxGroupMap, addItem, businessSettings, modifierGroupsByProduct]);

  const handleAddItem = useCallback((product: Product) => handleAddById(product.id), [handleAddById]);

  // ── Sale / payment ────────────────────────────────────────────────────────────
  const handleChargeSale = useCallback(async () => {
    if (cartItems.length === 0) return;
    if (paymentMethod === "Credit" && !selectedCustomer) {
      setShowCustomerSelect(true);
      return;
    }
    if (paymentMethod === "Split" && Math.abs(splitRemaining) > 0.01) {
      Alert.alert("Split Incomplete", `Remaining: ${formatCurrency(splitRemaining)}`);
      return;
    }
    const parsedTendered = parseFloat(cashTendered) || 0;
    if (paymentMethod === "Cash" && parsedTendered > 0 && parsedTendered < finalTotal - 0.005) {
      Alert.alert("Insufficient Cash", `Amount tendered (${formatCurrency(parsedTendered)}) is less than the total (${formatCurrency(finalTotal)}).`);
      return;
    }

    const orderType = "takeaway";
    try {
      const totalDiscAmt = orderDiscAmt + loyaltyRedeemAmount;
      const sale = await saveSale(cartItems, {
        paymentMethod, orderType,
        customerId: selectedCustomer?.id, customerName: selectedCustomer?.name,
        staffId: currentStaff?.id, staffName: currentStaff?.name,
        discountType: totalDiscAmt > 0 ? orderDiscountType : undefined,
        discountValue: totalDiscAmt > 0 ? parseFloat(orderDiscountValue || "0") : undefined,
        discountAmount: totalDiscAmt,
        loyaltyPointsRedeemed: loyaltyRedeemPtsActual > 0 ? loyaltyRedeemPtsActual : undefined,
        splitPayments: paymentMethod === "Split" ? splitEntries : undefined,
        allowNegativeStock: businessSettings?.allowNegativeStock !== false,
        cashTendered: paymentMethod === "Cash" && parsedTendered > 0 ? parsedTendered : undefined,
        customerCreditBalance: selectedCustomer ? selectedCustomer.creditBalance : undefined,
      });

      // Auto-print receipt
      if (businessSettings?.printerSettings?.autoPrintReceipt) {
        try {
          const ps = businessSettings.printerSettings;
          const printItems: SaleItem[] = cartItems.map((ci) => {
            const effectivePrice = ci.product.price + (ci.modifierTotal ?? 0);
            return {
              id: "", saleId: sale.id,
              productId: ci.product.id, productName: ci.product.name,
              productPrice: effectivePrice, quantity: ci.quantity,
              lineTotal: effectivePrice * ci.quantity - (ci.discountAmount ?? 0),
              discountAmount: ci.discountAmount,
              modifiers: ci.selectedModifiers, modifierTotal: ci.modifierTotal,
              bundleServices: ci.bundleServices,
            };
          });
          const { printHtml } = await import("@/lib/printBridge");
          const isDirect = (ps.printMethod ?? "system") === "direct";
          if (isDirect) {
            const { generateReceiptText } = await import("@/lib/textReceipt");
            const rawText = generateReceiptText(sale, printItems, businessSettings);
            await printHtml("", {
              deviceName: ps.windowsReceiptPrinterName || "", paperWidth: ps.paperWidth || "80mm",
              rawMode: true, rawText, autoCut: true, codepage: ps.rawCodepage || "cp1252",
              sunmiEnabled: !!ps.sunmiEnabled,
              androidDevicePath: ps.androidPrinterEnabled ? (ps.androidPrinterPath || "/dev/prnt") : undefined,
              networkPrinterIp: ps.networkPrinterEnabled ? ps.networkPrinterIp : undefined,
              networkPrinterPort: ps.networkPrinterPort,
              bluetoothAddress: ps.bluetoothPrinterEnabled ? ps.bluetoothPrinterAddress : undefined,
            });
          } else {
            const { generateReceiptHTML } = await import("@/lib/receiptTemplate");
            const html = generateReceiptHTML(sale, printItems, businessSettings);
            const needRaw = !!ps.rawTextMode || !!ps.androidPrinterEnabled || !!ps.sunmiEnabled || !!ps.networkPrinterEnabled || !!ps.bluetoothPrinterEnabled;
            let rawText: string | undefined;
            if (needRaw) {
              const { generateReceiptText } = await import("@/lib/textReceipt");
              rawText = generateReceiptText(sale, printItems, businessSettings);
            }
            await printHtml(html, {
              deviceName: ps.windowsReceiptPrinterName || "", paperWidth: ps.paperWidth || "80mm",
              rawMode: !!ps.rawTextMode, rawText, autoCut: ps.autoCutPaper !== false,
              codepage: ps.rawCodepage || "cp1252", sunmiEnabled: !!ps.sunmiEnabled,
              androidDevicePath: ps.androidPrinterEnabled ? (ps.androidPrinterPath || "/dev/prnt") : undefined,
              networkPrinterIp: ps.networkPrinterEnabled ? ps.networkPrinterIp : undefined,
              networkPrinterPort: ps.networkPrinterPort,
              bluetoothAddress: ps.bluetoothPrinterEnabled ? ps.bluetoothPrinterAddress : undefined,
            });
          }
        } catch { /* Best-effort */ }
      }

      clearCart();
      setShowPayment(false);
      setShowCart(false);
      setSelectedCustomer(null);
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
  }, [
    cartItems, paymentMethod, selectedCustomer, splitRemaining, orderDiscAmt, loyaltyRedeemAmount,
    saveSale, currentStaff, orderDiscountType, orderDiscountValue, loyaltyRedeemPtsActual,
    splitEntries, clearCart, fetchData, businessSettings, cashTendered, finalTotal,
  ]);

  // ── Payment helpers ───────────────────────────────────────────────────────────
  const openPayment = useCallback(() => {
    setPaymentMethod("Card");
    setOrderDiscountValue("");
    setShowDiscountInput(false);
    setSplitEntries([]);
    setLoyaltyRedeemPts("");
    setShowPayment(true);
  }, []);

  const closePayment = useCallback(() => {
    setShowPayment(false);
    setCashTendered("");
    setShowCashNumpad(false);
  }, []);

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
    if (isNaN(val) || val <= 0) setItemDiscount(productId, undefined, undefined);
    else setItemDiscount(productId, itemDiscType, val);
    setShowItemDiscount(null);
    setItemDiscValue("");
  }, [itemDiscValue, itemDiscType, setItemDiscount]);

  const handleCashKey = useCallback((key: string) => {
    setCashTendered((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (key === ".") { if (prev.includes(".")) return prev; return prev === "" ? "0." : prev + "."; }
      if (prev === "0" && key !== ".") return key;
      if (prev.includes(".")) { const [, dec] = prev.split("."); if (dec.length >= 2) return prev; }
      return prev + key;
    });
  }, []);

  // ── Scanner ────────────────────────────────────────────────────────────────────
  const handleScanFound = useCallback((product: Product) => {
    handleAddItem(product); setShowScanner(false);
  }, [handleAddItem]);

  const handleScanFoundWeighed = useCallback((product: Product, weightKg: number) => {
    const vatEnabled = businessSettings?.vatEnabled !== false;
    const rate = vatEnabled ? (product.taxGroupId ? (taxGroupMap[product.taxGroupId] ?? VAT_RATE) : VAT_RATE) : 0;
    addWeightedItem(product, rate, weightKg);
    setShowScanner(false);
  }, [addWeightedItem, businessSettings, taxGroupMap]);

  const handleScanNotFound = useCallback(async (barcode: string) => {
    setShowScanner(false);
    if (barcode.startsWith("INV-")) {
      try {
        const sale = await loadSaleByInvoiceNumber(barcode);
        if (sale?.paymentMethod === "Credit" && sale.customerId) {
          const customers = await loadCustomers();
          const customer = customers.find((c) => c.id === sale.customerId);
          if (customer && customer.creditBalance > 0) {
            setCreditPaySale(sale); setCreditPayCustomer(customer);
            setCreditPayAmount(String(Math.min(sale.total, customer.creditBalance).toFixed(2)));
            setCreditPayNote(`Payment for ${barcode}`);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            return;
          }
        }
        if (sale) { Alert.alert("Not a Credit Sale", `Invoice ${barcode} was paid by ${sale.paymentMethod}, not Credit.`); return; }
      } catch { /* ignore */ }
    }
    Alert.alert("Not Found", `No product or invoice matched: ${barcode}`);
  }, [loadSaleByInvoiceNumber, loadCustomers]);

  const handleCreditPayFromScan = useCallback(async () => {
    if (!creditPayCustomer || !creditPaySale) return;
    const amt = parseFloat(creditPayAmount);
    if (isNaN(amt) || amt <= 0) { Alert.alert("Invalid", "Enter a valid payment amount."); return; }
    if (amt > creditPayCustomer.creditBalance) { Alert.alert("Exceeds Balance", `Payment cannot exceed ${formatCurrency(creditPayCustomer.creditBalance)}.`); return; }
    try {
      await recordCreditPayment(creditPayCustomer.id, amt, creditPayNote.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Payment Recorded", `${formatCurrency(amt)} collected from ${creditPayCustomer.name}.`);
      setCreditPaySale(null); setCreditPayCustomer(null); setCreditPayAmount(""); setCreditPayNote("");
    } catch { Alert.alert("Error", "Failed to record payment."); }
  }, [creditPayCustomer, creditPaySale, creditPayAmount, creditPayNote, recordCreditPayment]);

  const handleOpenCashDrawer = useCallback(async () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>OPEN CASH DRAWER<script>window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close();},500);},150);};</script></body></html>`;
    try {
      const { printHtml } = await import("@/lib/printBridge");
      const dps = businessSettings?.printerSettings;
      await printHtml(html, { deviceName: dps?.windowsDrawerPrinterName || dps?.windowsReceiptPrinterName || "", paperWidth: "80mm", rawMode: !!dps?.rawTextMode, rawText: dps?.rawTextMode ? "OPEN CASH DRAWER\n" : undefined, autoCut: dps?.autoCutPaper !== false, codepage: dps?.rawCodepage || "cp1252" });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) { Alert.alert("Drawer Error", e?.message || "Could not send open-drawer command."); }
  }, [businessSettings]);

  // ── Renderers ──────────────────────────────────────────────────────────────────
  const renderProductItem = useCallback(({ item }: { item: Product }) => (
    <ProductCard product={item} onAdd={handleAddById} quantity={quantityMap[item.id] ?? 0} />
  ), [handleAddById, quantityMap]);

  const productKeyExtractor = useCallback((item: Product) => item.id, []);

  const renderCartItem = useCallback(({ item }: { item: import("@/types").CartItem }) => {
    const lineKey = item.lineId ?? item.product.id;
    return (
      <View>
        <CartItemRow item={item} onUpdateQuantity={updateQuantity} onRemoveItem={removeItem} />
        {item.discountAmount && item.discountAmount > 0 ? (
          <View style={styles.itemDiscRow}>
            <Text style={{ color: colors.success, fontSize: 11 }}>Discount: -{formatCurrency(item.discountAmount)}</Text>
            <TouchableOpacity onPress={() => setItemDiscount(lineKey, undefined, undefined)}>
              <Feather name="x" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.itemActionRow}>
          <TouchableOpacity
            onPress={() => { setShowItemDiscount(lineKey); setItemDiscType(item.discountType || "percentage"); setItemDiscValue(item.discountValue ? String(item.discountValue) : ""); }}
            style={[styles.itemDiscBtn, { borderColor: colors.primary + "60" }]}
          >
            <Feather name="percent" size={13} color={colors.primary} />
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>Disc</Text>
          </TouchableOpacity>
          {item.product.priceChangeAllowed && (
            <TouchableOpacity
              onPress={() => { setShowPriceEdit(lineKey); setPriceEditInput(String(item.product.price)); }}
              style={[styles.itemDiscBtn, { borderColor: "#F39C12" + "80" }]}
            >
              <Feather name="edit-2" size={13} color="#F39C12" />
              <Text style={{ fontSize: 12, color: "#F39C12", fontWeight: "700" }}>Price</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [colors, setItemDiscount, updateQuantity, removeItem]);

  const cartKeyExtractor = useCallback((item: import("@/types").CartItem) => item.lineId ?? item.product.id, []);

  const registerOpen = businessSettings?.registerOpen !== false;

  // ── Toolbar components ────────────────────────────────────────────────────────
  const SearchBar = useMemo(() => (
    <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
      <Feather name="search" size={16} color={colors.mutedForeground} />
      <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search products..." placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
      {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity>}
    </View>
  ), [colors, searchQuery]);

  const EndOfDayButton = useMemo(() => (
    registerOpen ? (
      <TouchableOpacity onPress={() => setShowCloseRegister(true)} style={[isTablet ? styles.endOfDayBtn : styles.iconBtn, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "40", borderRadius: colors.radius }]}>
        <Feather name="moon" size={15} color={colors.destructive} />
        {isTablet && <Text style={[styles.endOfDayText, { color: colors.destructive }]} allowFontScaling={false}>End of Day</Text>}
      </TouchableOpacity>
    ) : (
      <TouchableOpacity onPress={() => setShowOpenRegister(true)} style={[isTablet ? styles.endOfDayBtn : styles.iconBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40", borderRadius: colors.radius }]}>
        <Feather name="unlock" size={15} color={colors.primary} />
        {isTablet && <Text style={[styles.endOfDayText, { color: colors.primary }]} allowFontScaling={false}>Open Register</Text>}
      </TouchableOpacity>
    )
  ), [colors, registerOpen, isTablet]);

  const CollectCreditButton = useMemo(() => (
    <TouchableOpacity onPress={() => setShowCreditCollection(true)} style={[isTablet ? styles.endOfDayBtn : styles.iconBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "35", borderRadius: colors.radius }]}>
      <Feather name="dollar-sign" size={15} color={colors.primary} />
      {isTablet && <Text style={[styles.endOfDayText, { color: colors.primary }]} allowFontScaling={false}>Collect</Text>}
    </TouchableOpacity>
  ), [colors, isTablet]);

  const OpenDrawerButton = useMemo(() => (
    <TouchableOpacity onPress={handleOpenCashDrawer} style={[isTablet ? styles.endOfDayBtn : styles.iconBtn, { backgroundColor: "#16A085" + "18", borderColor: "#16A085" + "40", borderRadius: colors.radius }]}>
      <Feather name="inbox" size={15} color="#16A085" />
      {isTablet && <Text style={[styles.endOfDayText, { color: "#16A085" }]} allowFontScaling={false}>Open Drawer</Text>}
    </TouchableOpacity>
  ), [colors, handleOpenCashDrawer, isTablet]);

  // ── Cart panel ────────────────────────────────────────────────────────────────
  const CartContent = (
    <View style={styles.cartInner}>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground, opacity: 0.06, textAlign: "center", letterSpacing: 4, transform: [{ rotate: "-30deg" }] }} allowFontScaling={false}>AL SALIK POS</Text>
      </View>
      <View style={[styles.cartHeader, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.cartHeaderRow}>
            <Text style={[styles.cartTitle, { color: colors.foreground }]}>🛍 Sale</Text>
            <View style={styles.cartHeaderRight}>
              {currentStaff && <Text style={[styles.staffLabel, { color: colors.mutedForeground }]} numberOfLines={1} ellipsizeMode="tail">{currentStaff.name}</Text>}
              {cartItems.length > 0 && !voidConfirm && (
                <TouchableOpacity onPress={() => setVoidConfirm(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.destructive + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                  <Feather name="slash" size={12} color={colors.destructive} />
                  <Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "700" }}>Void</Text>
                </TouchableOpacity>
              )}
              {voidConfirm && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "600" }}>Void order?</Text>
                  <TouchableOpacity onPress={() => { clearCart(); setSelectedCustomer(null); setVoidConfirm(false); }} style={{ backgroundColor: colors.destructive, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setVoidConfirm(false)} style={{ backgroundColor: colors.secondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>No</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {cartItems.length === 0 ? (
        <EmptyState icon="shopping-cart" title="Cart is empty" subtitle="Tap a product or scan a barcode to add items" />
      ) : (
        <FlatList data={cartItems} renderItem={renderCartItem} keyExtractor={cartKeyExtractor} style={styles.cartList} showsVerticalScrollIndicator={false} removeClippedSubviews={Platform.OS !== "web"} />
      )}

      {cartItems.length > 0 && (
        <View style={[styles.cartFooter, { borderTopColor: colors.border }]}>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatCurrency(netSubtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>VAT</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatCurrency(vatAmount)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text style={[styles.grandTotalLabel, { color: colors.foreground }]} allowFontScaling={false}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: colors.foreground }]} allowFontScaling={false}>{formatCurrency(total)}</Text>
          </View>
          <View style={styles.cartBtnRow}>
            <TouchableOpacity
              onPress={async () => {
                if (!cartItems.length) return;
                try {
                  const html = generateBillHTML(cartItems, { businessSettings, orderType: "takeaway", staffName: currentStaff?.name, subtotal: effectiveSubtotal, vatAmount, total, itemDiscountTotal: 0 });
                  const { printHtml } = await import("@/lib/printBridge");
                  const ps = businessSettings?.printerSettings;
                  await printHtml(html, { deviceName: ps?.windowsReceiptPrinterName || "", paperWidth: ps?.paperWidth || "80mm", rawMode: !!ps?.rawTextMode, autoCut: ps?.autoCutPaper !== false, codepage: ps?.rawCodepage || "cp1252" });
                } catch (e: any) { Alert.alert("Print Error", e.message || "Could not print bill"); }
              }}
              style={[styles.printBillBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <Feather name="printer" size={16} color={colors.primary} />
            </TouchableOpacity>
            {registerOpen ? (
              <TouchableOpacity onPress={openPayment} style={[styles.chargeBtn, { backgroundColor: colors.success, borderRadius: colors.radius, flex: 1 }]}>
                <Feather name="credit-card" size={18} color="#fff" />
                <Text style={styles.chargeBtnText} allowFontScaling={false}>Charge {formatCurrency(total)}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setShowOpenRegister(true)} style={[styles.chargeBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, flex: 1 }]}>
                <Feather name="unlock" size={18} color="#fff" />
                <Text style={styles.chargeBtnText}>Open Register to Charge</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );

  const ProductGrid = (tablet: boolean) => (
    loading ? (
      <ActivityIndicator style={styles.loader} color={colors.primary} />
    ) : (
      <FlatList
        data={filteredProducts}
        renderItem={renderProductItem}
        keyExtractor={productKeyExtractor}
        numColumns={tablet ? numColumns : phoneColumns}
        key={String(tablet ? numColumns : phoneColumns)}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        initialNumToRender={tablet ? 12 : 8}
        maxToRenderPerBatch={tablet ? 8 : 6}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
        getItemLayout={tablet ? (_data, index) => ({ length: PRODUCT_ITEM_HEIGHT, offset: PRODUCT_ITEM_HEIGHT * Math.floor(index / numColumns), index }) : undefined}
      />
    )
  );

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === "web" ? 8 : 0), paddingLeft: insets.left, paddingRight: insets.right }]}>
      {isTablet ? (
        <View style={styles.splitRow}>
          <View style={styles.catalogPane}>
            <View style={[styles.catalogHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.catalogFilterRow}>
                <CategoryFilter categories={dynamicCategories} selected={selectedCategory} onSelect={setSelectedCategory} />
              </View>
              <View style={styles.catalogBtnRow}>
                {CollectCreditButton}
                {OpenDrawerButton}
                {EndOfDayButton}
                <TouchableOpacity onPress={() => setShowScanner(true)} style={[styles.iconBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <Feather name="maximize" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            {SearchBar}
            {ProductGrid(true)}
          </View>
          <View style={[styles.cartPane, { borderLeftColor: colors.border, width: cartPaneWidth }]}>{CartContent}</View>
        </View>
      ) : (
        <>
          <View style={styles.mobileContent}>
            <View style={[styles.catalogHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.catalogBtnRow}>
                {CollectCreditButton}
                {OpenDrawerButton}
                {EndOfDayButton}
                <TouchableOpacity onPress={() => setShowScanner(true)} style={[styles.iconBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <Feather name="maximize" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.catalogFilterRow}>
                <CategoryFilter categories={dynamicCategories} selected={selectedCategory} onSelect={setSelectedCategory} />
              </View>
            </View>
            {SearchBar}
            {ProductGrid(false)}
          </View>
          {itemCount > 0 && (
            <TouchableOpacity onPress={registerOpen ? () => setShowCart(true) : () => setShowOpenRegister(true)} style={[styles.cartBar, { backgroundColor: registerOpen ? colors.success : colors.primary, paddingBottom: insets.bottom + 14 }]}>
              <View style={styles.cartBarLeft}>
                <View style={styles.cartBarBadge}><Text style={styles.cartBarBadgeText}>{itemCount}</Text></View>
                <Text style={styles.cartBarText}>{registerOpen ? "View Cart" : "Open Register"}</Text>
              </View>
              <Text style={styles.cartBarTotal}>{registerOpen ? formatCurrency(total) : "🔒"}</Text>
            </TouchableOpacity>
          )}
          <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
            <View style={[styles.modalRoot, { backgroundColor: colors.background }]} onStartShouldSetResponderCapture={() => { activityResetFn.current(); return false; }}>
              <View style={[styles.modalTopBar, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Cart</Text>
                <TouchableOpacity onPress={() => setShowCart(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
              </View>
              {CartContent}
            </View>
          </Modal>
        </>
      )}

      {/* ── Payment modal ──────────────────────────────────────────────────────── */}
      <Modal visible={showPayment} animationType="fade" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.paymentOverlay} onStartShouldSetResponderCapture={() => { activityResetFn.current(); return false; }}>
            <ScrollView contentContainerStyle={styles.paymentScrollContent} keyboardShouldPersistTaps="handled">
              <View style={[styles.paymentSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
                <Text style={[styles.paymentTitle, { color: colors.foreground }]}>Payment</Text>
                <Text style={[styles.paymentLabel, { color: colors.mutedForeground }]}>Payment method</Text>
                <View style={styles.paymentMethods}>
                  {(["Card", "Cash", "Credit", "Split"] as PaymentMethod[]).map((m) => {
                    const active = paymentMethod === m;
                    const iconName = m === "Card" ? "credit-card" : m === "Cash" ? "dollar-sign" : m === "Credit" ? "users" : "columns";
                    const activeColor = m === "Credit" ? colors.destructive : m === "Split" ? "#F39C12" : colors.primary;
                    return (
                      <TouchableOpacity key={m} onPress={() => { setPaymentMethod(m); if (m !== "Split") setSplitEntries([]); if (m !== "Cash") setCashTendered(""); if (m === "Cash") setShowCashNumpad(true); }} style={[styles.methodBtn, { borderColor: active ? activeColor : colors.border, backgroundColor: active ? activeColor + "18" : "transparent", borderRadius: colors.radius }]}>
                        <Feather name={iconName} size={14} color={active ? activeColor : colors.mutedForeground} />
                        <Text style={{ color: active ? activeColor : colors.mutedForeground, fontWeight: "600", fontSize: 12, marginLeft: 4 }}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {paymentMethod === "Cash" && (() => {
                  const parsedT = parseFloat(cashTendered) || 0;
                  const changeBack = parsedT > 0 ? Math.max(0, parsedT - finalTotal) : 0;
                  return (
                    <TouchableOpacity onPress={() => setShowCashNumpad(true)} style={[styles.cashSummaryBtn, { backgroundColor: colors.secondary, borderColor: cashTendered ? colors.success : colors.border, borderRadius: colors.radius }]}>
                      <Feather name="dollar-sign" size={16} color={cashTendered ? colors.success : colors.mutedForeground} />
                      {cashTendered ? <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>AED {cashTendered}</Text><Text style={{ color: colors.success, fontSize: 12, marginTop: 1 }}>Change: AED {changeBack.toFixed(2)}</Text></View> : <Text style={{ color: colors.mutedForeground, flex: 1, marginLeft: 10 }}>Tap to enter cash amount</Text>}
                      <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  );
                })()}
                <TouchableOpacity onPress={() => setShowCustomerSelect(true)} style={[styles.customerPickerBtn, { backgroundColor: colors.secondary, borderColor: selectedCustomer ? colors.success : colors.border, borderRadius: colors.radius }]}>
                  {selectedCustomer ? (
                    <View style={styles.customerPickerRow}>
                      <View style={[styles.customerPickerAvatar, { backgroundColor: colors.primary + "20" }]}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{selectedCustomer.name.charAt(0).toUpperCase()}</Text></View>
                      <View style={styles.customerInfoCol}>
                        <Text style={[styles.customerPickerName, { color: colors.foreground }]}>{selectedCustomer.name}</Text>
                        {(selectedCustomer.loyaltyPoints ?? 0) > 0 && <Text style={styles.loyaltyPtsLabel}>{selectedCustomer.loyaltyPoints} loyalty pts</Text>}
                        {paymentMethod === "Credit" && selectedCustomer.creditBalance > 0 && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Balance: {formatCurrency(selectedCustomer.creditBalance)}</Text>}
                      </View>
                      <TouchableOpacity onPress={() => { setSelectedCustomer(null); setLoyaltyRedeemPts(""); }} style={styles.clearCustomerBtn}><Feather name="x" size={14} color={colors.mutedForeground} /></TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.customerPickerRow}>
                      <Feather name="user-plus" size={16} color={colors.mutedForeground} />
                      <Text style={{ color: colors.mutedForeground, marginLeft: 8 }}>{paymentMethod === "Credit" ? "Select customer (required)" : "Select customer (optional, for loyalty)"}</Text>
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
                        <TouchableOpacity onPress={() => setSplitEntries(splitEntries.filter((_, j) => j !== i))} style={styles.splitRemoveBtn}><Feather name="x" size={14} color={colors.destructive} /></TouchableOpacity>
                      </View>
                    ))}
                    {splitRemaining > 0.01 && (
                      <>
                        <Text style={[styles.splitRemainingLabel, { color: colors.mutedForeground }]}>Remaining: {formatCurrency(splitRemaining)}</Text>
                        <View style={styles.splitAddRow}>
                          <View style={styles.splitMethodsRow}>
                            {(["Card", "Cash", "Credit"] as const).map((m) => (
                              <TouchableOpacity key={m} onPress={() => setSplitMethod(m)} style={[styles.splitMethodBtn, { borderColor: splitMethod === m ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                                <Text style={{ color: splitMethod === m ? colors.primary : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>{m}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <View style={styles.splitInputRow}>
                            <TextInput value={splitAmount} onChangeText={setSplitAmount} placeholder="Amount" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.splitInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
                            <TouchableOpacity onPress={handleAddSplit} style={[styles.splitAddBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}><Feather name="plus" size={16} color="#fff" /></TouchableOpacity>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={() => setShowDiscountInput((p) => !p)} style={styles.discountToggle}>
                  <Feather name="percent" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, marginLeft: 6 }}>{showDiscountInput ? "Remove order discount" : "Add order discount"}</Text>
                </TouchableOpacity>
                {showDiscountInput && (
                  <View style={[styles.discountBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                    <View style={styles.discTypeRow}>
                      {(["percentage", "fixed"] as const).map((t) => (
                        <TouchableOpacity key={t} onPress={() => setOrderDiscountType(t)} style={[styles.discTypeBtn, { borderColor: orderDiscountType === t ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                          <Text style={{ color: orderDiscountType === t ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>{t === "percentage" ? "%" : "AED"}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput value={orderDiscountValue} onChangeText={setOrderDiscountValue} placeholder={orderDiscountType === "percentage" ? "e.g. 10" : "e.g. 5.00"} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.discInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
                    {orderDiscAmt > 0 && <Text style={[styles.discAppliedLabel, { color: colors.success }]}>Discount: -{formatCurrency(orderDiscAmt)}</Text>}
                  </View>
                )}
                {selectedCustomer && (selectedCustomer.loyaltyPoints ?? 0) > 0 && (
                  <View style={[styles.discountBox, { backgroundColor: colors.secondary, borderRadius: colors.radius, marginBottom: 12 }]}>
                    <View style={styles.loyaltyHeader}><Feather name="award" size={14} color="#F39C12" /><Text style={styles.loyaltyTitle}>Loyalty Points ({selectedCustomer.loyaltyPoints} available)</Text></View>
                    <Text style={[styles.loyaltyRateLabel, { color: colors.mutedForeground }]}>1 point = {formatCurrency(loyaltyRate)} discount</Text>
                    <TextInput value={loyaltyRedeemPts} onChangeText={setLoyaltyRedeemPts} placeholder={`Points to redeem (max ${selectedCustomer.loyaltyPoints})`} placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" style={[styles.discInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
                    {loyaltyRedeemAmount > 0 && <Text style={styles.loyaltyRedeemLabel}>Redeeming {loyaltyRedeemPtsActual} pts = -{formatCurrency(loyaltyRedeemAmount)}</Text>}
                  </View>
                )}
                <View style={[styles.summaryBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                  <View style={styles.summaryRow}><Text style={{ color: colors.mutedForeground }}>Subtotal (excl. VAT)</Text><Text style={{ color: colors.foreground }}>{formatCurrency(netSubtotal)}</Text></View>
                  {orderDiscAmt > 0 && <View style={styles.summaryRow}><Text style={{ color: colors.success }}>Order Discount</Text><Text style={{ color: colors.success }}>-{formatCurrency(orderDiscAmt)}</Text></View>}
                  {loyaltyRedeemAmount > 0 && <View style={styles.summaryRow}><Text style={styles.loyaltyPtsLabel}>Loyalty Redemption</Text><Text style={styles.loyaltyPtsLabel}>-{formatCurrency(loyaltyRedeemAmount)}</Text></View>}
                  <View style={styles.summaryRow}><Text style={{ color: colors.mutedForeground }}>VAT</Text><Text style={{ color: colors.foreground }}>{formatCurrency(finalVat)}</Text></View>
                  <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: 10 }]} />
                  <View style={styles.summaryRow}><Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Total</Text><Text style={[styles.grandTotalValue, { color: colors.foreground }]}>{formatCurrency(finalTotal)}</Text></View>
                </View>
                <View style={styles.paymentActions}>
                  <TouchableOpacity onPress={closePayment} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}><Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity onPress={handleChargeSale} style={[styles.confirmBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={styles.confirmBtnText}>Confirm Sale</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Cash numpad ─────────────────────────────────────────────────────────── */}
      <Modal visible={showCashNumpad} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCashNumpad(false)}>
        <View style={[styles.numpadScreen, { backgroundColor: colors.background }]} onStartShouldSetResponderCapture={() => { activityResetFn.current(); return false; }}>
          <View style={[styles.numpadScreenHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setShowCashNumpad(false); setCashTendered(""); }} style={styles.numpadHeaderBtn}><Text style={{ color: colors.mutedForeground, fontSize: 15 }}>Clear</Text></TouchableOpacity>
            <Text style={[styles.numpadScreenTitle, { color: colors.foreground }]}>Collect Amount</Text>
            <TouchableOpacity onPress={() => setShowCashNumpad(false)} style={styles.numpadHeaderBtn}><Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>Done</Text></TouchableOpacity>
          </View>
          <View style={[styles.numpadDueRow, { backgroundColor: colors.secondary }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Total Due</Text>
            <Text style={[styles.numpadDueValue, { color: colors.foreground }]}>{formatCurrency(finalTotal)}</Text>
          </View>
          <View style={[styles.numpadDisplayBox, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.numpadDisplayAmt, { color: cashTendered ? colors.foreground : colors.mutedForeground }]}>{cashTendered ? `AED  ${cashTendered}` : "AED  0.00"}</Text>
          </View>
          {(() => {
            const parsedT = parseFloat(cashTendered) || 0;
            const changeBack = parsedT > 0 ? Math.max(0, parsedT - finalTotal) : 0;
            const shortBy = parsedT > 0 && parsedT < finalTotal - 0.005 ? finalTotal - parsedT : 0;
            const UAE_DENOMS = [5, 10, 20, 50, 100, 200, 500];
            const quickAmounts = [{ label: "Exact", value: finalTotal }, ...UAE_DENOMS.filter((d) => d > finalTotal).slice(0, 4).map((d) => ({ label: `AED ${d}`, value: d }))];
            const numpadKeys = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];
            return (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.numpadQuickRow} contentContainerStyle={{ gap: 8, alignItems: "center", paddingHorizontal: 16 }}>
                  {quickAmounts.map((qa) => (<TouchableOpacity key={qa.label} onPress={() => setCashTendered(qa.value.toFixed(2))} style={[styles.numpadQuickBtn, { borderColor: colors.border, backgroundColor: colors.secondary, borderRadius: colors.radius }]}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>{qa.label}</Text></TouchableOpacity>))}
                </ScrollView>
                {parsedT > 0 && (shortBy > 0 ? <View style={[styles.numpadChangeBanner, { backgroundColor: "#E74C3C18", borderColor: "#E74C3C33" }]}><Feather name="alert-circle" size={16} color="#E74C3C" /><Text style={[styles.numpadChangeTxt, { color: "#E74C3C" }]}>Short by  AED {shortBy.toFixed(2)}</Text></View> : <View style={[styles.numpadChangeBanner, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}><Feather name="refresh-cw" size={16} color={colors.success} /><Text style={[styles.numpadChangeTxt, { color: colors.success }]}>Change  AED {changeBack.toFixed(2)}</Text></View>)}
                <View style={styles.numpadGridFull}>
                  {numpadKeys.map((key) => (<TouchableOpacity key={key} onPress={() => handleCashKey(key)} activeOpacity={0.65} style={[styles.numpadKeyFull, { backgroundColor: key === "⌫" ? colors.destructive + "18" : colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}><Text style={{ color: key === "⌫" ? colors.destructive : colors.foreground, fontSize: 22, fontWeight: "700" }}>{key}</Text></TouchableOpacity>))}
                </View>
                <View style={[styles.numpadConfirmRow, { borderTopColor: colors.border }]}>
                  <TouchableOpacity onPress={() => setShowCashNumpad(false)} disabled={parsedT > 0 && shortBy > 0} style={[styles.numpadConfirmBtn, { backgroundColor: parsedT > 0 && shortBy > 0 ? colors.mutedForeground : colors.success, borderRadius: colors.radius }]}>
                    <Feather name="check-circle" size={20} color="#fff" />
                    <Text style={styles.numpadConfirmTxt}>{parsedT === 0 ? "Skip / No Amount" : shortBy > 0 ? "Insufficient Cash" : `Confirm  ·  Change AED ${changeBack.toFixed(2)}`}</Text>
                  </TouchableOpacity>
                </View>
              </>
            );
          })()}
        </View>
      </Modal>

      {/* ── Price edit ──────────────────────────────────────────────────────────── */}
      <Modal visible={!!showPriceEdit} animationType="fade" transparent>
        <View style={styles.paymentOverlay} onStartShouldSetResponderCapture={() => { activityResetFn.current(); return false; }}>
          <View style={[styles.itemDiscSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <Text style={[styles.paymentTitle, { color: colors.foreground, fontSize: 18 }]}>Edit Price</Text>
            <TextInput value={priceEditInput} onChangeText={setPriceEditInput} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" autoFocus style={[styles.discInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <View style={[styles.paymentActions, { marginTop: 16 }]}>
              <TouchableOpacity onPress={() => { setShowPriceEdit(null); setPriceEditInput(""); }} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}><Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { if (!showPriceEdit) return; const p = parseFloat(priceEditInput); if (!isNaN(p) && p >= 0) setItemPrice(showPriceEdit, p); setShowPriceEdit(null); setPriceEditInput(""); }} style={[styles.confirmBtn, { backgroundColor: "#F39C12", borderRadius: colors.radius }]}><Text style={{ color: "#fff", fontWeight: "700" }}>Apply</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Item discount ───────────────────────────────────────────────────────── */}
      <Modal visible={!!showItemDiscount} animationType="fade" transparent>
        <View style={styles.paymentOverlay} onStartShouldSetResponderCapture={() => { activityResetFn.current(); return false; }}>
          <View style={[styles.itemDiscSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2 }]}>
            <Text style={[styles.paymentTitle, { color: colors.foreground, fontSize: 18 }]}>Item Discount</Text>
            <View style={styles.discTypeRow}>
              {(["percentage", "fixed"] as const).map((t) => (<TouchableOpacity key={t} onPress={() => setItemDiscType(t)} style={[styles.discTypeBtn, { borderColor: itemDiscType === t ? colors.primary : colors.border, borderRadius: colors.radius }]}><Text style={{ color: itemDiscType === t ? colors.primary : colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>{t === "percentage" ? "%" : "AED"}</Text></TouchableOpacity>))}
            </View>
            <TextInput value={itemDiscValue} onChangeText={setItemDiscValue} placeholder={itemDiscType === "percentage" ? "e.g. 10" : "e.g. 5.00"} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" autoFocus style={[styles.discInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
            <View style={[styles.paymentActions, { marginTop: 16 }]}>
              <TouchableOpacity onPress={() => { setShowItemDiscount(null); setItemDiscValue(""); }} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}><Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => showItemDiscount && handleApplyItemDiscount(showItemDiscount)} style={[styles.confirmBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}><Text style={{ color: "#fff", fontWeight: "700" }}>Apply</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modifier picker ─────────────────────────────────────────────────────── */}
      {showModifierPicker && (() => {
        const prodModGroups = modifierGroupsByProduct[showModifierPicker.id] ?? [];
        const [selectedOptions, setSelectedOptions] = React.useState<Record<string, string[]>>({});
        return (
          <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModifierPicker(null)}>
            <View style={[styles.modalRoot, { backgroundColor: colors.background }]} onStartShouldSetResponderCapture={() => { activityResetFn.current(); return false; }}>
              <View style={[styles.modalTopBar, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{showModifierPicker.name}</Text>
                <TouchableOpacity onPress={() => setShowModifierPicker(null)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                {prodModGroups.map((mg) => (
                  <View key={mg.id} style={{ marginBottom: 24 }}>
                    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginBottom: 4 }}>{mg.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>{mg.required ? "Required" : "Optional"} · {mg.maxSelections > 1 ? `Up to ${mg.maxSelections}` : "Choose one"}</Text>
                    {mg.options.map((opt) => {
                      const selected = (selectedOptions[mg.id] ?? []).includes(opt.id);
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          onPress={() => {
                            setSelectedOptions((prev) => {
                              const current = prev[mg.id] ?? [];
                              if (mg.maxSelections === 1) return { ...prev, [mg.id]: selected ? [] : [opt.id] };
                              if (selected) return { ...prev, [mg.id]: current.filter((id) => id !== opt.id) };
                              if (current.length >= mg.maxSelections) return prev;
                              return { ...prev, [mg.id]: [...current, opt.id] };
                            });
                          }}
                          style={[styles.customerPickerBtn, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + "15" : "transparent", borderRadius: colors.radius, marginBottom: 8 }]}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ color: selected ? colors.primary : colors.foreground, fontWeight: selected ? "700" : "400", fontSize: 14 }}>{opt.name}</Text>
                            {opt.priceAdjustment > 0 && <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>+{formatCurrency(opt.priceAdjustment)}</Text>}
                            {selected && <Feather name="check" size={16} color={colors.primary} style={{ marginLeft: 8 }} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
              <View style={[styles.cartFooter, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => {
                    const vatEnabled = businessSettings?.vatEnabled !== false;
                    const rate = vatEnabled ? (showModifierPicker.taxGroupId ? (taxGroupMap[showModifierPicker.taxGroupId] ?? VAT_RATE) : VAT_RATE) : 0;
                    const allSelected: import("@/types").SelectedModifier[] = [];
                    for (const mg of prodModGroups) {
                      for (const optId of (selectedOptions[mg.id] ?? [])) {
                        const opt = mg.options.find((o) => o.id === optId);
                        if (opt) {
                          allSelected.push({ groupId: mg.id, groupName: mg.name, optionId: opt.id, optionName: opt.name, priceAdjustment: opt.priceAdjustment });
                        }
                      }
                    }
                    addItemWithModifiers(showModifierPicker, rate, allSelected);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowModifierPicker(null);
                  }}
                  style={[styles.chargeBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}
                >
                  <Feather name="plus" size={18} color="#fff" />
                  <Text style={styles.chargeBtnText}>Add to Cart</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* ── Credit pay from scan ────────────────────────────────────────────────── */}
      <Modal visible={!!creditPaySale} animationType="fade" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.paymentOverlay} onStartShouldSetResponderCapture={() => { activityResetFn.current(); return false; }}>
            <View style={[styles.itemDiscSheet, { backgroundColor: colors.card, borderRadius: colors.radius * 2, maxWidth: 400 }]}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                  <Feather name="credit-card" size={20} color={colors.primary} />
                  <Text style={[styles.paymentTitle, { color: colors.foreground, fontSize: 18, marginLeft: 8, marginBottom: 0 }]}>Collect Credit Payment</Text>
                </View>
                <View style={{ backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, marginBottom: 12, padding: 12 }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>{creditPayCustomer?.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>Invoice: {creditPaySale?.invoiceNumber}</Text>
                  <Text style={{ color: "#E74C3C", fontSize: 13, fontWeight: "600", marginTop: 4 }}>Outstanding: {formatCurrency(creditPayCustomer?.creditBalance ?? 0)}</Text>
                </View>
                <TextInput value={creditPayAmount} onChangeText={setCreditPayAmount} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.searchInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 8 }]} />
                <TextInput value={creditPayNote} onChangeText={setCreditPayNote} placeholder="Note" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, marginBottom: 12 }]} />
                <TouchableOpacity onPress={handleCreditPayFromScan} style={[styles.chargeBtn, { backgroundColor: colors.success, borderRadius: colors.radius }]}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Collect Payment</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { setCreditPaySale(null); setCreditPayCustomer(null); setCreditPayAmount(""); setCreditPayNote(""); }} style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius, marginTop: 8 }]}><Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text></TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Shared modals ──────────────────────────────────────────────────────── */}
      <ReceiptModal visible={!!receiptSale} sale={receiptSale} onClose={() => setReceiptSale(null)} />
      <CloseRegisterModal visible={showCloseRegister} onClose={() => setShowCloseRegister(false)} onSuccess={fetchData} />
      <OpenRegisterModal visible={showOpenRegister} onClose={() => setShowOpenRegister(false)} onSuccess={fetchData} />
      <CreditCollectionModal visible={showCreditCollection} onClose={() => setShowCreditCollection(false)} />
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
        weightBarcodeSettings={businessSettings?.weightBarcodeSettings}
        onFoundWeighed={handleScanFoundWeighed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splitRow: { flex: 1, flexDirection: "row" },
  catalogPane: { flex: 3 },
  catalogHeader: { flexDirection: "column", borderBottomWidth: 1 },
  catalogBtnRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  catalogFilterRow: { flexShrink: 0 },
  cartPane: { borderLeftWidth: 1 },
  mobileContent: { flex: 1 },
  grid: { padding: 10, paddingTop: 4 },
  loader: { flex: 1 },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginTop: 8, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  endOfDayBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, gap: 5 },
  endOfDayText: { fontSize: 12, fontWeight: "700" },
  cartInner: { flex: 1, overflow: "hidden" },
  cartHeader: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  cartHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cartHeaderRight: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", minWidth: 0 },
  cartTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold", flexShrink: 0 },
  staffLabel: { fontSize: 11, maxWidth: 80 },
  cartList: { flex: 1, minHeight: 0 },
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
  paymentScrollContent: { alignItems: "center", justifyContent: "center", flexGrow: 1, padding: 12 },
  paymentSheet: { width: "100%", maxWidth: 460, padding: 20, paddingHorizontal: 16 },
  paymentTitle: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 20 },
  paymentLabel: { fontSize: 12, marginBottom: 8, textTransform: "uppercase" },
  paymentMethods: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  methodBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderWidth: 2, minWidth: 80 },
  cashSummaryBtn: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1.5, marginBottom: 12 },
  numpadScreen: { flex: 1 },
  numpadScreenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  numpadHeaderBtn: { width: 60, alignItems: "center" },
  numpadScreenTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  numpadDueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10 },
  numpadDueValue: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  numpadDisplayBox: { paddingVertical: 22, paddingHorizontal: 24, alignItems: "flex-end", borderBottomWidth: 1 },
  numpadDisplayAmt: { fontSize: 38, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 1 },
  numpadQuickRow: { maxHeight: 52, marginVertical: 12 },
  numpadQuickBtn: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1 },
  numpadChangeBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  numpadChangeTxt: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  numpadGridFull: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, flex: 1 },
  numpadKeyFull: { width: "30%", flexGrow: 1, minHeight: 60, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  numpadConfirmRow: { padding: 16, borderTopWidth: 1 },
  numpadConfirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  numpadConfirmTxt: { color: "#fff", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  customerPickerBtn: { padding: 14, borderWidth: 1, marginBottom: 12 },
  customerPickerRow: { flexDirection: "row", alignItems: "center" },
  customerPickerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  customerPickerName: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  customerInfoCol: { flex: 1 },
  clearCustomerBtn: { padding: 4 },
  loyaltyPtsLabel: { color: "#F39C12", fontSize: 11 },
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
  itemActionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  itemDiscBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 6, gap: 4 },
  itemDiscSheet: { width: "100%", maxWidth: 360, padding: 24 },
});
