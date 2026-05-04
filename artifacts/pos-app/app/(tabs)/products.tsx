import React, { useCallback, useEffect, useState } from "react";
import {
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
import { EmptyState } from "@/components/EmptyState";
import { useDatabase } from "@/context/DatabaseCore";
import { useColors } from "@/hooks/useColors";
import type { Product } from "@/types";
import { CATEGORIES, PRODUCT_COLORS } from "@/types";

const CATEGORY_OPTIONS = CATEGORIES.filter((c) => c !== "All");

export default function ProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { loadProducts, createProduct, updateProduct, deleteProduct } = useDatabase();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRODUCT_COLORS[0]);

  const fetchProducts = useCallback(async () => {
    const data = await loadProducts();
    setProducts(data);
    setLoading(false);
  }, [loadProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const openAdd = () => {
    setEditingProduct(null);
    setName("");
    setCategory(CATEGORY_OPTIONS[0]);
    setPrice("");
    setDescription("");
    setSelectedColor(PRODUCT_COLORS[0]);
    setModalVisible(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setCategory(product.category);
    setPrice(product.price.toFixed(2));
    setDescription(product.description);
    setSelectedColor(product.colorHex);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const priceNum = parseFloat(price);
    if (!name.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("Invalid input", "Please enter a valid name and price.");
      return;
    }
    if (editingProduct) {
      await updateProduct({
        ...editingProduct,
        name: name.trim(),
        category,
        price: priceNum,
        description: description.trim(),
        colorHex: selectedColor,
      });
    } else {
      await createProduct({
        name: name.trim(),
        category,
        price: priceNum,
        description: description.trim(),
        colorHex: selectedColor,
      });
    }
    setModalVisible(false);
    await fetchProducts();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = (product: Product) => {
    Alert.alert("Delete Product", `Delete "${product.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteProduct(product.id);
          await fetchProducts();
        },
      },
    ]);
  };

  const numColumns = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;

  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      onPress={() => openEdit(item)}
      onLongPress={() => handleDelete(item)}
      activeOpacity={0.8}
      style={[
        styles.productCard,
        {
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[styles.productColorBand, { backgroundColor: item.colorHex }]}>
        <Text style={styles.productInitial}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.productInfo}>
        <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.productCategory, { color: colors.mutedForeground }]}>
          {item.category}
        </Text>
        <Text style={[styles.productPrice, { color: colors.primary }]}>
          €{item.price.toFixed(2)}
        </Text>
      </View>
      <View style={styles.productActions}>
        <TouchableOpacity
          onPress={() => openEdit(item)}
          style={[styles.editBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius / 2 }]}
        >
          <Feather name="edit-2" size={13} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: topPadding,
          paddingBottom: Platform.OS === "web" ? 34 : 0,
        },
      ]}
    >
      {loading ? null : products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="package"
            title="No products"
            subtitle="Tap + to add your first product"
          />
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          key={String(numColumns)}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity
        onPress={openAdd}
        style={[
          styles.fab,
          {
            backgroundColor: colors.primary,
            borderRadius: 28,
            bottom: insets.bottom + (Platform.OS === "web" ? 44 : 20),
          },
        ]}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.modalHeader,
              { paddingTop: insets.top + 16, borderBottomColor: colors.border },
            ]}
          >
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingProduct ? "Edit Product" : "New Product"}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Product name"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                  borderRadius: colors.radius,
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Price (€)</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                  borderRadius: colors.radius,
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: category === cat ? colors.primary : colors.secondary,
                      borderColor: category === cat ? colors.primary : colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: category === cat ? "#fff" : colors.mutedForeground,
                      fontWeight: "600",
                    }}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Description (optional)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Short description"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={2}
              style={[
                styles.input,
                styles.textArea,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                  borderRadius: colors.radius,
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Color</Text>
            <View style={styles.colorRow}>
              {PRODUCT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setSelectedColor(c)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    selectedColor === c && styles.colorSwatchSelected,
                  ]}
                >
                  {selectedColor === c && (
                    <Feather name="check" size={14} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  emptyContainer: { flex: 1 },
  grid: { padding: 10, paddingBottom: 100 },
  productCard: {
    flex: 1,
    margin: 5,
    overflow: "hidden",
    borderWidth: 1,
    minWidth: 100,
  },
  productColorBand: {
    height: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  productInitial: {
    fontSize: 28,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Inter_700Bold",
  },
  productInfo: { padding: 10 },
  productName: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    lineHeight: 17,
  },
  productCategory: { fontSize: 11, marginTop: 3 },
  productPrice: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  productActions: {
    position: "absolute",
    top: 76,
    right: 8,
  },
  editBtn: { padding: 6 },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  form: { padding: 20, paddingBottom: 60 },
  fieldLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
  },
  textArea: { minHeight: 70, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    marginRight: 8,
  },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: "#fff",
  },
});
