import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
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
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { CartItemRow } from "@/components/CartItemRow";
import { CategoryFilter } from "@/components/CategoryFilter";
import { EmptyState } from "@/components/EmptyState";
import { ProductCard } from "@/components/ProductCard";
import { CustomerSelectModal } from "@/components/CustomerSelectModal";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useCart } from "@/context/CartContext";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Customer, Product, Sale } from "@/types";
import { CATEGORIES, VAT_RATE, formatCurrency } from "@/types";

type PaymentMethod = "Card" | "Cash" | "Credit";

export default function POSScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  const { loadProducts, saveSale } = useDatabase();
  const {
    items: cartItems,
    itemCount,
    subtotal,
    vatAmount,
    total,
    addItem,
    clearCart,
  } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
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

  const fetchProducts = useCallback(async () => {
    const data = await loadProducts();
    setProducts(data);
    setLoading(false);
  }, [loadProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory !== "All") {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  const numColumns = width >= 1200 ? 5 : width >= 960 ? 4 : width >= 768 ? 3 : 2;

  const handleChargeSale = async () => {
    if (cartItems.length === 0) return;
    if (paymentMethod === "Credit" && !selectedCustomer) {
      setShowCustomerSelect(true);
      return;
    }
    const sale = await saveSale(
      cartItems,
      paymentMethod,
      paymentMethod === "Credit" ? selectedCustomer?.id : undefined,
      paymentMethod === "Credit" ? selectedCustomer?.name : undefined,
    );
    clearCart();
    setShowPayment(false);
    setShowCart(false);
    setSelectedCustomer(null);
    setReceiptSale(sale);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleScanFound = (product: Product) => {
    addItem(product);
    setShowScanner(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleScanNotFound = (barcode: string) => {
    setShowScanner(false);
    Alert.alert(
      "Product not found",
      `No product is linked to barcode:\n${barcode}\n\nGo to Products to assign barcodes.`,
      [{ text: "OK" }]
    );
  };

  const SearchBar = (
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
        <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}
    </View>
  );

  const ScanButton = (
    <TouchableOpacity
      onPress={() => setShowScanner(true)}
      style={[styles.scanBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name="maximize" size={18} color={colors.primary} />
    </TouchableOpacity>
  );

  const CartContent = (
    <View style={styles.cartInner}>
      <View style={[styles.cartHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.cartTitle, { color: colors.foreground }]}>Order</Text>
        {cartItems.length > 0 && (
          <TouchableOpacity onPress={clearCart} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.destructive, fontSize: 13 }}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {cartItems.length === 0 ? (
        <EmptyState
          icon="shopping-cart"
          title="Cart is empty"
          subtitle="Tap products or scan a barcode to add items"
        />
      ) : (
        <FlatList
          data={cartItems}
          renderItem={({ item }) => <CartItemRow item={item} />}
          keyExtractor={(item) => item.product.id}
          style={styles.cartList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {cartItems.length > 0 && (
        <View style={[styles.cartFooter, { borderTopColor: colors.border }]}>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>
              {formatCurrency(subtotal)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
              VAT ({Math.round(VAT_RATE * 100)}%)
            </Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>
              {formatCurrency(vatAmount)}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={[styles.totalsRow, styles.grandTotal]}>
            <Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: colors.foreground }]}>
              {formatCurrency(total)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowPayment(true)}
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
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === "web" ? insets.top + 8 : 0,
        },
      ]}
    >
      {isTablet ? (
        <View style={styles.splitRow}>
          <View style={styles.catalogPane}>
            <View style={[styles.catalogHeader, { borderBottomColor: colors.border }]}>
              <CategoryFilter
                categories={CATEGORIES}
                selected={selectedCategory}
                onSelect={setSelectedCategory}
              />
              {ScanButton}
            </View>
            {SearchBar}
            {loading ? (
              <ActivityIndicator style={styles.loader} color={colors.primary} />
            ) : (
              <FlatList
                data={filteredProducts}
                renderItem={({ item }) => (
                  <ProductCard product={item} onPress={() => addItem(item)} />
                )}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                key={String(numColumns)}
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>

          <View style={[styles.cartPane, { borderLeftColor: colors.border }]}>
            {CartContent}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.mobileContent}>
            <View style={[styles.catalogHeader, { borderBottomColor: colors.border }]}>
              <CategoryFilter
                categories={CATEGORIES}
                selected={selectedCategory}
                onSelect={setSelectedCategory}
              />
              {ScanButton}
            </View>
            {SearchBar}
            {loading ? (
              <ActivityIndicator style={styles.loader} color={colors.primary} />
            ) : (
              <FlatList
                data={filteredProducts}
                renderItem={({ item }) => (
                  <ProductCard product={item} onPress={() => addItem(item)} />
                )}
                keyExtractor={(item) => item.id}
                numColumns={2}
                key="2"
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>

          {itemCount > 0 && (
            <TouchableOpacity
              onPress={() => setShowCart(true)}
              style={[
                styles.cartBar,
                {
                  backgroundColor: colors.success,
                  paddingBottom: insets.bottom + 14,
                },
              ]}
            >
              <View style={styles.cartBarLeft}>
                <View style={styles.cartBarBadge}>
                  <Text style={styles.cartBarBadgeText}>{itemCount}</Text>
                </View>
                <Text style={styles.cartBarText}>View Order</Text>
              </View>
              <Text style={styles.cartBarTotal}>{formatCurrency(total)}</Text>
            </TouchableOpacity>
          )}

          <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
            <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
              <View style={[styles.modalTopBar, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Cart</Text>
                <TouchableOpacity onPress={() => setShowCart(false)}>
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
          <View
            style={[
              styles.paymentSheet,
              { backgroundColor: colors.card, borderRadius: colors.radius * 2 },
            ]}
          >
            <Text style={[styles.paymentTitle, { color: colors.foreground }]}>
              Payment
            </Text>

            <Text style={[styles.paymentLabel, { color: colors.mutedForeground }]}>
              Payment method
            </Text>
            <View style={styles.paymentMethods}>
              {(["Card", "Cash", "Credit"] as PaymentMethod[]).map((m) => {
                const active = paymentMethod === m;
                const iconName = m === "Card" ? "credit-card" : m === "Cash" ? "dollar-sign" : "users";
                const activeColor = m === "Credit" ? colors.destructive : colors.primary;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => {
                      setPaymentMethod(m);
                      if (m !== "Credit") setSelectedCustomer(null);
                    }}
                    style={[
                      styles.methodBtn,
                      {
                        borderColor: active ? activeColor : colors.border,
                        backgroundColor: active ? activeColor + "18" : "transparent",
                        borderRadius: colors.radius,
                      },
                    ]}
                  >
                    <Feather
                      name={iconName}
                      size={18}
                      color={active ? activeColor : colors.mutedForeground}
                    />
                    <Text
                      style={{
                        color: active ? activeColor : colors.mutedForeground,
                        fontWeight: "600",
                        fontFamily: "Inter_600SemiBold",
                        marginLeft: 8,
                      }}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {paymentMethod === "Credit" && (
              <TouchableOpacity
                onPress={() => setShowCustomerSelect(true)}
                style={[styles.customerPickerBtn, { backgroundColor: colors.secondary, borderColor: selectedCustomer ? colors.success : colors.border, borderRadius: colors.radius }]}
              >
                {selectedCustomer ? (
                  <View style={styles.customerPickerRow}>
                    <View style={[styles.customerPickerAvatar, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
                        {selectedCustomer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.customerPickerName, { color: colors.foreground }]}>{selectedCustomer.name}</Text>
                      {selectedCustomer.creditBalance > 0 && (
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                          Current balance: {formatCurrency(selectedCustomer.creditBalance)}
                        </Text>
                      )}
                    </View>
                    <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                  </View>
                ) : (
                  <View style={styles.customerPickerRow}>
                    <Feather name="user-plus" size={16} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, marginLeft: 8 }}>Select or create customer</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <View style={[styles.summaryBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
              <View style={styles.summaryRow}>
                <Text style={{ color: colors.mutedForeground }}>Subtotal</Text>
                <Text style={{ color: colors.foreground }}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={{ color: colors.mutedForeground }}>
                  VAT ({Math.round(VAT_RATE * 100)}%)
                </Text>
                <Text style={{ color: colors.foreground }}>{formatCurrency(vatAmount)}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: 10 }]} />
              <View style={styles.summaryRow}>
                <Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Total</Text>
                <Text style={[styles.grandTotalValue, { color: colors.foreground }]}>
                  {formatCurrency(total)}
                </Text>
              </View>
            </View>

            <View style={styles.paymentActions}>
              <TouchableOpacity
                onPress={() => setShowPayment(false)}
                style={[
                  styles.cancelBtn,
                  { borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChargeSale}
                style={[
                  styles.confirmBtn,
                  { backgroundColor: colors.success, borderRadius: colors.radius },
                ]}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.confirmBtnText}>Confirm Sale</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ReceiptModal
        visible={!!receiptSale}
        sale={receiptSale}
        onClose={() => setReceiptSale(null)}
      />

      <CustomerSelectModal
        visible={showCustomerSelect}
        onSelect={(customer) => {
          setSelectedCustomer(customer);
          setShowCustomerSelect(false);
        }}
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
  catalogHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingRight: 12,
  },
  cartPane: { width: 350, borderLeftWidth: 1 },
  mobileContent: { flex: 1 },
  grid: { padding: 10, paddingTop: 4 },
  loader: { flex: 1 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  scanBtn: {
    padding: 10,
    marginLeft: 4,
  },
  cartInner: { flex: 1 },
  cartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cartTitle: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  cartList: { flex: 1 },
  cartFooter: { padding: 16, borderTopWidth: 1 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 13, fontWeight: "600" },
  divider: { height: 1, marginVertical: 8 },
  grandTotal: { marginBottom: 14 },
  grandTotalLabel: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  grandTotalValue: { fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chargeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  chargeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  cartBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  cartBarLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  cartBarBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  cartBarBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cartBarText: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily: "Inter_700Bold" },
  cartBarTotal: { color: "#fff", fontWeight: "700", fontSize: 15, fontFamily: "Inter_700Bold" },
  modalRoot: { flex: 1 },
  modalTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  paymentOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  paymentSheet: {
    width: "100%",
    maxWidth: 440,
    padding: 24,
  },
  paymentTitle: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    marginBottom: 20,
  },
  paymentLabel: { fontSize: 13, marginBottom: 10 },
  paymentMethods: { flexDirection: "row", gap: 10, marginBottom: 12 },
  customerPickerBtn: { padding: 14, borderWidth: 1, marginBottom: 20 },
  customerPickerRow: { flexDirection: "row", alignItems: "center" },
  customerPickerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  customerPickerName: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  methodBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 2,
  },
  summaryBox: { padding: 16, marginBottom: 20 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  paymentActions: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
