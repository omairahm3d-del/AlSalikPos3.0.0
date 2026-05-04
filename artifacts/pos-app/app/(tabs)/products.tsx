import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { EmptyState } from "@/components/EmptyState";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Category, Product, TaxGroup } from "@/types";
import { CURRENCY, PRODUCT_COLORS, formatCurrency } from "@/types";

export default function ProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { loadProducts, createProduct, updateProduct, deleteProduct, loadTaxGroups, loadCategories } = useDatabase();

  const [products, setProducts] = useState<Product[]>([]);
  const [taxGroups, setTaxGroups] = useState<TaxGroup[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLowStock, setFilterLowStock] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRODUCT_COLORS[0]);
  const [barcode, setBarcode] = useState("");
  const [stockQty, setStockQty] = useState("999");
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [selectedTaxGroupId, setSelectedTaxGroupId] = useState<string | undefined>(undefined);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow photo library access to add product images.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const mimeType = asset.mimeType || "image/jpeg";
          setImageUri(`data:${mimeType};base64,${asset.base64}`);
        } else {
          Alert.alert("Image Error", "Could not process the selected image. Please try another.");
        }
      }
    } catch {
      Alert.alert("Error", "Failed to open image picker. Please try again.");
    }
  };

  const fetchProducts = useCallback(async () => {
    const [data, groups, cats] = await Promise.all([loadProducts(), loadTaxGroups(), loadCategories()]);
    setProducts(data);
    setTaxGroups(groups);
    const catNames = cats.length > 0 ? cats.map((c: Category) => c.name) : ["Beverages", "Food", "Snacks", "Desserts"];
    setCategoryOptions(catNames);
    setLoading(false);
  }, [loadProducts, loadTaxGroups, loadCategories]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const lowStockCount = products.filter((p) => p.stockQuantity <= p.lowStockThreshold).length;
  const outOfStockCount = products.filter((p) => p.stockQuantity <= 0).length;

  const filteredProducts = (() => {
    let list = products;
    if (filterLowStock) list = list.filter((p) => p.stockQuantity <= p.lowStockThreshold);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q));
    }
    return list;
  })();

  const openAdd = () => {
    setEditingProduct(null);
    setName(""); setCategory(categoryOptions[0] ?? ""); setPrice(""); setDescription("");
    setSelectedColor(PRODUCT_COLORS[0]); setBarcode(""); setStockQty("999");
    setLowStockThreshold("10"); setSelectedTaxGroupId(undefined); setImageUri(undefined);
    setModalVisible(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name); setCategory(product.category); setPrice(product.price.toFixed(2));
    setDescription(product.description); setSelectedColor(product.colorHex);
    setBarcode(product.barcode ?? ""); setStockQty(String(product.stockQuantity));
    setLowStockThreshold(String(product.lowStockThreshold));
    setSelectedTaxGroupId(product.taxGroupId); setImageUri(product.imageUri);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const priceNum = parseFloat(price);
    if (!name.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("Invalid input", "Please enter a valid name and price.");
      return;
    }
    const stock = parseInt(stockQty, 10) || 0;
    const threshold = parseInt(lowStockThreshold, 10) || 10;
    const barcodeVal = barcode.trim() || undefined;

    if (editingProduct) {
      await updateProduct({
        ...editingProduct,
        name: name.trim(), category, price: priceNum, description: description.trim(),
        colorHex: selectedColor, barcode: barcodeVal, stockQuantity: stock,
        lowStockThreshold: threshold, taxGroupId: selectedTaxGroupId, imageUri,
      });
    } else {
      await createProduct({
        name: name.trim(), category, price: priceNum, description: description.trim(),
        colorHex: selectedColor, barcode: barcodeVal, stockQuantity: stock,
        lowStockThreshold: threshold, taxGroupId: selectedTaxGroupId, imageUri,
      });
    }
    setModalVisible(false);
    await fetchProducts();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = (product: Product) => {
    Alert.alert("Delete Product", `Delete "${product.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteProduct(product.id); await fetchProducts(); } },
    ]);
  };

  const numColumns = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;

  const renderProduct = ({ item }: { item: Product }) => {
    const isLow = item.stockQuantity <= item.lowStockThreshold && item.stockQuantity > 0;
    const isOut = item.stockQuantity <= 0;
    return (
      <TouchableOpacity
        onPress={() => openEdit(item)}
        onLongPress={() => handleDelete(item)}
        activeOpacity={0.8}
        style={[styles.productCard, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: isOut ? colors.destructive + "60" : isLow ? "#F39C12" + "60" : colors.border }]}
      >
        <View style={[styles.productColorBand, { backgroundColor: item.imageUri ? "transparent" : item.colorHex, opacity: isOut ? 0.5 : 1 }]}>
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={styles.productImage} resizeMode="cover" />
          ) : (
            <Text style={styles.productInitial}>{item.name.charAt(0).toUpperCase()}</Text>
          )}
          {item.barcode && (
            <View style={styles.barcodeTag}>
              <Feather name="maximize" size={9} color="rgba(255,255,255,0.8)" />
            </View>
          )}
          {isOut && (
            <View style={styles.outBadge}>
              <Text style={styles.outBadgeText}>OUT</Text>
            </View>
          )}
          {isLow && !isOut && (
            <View style={[styles.outBadge, { backgroundColor: "#F39C12" }]}>
              <Text style={styles.outBadgeText}>LOW</Text>
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[styles.productCategory, { color: colors.mutedForeground }]}>{item.category}</Text>
          <View style={styles.productBottom}>
            <Text style={[styles.productPrice, { color: colors.primary }]}>{formatCurrency(item.price)}</Text>
            <Text style={[styles.stockText, { color: isOut ? colors.destructive : isLow ? "#F39C12" : colors.mutedForeground }]}>
              {item.stockQuantity} in stock
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Products</Text>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{products.length}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setFilterLowStock(!filterLowStock)}
          style={[styles.statCard, { backgroundColor: colors.card, borderColor: filterLowStock ? "#F39C12" : colors.border, borderRadius: colors.radius }]}
        >
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Low Stock</Text>
          <Text style={[styles.statValue, { color: lowStockCount > 0 ? "#F39C12" : colors.foreground }]}>{lowStockCount}</Text>
        </TouchableOpacity>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Out of Stock</Text>
          <Text style={[styles.statValue, { color: outOfStockCount > 0 ? colors.destructive : colors.foreground }]}>{outOfStockCount}</Text>
        </View>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search products..." placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity>}
      </View>

      {loading ? null : filteredProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState icon="package" title={filterLowStock ? "No low stock items" : "No products"} subtitle={filterLowStock ? "All products are well stocked" : "Tap + to add your first product"} />
        </View>
      ) : (
        <FlatList data={filteredProducts} renderItem={renderProduct} keyExtractor={(item) => item.id} numColumns={numColumns} key={String(numColumns)} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false} />
      )}

      <TouchableOpacity onPress={openAdd} style={[styles.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingProduct ? "Edit Product" : "New Product"}</Text>
            <TouchableOpacity onPress={handleSave}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Product name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Price ({CURRENCY})</Text>
            <TextInput value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {categoryOptions.map((cat) => (
                <TouchableOpacity key={cat} onPress={() => setCategory(cat)} style={[styles.chip, { backgroundColor: category === cat ? colors.primary : colors.secondary, borderColor: category === cat ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                  <Text style={{ color: category === cat ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Stock Quantity</Text>
                <TextInput value={stockQty} onChangeText={setStockQty} placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Low Stock Alert</Text>
                <TextInput value={lowStockThreshold} onChangeText={setLowStockThreshold} placeholder="10" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
              </View>
            </View>

            {taxGroups.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tax Group</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                  <TouchableOpacity onPress={() => setSelectedTaxGroupId(undefined)} style={[styles.chip, { backgroundColor: !selectedTaxGroupId ? colors.primary : colors.secondary, borderColor: !selectedTaxGroupId ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                    <Text style={{ color: !selectedTaxGroupId ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>Default (5%)</Text>
                  </TouchableOpacity>
                  {taxGroups.map((tg) => (
                    <TouchableOpacity key={tg.id} onPress={() => setSelectedTaxGroupId(tg.id)} style={[styles.chip, { backgroundColor: selectedTaxGroupId === tg.id ? colors.primary : colors.secondary, borderColor: selectedTaxGroupId === tg.id ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                      <Text style={{ color: selectedTaxGroupId === tg.id ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>{tg.name} ({(tg.rate * 100).toFixed(0)}%)</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (optional)</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="Short description" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={2} style={[styles.input, styles.textArea, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Product Image</Text>
            <View style={styles.imagePickerRow}>
              <TouchableOpacity onPress={pickImage} style={[styles.imagePickerBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <Feather name="camera" size={24} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>Add Photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              {imageUri && (
                <TouchableOpacity onPress={() => setImageUri(undefined)} style={[styles.removeImageBtn, { borderColor: colors.destructive, borderRadius: colors.radius }]}>
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                  <Text style={{ color: colors.destructive, fontSize: 12, marginLeft: 6 }}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Color {imageUri ? "(fallback)" : ""}</Text>
            <View style={styles.colorRow}>
              {PRODUCT_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setSelectedColor(c)} style={[styles.colorSwatch, { backgroundColor: c }, selectedColor === c && styles.colorSwatchSelected]}>
                  {selectedColor === c && <Feather name="check" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Barcode</Text>
            <View style={styles.barcodeRow}>
              <TextInput value={barcode} onChangeText={setBarcode} placeholder="Scan or enter barcode" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.barcodeInput, { backgroundColor: colors.secondary, borderColor: barcode ? colors.primary : colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
              <TouchableOpacity onPress={() => setShowScanner(true)} style={[styles.scanIconBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                <Feather name="maximize" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            {barcode ? (
              <View style={styles.barcodePreview}>
                <Feather name="check-circle" size={13} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: 12, marginLeft: 5 }}>Barcode linked: {barcode}</Text>
                <TouchableOpacity onPress={() => setBarcode("")} style={{ marginLeft: "auto" }}><Feather name="x" size={13} color={colors.mutedForeground} /></TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <BarcodeScannerModal visible={showScanner} products={products} assignMode onAssign={(code) => { setBarcode(code); setShowScanner(false); }} onFound={() => {}} onNotFound={() => {}} onClose={() => setShowScanner(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statsRow: { flexDirection: "row", padding: 16, paddingBottom: 8, gap: 8 },
  statCard: { flex: 1, padding: 12, borderWidth: 1, alignItems: "center" },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  emptyContainer: { flex: 1 },
  grid: { padding: 10, paddingBottom: 100 },
  productCard: { flex: 1, margin: 5, overflow: "hidden", borderWidth: 1, minWidth: 100 },
  productColorBand: { height: 70, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  productImage: { width: "100%", height: "100%", position: "absolute" },
  productInitial: { fontSize: 28, fontWeight: "700", color: "rgba(255,255,255,0.9)", fontFamily: "Inter_700Bold" },
  barcodeTag: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 4, padding: 3 },
  outBadge: { position: "absolute", bottom: 6, right: 6, backgroundColor: "#E74C3C", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  outBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  productInfo: { padding: 10 },
  productName: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold", lineHeight: 17 },
  productCategory: { fontSize: 11, marginTop: 3 },
  productBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  productPrice: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  stockText: { fontSize: 10 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  form: { padding: 20, paddingBottom: 60 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 20 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  textArea: { minHeight: 70, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexGrow: 0 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, marginRight: 8 },
  row: { flexDirection: "row", gap: 12 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  colorSwatchSelected: { borderWidth: 3, borderColor: "#fff" },
  barcodeRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  barcodeInput: { flex: 1 },
  scanIconBtn: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  barcodePreview: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  imagePickerRow: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 4 },
  imagePickerBtn: { width: 90, height: 90, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  imagePreview: { width: "100%", height: "100%" },
  imagePickerPlaceholder: { alignItems: "center", justifyContent: "center" },
  removeImageBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
});
