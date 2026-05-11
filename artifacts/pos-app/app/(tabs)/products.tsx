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
  Switch,
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
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkMode } from "@/context/WorkModeContext";
import type { Category, Ingredient, ModifierGroup, PrepaidPackage, PrinterConfig, Product, ServiceBundle, TaxGroup } from "@/types";
import { CURRENCY, PRODUCT_COLORS, formatCurrency } from "@/types";

type ModifierOptionDraft = { name: string; priceAdjustment: number };
type ModifierGroupDraft = { id?: string; name: string; required: boolean; maxSelections: number; options: ModifierOptionDraft[] };

export function ProductsScreen({ embedded = false }: { embedded?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const permissions = usePermissions();
  const { isSaloon, isLaundry, productLabel } = useWorkMode();
  const { width } = useWindowDimensions();
  const {
    loadProducts, createProduct, updateProduct, deleteProduct,
    loadTaxGroups, loadCategories, loadBusinessSettings,
    loadIngredients, loadRecipeIngredients, saveRecipeIngredients,
    loadModifierGroups, saveModifierGroups,
    loadPackages, createPackage, updatePackage, deletePackage,
    loadServiceBundles, createServiceBundle, updateServiceBundle, deleteServiceBundle,
  } = useDatabase();

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
  const [stockTracked, setStockTracked] = useState(false);
  const [stockQty, setStockQty] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [selectedTaxGroupId, setSelectedTaxGroupId] = useState<string | undefined>(undefined);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | undefined>(undefined);
  // Per-product feature flags. `priceChangeAllowed` exposes a "$" edit
  // button on the cart row that opens a price-override prompt scoped to
  // that line. `vatInclusive` flips the per-line VAT math from on-top
  // (default) to back-calculated from the displayed price.
  const [priceChangeAllowed, setPriceChangeAllowed] = useState(false);
  const [vatInclusive, setVatInclusive] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState<string>("");

  const [printerConfigs, setPrinterConfigs] = useState<PrinterConfig[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipeItems, setRecipeItems] = useState<{ ingredientId: string; ingredientName: string; quantity: number }[]>([]);
  const [recipeIngId, setRecipeIngId] = useState("");
  const [recipeIngQty, setRecipeIngQty] = useState("");

  // Modifier groups state
  const [modifierDrafts, setModifierDrafts] = useState<ModifierGroupDraft[]>([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroupIdx, setEditingGroupIdx] = useState<number | null>(null);
  const [groupFormName, setGroupFormName] = useState("");
  const [groupFormRequired, setGroupFormRequired] = useState(true);
  const [groupFormMaxSel, setGroupFormMaxSel] = useState(1);
  const [groupFormOptions, setGroupFormOptions] = useState<ModifierOptionDraft[]>([]);
  const [optionDraftName, setOptionDraftName] = useState("");
  const [optionDraftPrice, setOptionDraftPrice] = useState("0");

  // ── Packages + Bundles tab (saloon only) ─────────────────────────────────
  const [activeTab, setActiveTab] = useState<"services" | "packages" | "bundles">("services");
  const [packages, setPackages] = useState<PrepaidPackage[]>([]);
  const [pkgModalVisible, setPkgModalVisible] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PrepaidPackage | null>(null);
  const [pkgName, setPkgName] = useState("");
  const [pkgDescription, setPkgDescription] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgSessions, setPkgSessions] = useState("5");
  const [pkgApplicableAll, setPkgApplicableAll] = useState(true);
  const [pkgApplicableIds, setPkgApplicableIds] = useState<string[]>([]);
  const [pkgIsActive, setPkgIsActive] = useState(true);

  // ── Service bundles (saloon only) ────────────────────────────────────────
  const [bundles, setBundles] = useState<ServiceBundle[]>([]);
  const [bundleModalVisible, setBundleModalVisible] = useState(false);
  const [editingBundle, setEditingBundle] = useState<ServiceBundle | null>(null);
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [bundleServiceIds, setBundleServiceIds] = useState<string[]>([]);
  const [bundleIsActive, setBundleIsActive] = useState(true);

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
    const [data, groups, cats, biz, ings] = await Promise.all([
      loadProducts(), loadTaxGroups(), loadCategories(), loadBusinessSettings(), loadIngredients(),
    ]);
    setProducts(data);
    setTaxGroups(groups);
    const defaultCats = isSaloon
      ? ["Hair", "Nails", "Skin", "Waxing", "Other"]
      : isLaundry
      ? ["Shirts", "Trousers", "Suits", "Blankets", "Bedding", "Other"]
      : ["Beverages", "Food", "Snacks", "Desserts"];
    const catNames = cats.length > 0 ? cats.map((c: Category) => c.name) : defaultCats;
    setCategoryOptions(catNames);
    setPrinterConfigs(biz.printerSettings?.printers ?? []);
    setIngredients(ings);
    if (isSaloon) {
      const [pkgs, bdls] = await Promise.all([loadPackages(), loadServiceBundles()]);
      setPackages(pkgs);
      setBundles(bdls);
    }
    setLoading(false);
  }, [loadProducts, loadTaxGroups, loadCategories, loadBusinessSettings, loadIngredients, isSaloon, loadPackages, loadServiceBundles]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const lowStockCount = products.filter((p) => p.stockTracked && p.stockQuantity <= p.lowStockThreshold && p.stockQuantity > 0).length;
  const outOfStockCount = products.filter((p) => p.stockTracked && p.stockQuantity <= 0).length;

  const filteredProducts = (() => {
    let list = products;
    if (filterLowStock) list = list.filter((p) => !!p.stockTracked && p.stockQuantity <= p.lowStockThreshold);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q));
    }
    return list;
  })();

  const resetGroupForm = () => {
    setGroupFormName(""); setGroupFormRequired(true); setGroupFormMaxSel(1);
    setGroupFormOptions([]); setOptionDraftName(""); setOptionDraftPrice("0");
    setEditingGroupIdx(null); setShowGroupForm(false);
  };

  const openGroupForm = (idx: number | null) => {
    if (idx === null) {
      setGroupFormName(""); setGroupFormRequired(true); setGroupFormMaxSel(1);
      setGroupFormOptions([]); setOptionDraftName(""); setOptionDraftPrice("0");
      setEditingGroupIdx(null);
    } else {
      const g = modifierDrafts[idx];
      setGroupFormName(g.name); setGroupFormRequired(g.required); setGroupFormMaxSel(g.maxSelections);
      setGroupFormOptions([...g.options]); setOptionDraftName(""); setOptionDraftPrice("0");
      setEditingGroupIdx(idx);
    }
    setShowGroupForm(true);
  };

  const handleSaveGroupForm = () => {
    if (!groupFormName.trim()) { Alert.alert("Required", "Enter a group name."); return; }
    if (groupFormOptions.length === 0) { Alert.alert("Required", "Add at least one option."); return; }
    const draft: ModifierGroupDraft = {
      name: groupFormName.trim(), required: groupFormRequired,
      maxSelections: groupFormMaxSel, options: groupFormOptions,
    };
    if (editingGroupIdx === null) {
      setModifierDrafts((prev) => [...prev, draft]);
    } else {
      setModifierDrafts((prev) => prev.map((g, i) => i === editingGroupIdx ? draft : g));
    }
    resetGroupForm();
  };

  const handleAddOptionDraft = () => {
    const n = optionDraftName.trim();
    if (!n) return;
    const price = parseFloat(optionDraftPrice);
    setGroupFormOptions((prev) => [...prev, { name: n, priceAdjustment: isNaN(price) ? 0 : price }]);
    setOptionDraftName(""); setOptionDraftPrice("0");
  };

  const openAdd = () => {
    setEditingProduct(null);
    setName(""); setCategory(categoryOptions[0] ?? ""); setPrice(""); setDescription("");
    setSelectedColor(PRODUCT_COLORS[0]); setBarcode(""); setStockTracked(false); setStockQty("0");
    setLowStockThreshold("10"); setSelectedTaxGroupId(undefined); setImageUri(undefined);
    setSelectedPrinterId(undefined);
    setPriceChangeAllowed(false); setVatInclusive(false); setIsActive(true);
    setDurationMinutes("");
    setRecipeItems([]); setRecipeIngId(""); setRecipeIngQty("");
    setModifierDrafts([]); resetGroupForm();
    setModalVisible(true);
  };

  const openEdit = async (product: Product) => {
    setEditingProduct(product);
    setName(product.name); setCategory(product.category); setPrice(product.price.toFixed(2));
    setDescription(product.description); setSelectedColor(product.colorHex);
    setBarcode(product.barcode ?? ""); setStockTracked(!!product.stockTracked); setStockQty(String(product.stockTracked ? product.stockQuantity : 0));
    setLowStockThreshold(String(product.lowStockThreshold));
    setSelectedTaxGroupId(product.taxGroupId); setImageUri(product.imageUri);
    setSelectedPrinterId(product.printerId);
    setPriceChangeAllowed(!!product.priceChangeAllowed);
    setVatInclusive(!!product.vatInclusive);
    setIsActive(product.isActive !== false);
    setDurationMinutes(product.durationMinutes != null ? String(product.durationMinutes) : "");
    const [items, groups] = await Promise.all([
      loadRecipeIngredients(product.id),
      loadModifierGroups(product.id),
    ]);
    setRecipeItems(items.map((ri) => ({ ingredientId: ri.ingredientId, ingredientName: ri.ingredientName ?? "", quantity: ri.quantity })));
    setRecipeIngId(""); setRecipeIngQty("");
    setModifierDrafts(groups.map((g) => ({
      id: g.id, name: g.name, required: g.required, maxSelections: g.maxSelections,
      options: g.options.map((o) => ({ name: o.name, priceAdjustment: o.priceAdjustment })),
    })));
    resetGroupForm();
    setModalVisible(true);
  };

  const handleAddRecipeItem = () => {
    if (!recipeIngId) return;
    const qty = parseFloat(recipeIngQty);
    if (isNaN(qty) || qty <= 0) { Alert.alert("Invalid", "Enter a valid quantity."); return; }
    if (recipeItems.some((r) => r.ingredientId === recipeIngId)) { Alert.alert("Duplicate", "This ingredient is already added."); return; }
    const ing = ingredients.find((i) => i.id === recipeIngId);
    if (!ing) return;
    setRecipeItems((prev) => [...prev, { ingredientId: ing.id, ingredientName: ing.name, quantity: qty }]);
    setRecipeIngId(""); setRecipeIngQty("");
  };

  const handleSave = async () => {
    const priceNum = parseFloat(price);
    if (!name.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("Invalid input", "Please enter a valid name and price.");
      return;
    }
    const stock = stockTracked ? (parseInt(stockQty, 10) || 0) : 0;
    const threshold = parseInt(lowStockThreshold, 10) || 10;
    const barcodeVal = barcode.trim() || undefined;

    let productId: string;
    const durationVal = durationMinutes.trim() ? (parseInt(durationMinutes, 10) || undefined) : undefined;
    if (editingProduct) {
      await updateProduct({
        ...editingProduct,
        name: name.trim(), category, price: priceNum, description: description.trim(),
        colorHex: selectedColor, barcode: barcodeVal, stockQuantity: stock, stockTracked,
        lowStockThreshold: threshold, taxGroupId: selectedTaxGroupId, imageUri,
        printerId: selectedPrinterId,
        priceChangeAllowed, vatInclusive, durationMinutes: durationVal, isActive,
      });
      productId = editingProduct.id;
    } else {
      const created = await createProduct({
        name: name.trim(), category, price: priceNum, description: description.trim(),
        colorHex: selectedColor, barcode: barcodeVal, stockQuantity: stock, stockTracked,
        lowStockThreshold: threshold, taxGroupId: selectedTaxGroupId, imageUri,
        printerId: selectedPrinterId,
        priceChangeAllowed, vatInclusive, durationMinutes: durationVal, isActive,
      });
      productId = created.id;
    }
    await saveRecipeIngredients(productId, recipeItems.map((ri) => ({
      productId,
      ingredientId: ri.ingredientId,
      ingredientName: ri.ingredientName,
      quantity: ri.quantity,
    })));
    if (!isSaloon) {
      await saveModifierGroups(
        productId,
        modifierDrafts.map((g, i) => ({
          productId, name: g.name, required: g.required,
          maxSelections: g.maxSelections, minSelections: g.required ? 1 : 0, sortOrder: i,
        })),
        modifierDrafts.map((g) => g.options.map((o, j) => ({ groupIdx: 0, name: o.name, priceAdjustment: o.priceAdjustment, sortOrder: j }))),
      );
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

  // ── Package handlers ────────────────────────────────────────────────────
  const openAddPkg = () => {
    setEditingPackage(null);
    setPkgName(""); setPkgDescription(""); setPkgPrice(""); setPkgSessions("5");
    setPkgApplicableAll(true); setPkgApplicableIds([]); setPkgIsActive(true);
    setPkgModalVisible(true);
  };

  const openEditPkg = (pkg: PrepaidPackage) => {
    setEditingPackage(pkg);
    setPkgName(pkg.name); setPkgDescription(pkg.description);
    setPkgPrice(pkg.price.toFixed(2)); setPkgSessions(String(pkg.totalSessions));
    setPkgApplicableAll(pkg.applicableServiceIds === null);
    setPkgApplicableIds(pkg.applicableServiceIds ?? []);
    setPkgIsActive(pkg.isActive);
    setPkgModalVisible(true);
  };

  const handleSavePkg = async () => {
    const priceNum = parseFloat(pkgPrice);
    const sessionsNum = parseInt(pkgSessions, 10);
    if (!pkgName.trim() || isNaN(priceNum) || priceNum <= 0 || isNaN(sessionsNum) || sessionsNum < 1) {
      Alert.alert("Invalid input", "Enter a valid name, price, and number of sessions.");
      return;
    }
    const payload = {
      name: pkgName.trim(),
      description: pkgDescription.trim(),
      price: priceNum,
      totalSessions: sessionsNum,
      applicableServiceIds: pkgApplicableAll ? null : pkgApplicableIds.length > 0 ? pkgApplicableIds : null,
      isActive: pkgIsActive,
    };
    if (editingPackage) {
      await updatePackage({ ...editingPackage, ...payload });
    } else {
      await createPackage(payload);
    }
    setPkgModalVisible(false);
    setPackages(await loadPackages());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeletePkg = (pkg: PrepaidPackage) => {
    Alert.alert("Delete Package", `Delete "${pkg.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deletePackage(pkg.id); setPackages(await loadPackages()); } },
    ]);
  };

  // ── Bundle handlers ───────────────────────────────────────────────────────
  const openAddBundle = () => {
    setEditingBundle(null);
    setBundleName(""); setBundleDescription(""); setBundlePrice("");
    setBundleServiceIds([]); setBundleIsActive(true);
    setBundleModalVisible(true);
  };

  const openEditBundle = (b: ServiceBundle) => {
    setEditingBundle(b);
    setBundleName(b.name); setBundleDescription(b.description);
    setBundlePrice(b.price.toFixed(2));
    setBundleServiceIds(b.services.map((s) => s.serviceId));
    setBundleIsActive(b.isActive);
    setBundleModalVisible(true);
  };

  const handleSaveBundle = async () => {
    const priceNum = parseFloat(bundlePrice);
    if (!bundleName.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("Invalid input", "Enter a valid name and price.");
      return;
    }
    const selectedServices = products
      .filter((p) => bundleServiceIds.includes(p.id))
      .map((p) => ({ serviceId: p.id, serviceName: p.name }));
    const payload = {
      name: bundleName.trim(),
      description: bundleDescription.trim(),
      price: priceNum,
      services: selectedServices,
      isActive: bundleIsActive,
    };
    if (editingBundle) {
      await updateServiceBundle({ ...editingBundle, ...payload });
    } else {
      await createServiceBundle(payload);
    }
    setBundleModalVisible(false);
    setBundles(await loadServiceBundles());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteBundle = (b: ServiceBundle) => {
    Alert.alert("Delete Bundle", `Delete "${b.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteServiceBundle(b.id); setBundles(await loadServiceBundles()); } },
    ]);
  };

  const numColumns = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const topPadding = embedded ? 0 : insets.top + (Platform.OS === "web" ? 8 : 0);

  const getPrinterName = (id?: string) => {
    if (!id) return undefined;
    return printerConfigs.find((p) => p.id === id)?.name;
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const isLow = !!item.stockTracked && item.stockQuantity <= item.lowStockThreshold && item.stockQuantity > 0;
    const isOut = !!item.stockTracked && item.stockQuantity <= 0;
    const inactive = item.isActive === false;
    const pName = getPrinterName(item.printerId);
    return (
      <TouchableOpacity
        onPress={() => openEdit(item)}
        onLongPress={permissions.deleteProducts ? () => handleDelete(item) : undefined}
        activeOpacity={0.8}
        style={[styles.productCard, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: inactive ? colors.mutedForeground + "40" : isOut ? colors.destructive + "60" : isLow ? "#F39C12" + "60" : colors.border, opacity: inactive ? 0.6 : 1 }]}
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
          {pName && (
            <View style={styles.printerTag}>
              <Feather name="printer" size={8} color="rgba(255,255,255,0.9)" />
            </View>
          )}
          {inactive && (
            <View style={[styles.outBadge, { backgroundColor: colors.mutedForeground }]}>
              <Text style={styles.outBadgeText}>OFF</Text>
            </View>
          )}
          {isOut && !inactive && (
            <View style={styles.outBadge}>
              <Text style={styles.outBadgeText}>OUT</Text>
            </View>
          )}
          {isLow && !isOut && !inactive && (
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
              {item.stockTracked ? `${item.stockQuantity} in stock` : "Untracked"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>

      {/* Tab bar — only in saloon mode */}
      {isSaloon && (
        <View style={{ flexDirection: "row", marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: colors.radius, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
          {(["services", "packages", "bundles"] as const).map((tab) => {
            const active = activeTab === tab;
            const label = tab === "services" ? "Services" : tab === "packages" ? "📦 Packages" : "🎁 Bundles";
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{ flex: 1, paddingVertical: 9, alignItems: "center", backgroundColor: active ? colors.primary : colors.secondary }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : colors.mutedForeground }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {activeTab === "bundles" ? (
        /* ── Service Bundles list ───────────────────────────────────── */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {bundles.length === 0 ? (
            <EmptyState icon="package" title="No Bundles" subtitle="Tap + to create your first service bundle" />
          ) : (
            bundles.map((b) => (
              <TouchableOpacity
                key={b.id}
                onPress={() => openEditBundle(b)}
                onLongPress={() => handleDeleteBundle(b)}
                activeOpacity={0.8}
                style={{ backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: b.isActive ? "#00897B44" : colors.border, marginBottom: 10, padding: 14, opacity: b.isActive ? 1 : 0.55 }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#00897B18", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Text style={{ fontSize: 20 }}>🎁</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>{b.name}</Text>
                      {!b.isActive && (
                        <View style={{ backgroundColor: colors.mutedForeground + "22", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: colors.mutedForeground }}>INACTIVE</Text>
                        </View>
                      )}
                    </View>
                    {!!b.description && (
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }} numberOfLines={2}>{b.description}</Text>
                    )}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                      <View>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: "#00897B" }}>{formatCurrency(b.price)}</Text>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "uppercase" }}>Bundle Price</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        {b.services.length > 0 ? (
                          <Text style={{ fontSize: 12, color: colors.mutedForeground }} numberOfLines={2}>
                            {b.services.map((s) => s.serviceName).join(" + ")}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontStyle: "italic" }}>No services listed</Text>
                        )}
                        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Includes</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : activeTab === "packages" ? (
        /* ── Packages list ─────────────────────────────────────────── */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {packages.length === 0 ? (
            <EmptyState icon="package" title="No Packages" subtitle="Tap + to create your first service package" />
          ) : (
            packages.map((pkg) => (
              <TouchableOpacity
                key={pkg.id}
                onPress={() => openEditPkg(pkg)}
                onLongPress={() => handleDeletePkg(pkg)}
                activeOpacity={0.8}
                style={{ backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: pkg.isActive ? "#9C27B0" + "44" : colors.border, marginBottom: 10, padding: 14, opacity: pkg.isActive ? 1 : 0.55 }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#9C27B0" + "18", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    <Text style={{ fontSize: 20 }}>📦</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>{pkg.name}</Text>
                      {!pkg.isActive && (
                        <View style={{ backgroundColor: colors.mutedForeground + "22", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: colors.mutedForeground }}>INACTIVE</Text>
                        </View>
                      )}
                    </View>
                    {!!pkg.description && (
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 6 }} numberOfLines={2}>{pkg.description}</Text>
                    )}
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: "#9C27B0" }}>{formatCurrency(pkg.price)}</Text>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "uppercase" }}>Price</Text>
                      </View>
                      <View style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>{pkg.totalSessions}</Text>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "uppercase" }}>Sessions</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 12, color: pkg.applicableServiceIds ? "#E91E8C" : colors.mutedForeground }}>
                          {pkg.applicableServiceIds
                            ? `${pkg.applicableServiceIds.length} service${pkg.applicableServiceIds.length !== 1 ? "s" : ""}`
                            : "Any service"}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Applicable to</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        /* ── Services / Products list ──────────────────────────────── */
        <>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{productLabel}</Text>
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
            <TextInput value={search} onChangeText={setSearch} placeholder={`Search ${productLabel.toLowerCase()}...`} placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity>}
          </View>

          {loading ? null : filteredProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <EmptyState icon="package" title={filterLowStock ? "No low stock items" : "No products"} subtitle={filterLowStock ? "All products are well stocked" : "Tap + to add your first product"} />
            </View>
          ) : (
            <FlatList data={filteredProducts} renderItem={renderProduct} keyExtractor={(item) => item.id} numColumns={numColumns} key={String(numColumns)} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false} />
          )}
        </>
      )}

      <TouchableOpacity
        onPress={activeTab === "packages" ? openAddPkg : activeTab === "bundles" ? openAddBundle : openAdd}
        style={[styles.fab, { backgroundColor: activeTab === "packages" ? "#9C27B0" : activeTab === "bundles" ? "#00897B" : colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* ── Package modal ───────────────────────────────────────────── */}
      <Modal visible={pkgModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setPkgModalVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingPackage ? "Edit Package" : "New Package"}</Text>
            <TouchableOpacity onPress={handleSavePkg}><Text style={{ color: "#9C27B0", fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Package Name</Text>
            <TextInput value={pkgName} onChangeText={setPkgName} placeholder="e.g. 10 Haircuts Bundle" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Price ({CURRENCY})</Text>
                <TextInput value={pkgPrice} onChangeText={setPkgPrice} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Sessions</Text>
                <TextInput value={pkgSessions} onChangeText={setPkgSessions} placeholder="5" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (optional)</Text>
            <TextInput value={pkgDescription} onChangeText={setPkgDescription} placeholder="Short description shown to customer" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={2} style={[styles.input, styles.textArea, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Applicable Services</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => setPkgApplicableAll(true)}
                style={[styles.chip, { backgroundColor: pkgApplicableAll ? "#9C27B0" : colors.secondary, borderColor: pkgApplicableAll ? "#9C27B0" : colors.border, borderRadius: colors.radius }]}
              >
                <Text style={{ color: pkgApplicableAll ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>Any Service</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPkgApplicableAll(false)}
                style={[styles.chip, { backgroundColor: !pkgApplicableAll ? "#9C27B0" : colors.secondary, borderColor: !pkgApplicableAll ? "#9C27B0" : colors.border, borderRadius: colors.radius }]}
              >
                <Text style={{ color: !pkgApplicableAll ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>Specific Services</Text>
              </TouchableOpacity>
            </View>
            {!pkgApplicableAll && (
              <>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Tap services to include in this package:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                  {products.filter((p) => p.isActive !== false).map((p) => {
                    const selected = pkgApplicableIds.includes(p.id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setPkgApplicableIds((prev) => selected ? prev.filter((id) => id !== p.id) : [...prev, p.id])}
                        style={[styles.chip, { backgroundColor: selected ? "#E91E8C" : colors.secondary, borderColor: selected ? "#E91E8C" : colors.border, borderRadius: colors.radius, marginRight: 6 }]}
                      >
                        <Text style={{ color: selected ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <View style={[styles.toggleRow, { borderColor: pkgIsActive ? colors.border : colors.destructive + "60", borderRadius: colors.radius, backgroundColor: pkgIsActive ? undefined : colors.destructive + "08", marginTop: 20 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: pkgIsActive ? colors.foreground : colors.destructive }]}>Active</Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Inactive packages cannot be sold or redeemed at the POS.</Text>
              </View>
              <Switch value={pkgIsActive} onValueChange={setPkgIsActive} trackColor={{ true: "#9C27B0" }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Bundle modal ────────────────────────────────────────────── */}
      <Modal visible={bundleModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setBundleModalVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingBundle ? "Edit Bundle" : "New Bundle"}</Text>
            <TouchableOpacity onPress={handleSaveBundle}><Text style={{ color: "#00897B", fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Bundle Name</Text>
            <TextInput value={bundleName} onChangeText={setBundleName} placeholder="e.g. VIP Package" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Price ({CURRENCY})</Text>
            <TextInput value={bundlePrice} onChangeText={setBundlePrice} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (optional)</Text>
            <TextInput value={bundleDescription} onChangeText={setBundleDescription} placeholder="Short description shown to customer" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={2} style={[styles.input, styles.textArea, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Included Services</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>Tap services to include in this bundle:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {products.filter((p) => p.isActive !== false).map((p) => {
                const selected = bundleServiceIds.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setBundleServiceIds((prev) => selected ? prev.filter((id) => id !== p.id) : [...prev, p.id])}
                    style={[styles.chip, { backgroundColor: selected ? "#00897B" : colors.secondary, borderColor: selected ? "#00897B" : colors.border, borderRadius: colors.radius, marginRight: 6 }]}
                  >
                    <Text style={{ color: selected ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {bundleServiceIds.length > 0 && (
              <Text style={{ fontSize: 12, color: "#00897B", marginBottom: 12 }}>
                Selected: {products.filter((p) => bundleServiceIds.includes(p.id)).map((p) => p.name).join(" + ")}
              </Text>
            )}

            <View style={[styles.toggleRow, { borderColor: bundleIsActive ? colors.border : colors.destructive + "60", borderRadius: colors.radius, backgroundColor: bundleIsActive ? undefined : colors.destructive + "08", marginTop: 20 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: bundleIsActive ? colors.foreground : colors.destructive }]}>Active</Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Inactive bundles are hidden from the POS cart.</Text>
              </View>
              <Switch value={bundleIsActive} onValueChange={setBundleIsActive} trackColor={{ true: "#00897B" }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingProduct ? `Edit ${productLabel}` : `New ${productLabel}`}</Text>
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

            <View style={[styles.toggleRow, { borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Track Stock</Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Count units on hand and alert when running low. Enable after receiving stock.</Text>
              </View>
              <Switch value={stockTracked} onValueChange={setStockTracked} />
            </View>
            {stockTracked && (
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
            )}

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

            {printerConfigs.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Printer</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 8 }}>Assign a printer for this product's orders</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                  <TouchableOpacity onPress={() => setSelectedPrinterId(undefined)} style={[styles.chip, { backgroundColor: !selectedPrinterId ? colors.primary : colors.secondary, borderColor: !selectedPrinterId ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                    <Text style={{ color: !selectedPrinterId ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>Default</Text>
                  </TouchableOpacity>
                  {printerConfigs.map((p) => (
                    <TouchableOpacity key={p.id} onPress={() => setSelectedPrinterId(p.id)} style={[styles.chip, { backgroundColor: selectedPrinterId === p.id ? colors.primary : colors.secondary, borderColor: selectedPrinterId === p.id ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                      <Feather name="printer" size={12} color={selectedPrinterId === p.id ? "#fff" : colors.mutedForeground} style={{ marginRight: 4 }} />
                      <Text style={{ color: selectedPrinterId === p.id ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {isSaloon && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Duration (minutes, optional)</Text>
                <TextInput
                  value={durationMinutes}
                  onChangeText={setDurationMinutes}
                  placeholder="e.g. 45"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                />
              </>
            )}

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description (optional)</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="Short description" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={2} style={[styles.input, styles.textArea, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />

            <View style={[styles.toggleRow, { borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Allow price change at sale</Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Cashier can edit this item's price when added to cart.</Text>
              </View>
              <Switch value={priceChangeAllowed} onValueChange={setPriceChangeAllowed} />
            </View>
            <View style={[styles.toggleRow, { borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>VAT inclusive price</Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Treat the entered price as gross (includes VAT). Default: VAT is added on top.</Text>
              </View>
              <Switch value={vatInclusive} onValueChange={setVatInclusive} />
            </View>

            <View style={[styles.toggleRow, { borderColor: isActive ? colors.border : colors.destructive + "60", borderRadius: colors.radius, backgroundColor: isActive ? undefined : colors.destructive + "08" }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: isActive ? colors.foreground : colors.destructive }]}>Active</Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>{isActive ? "Visible in POS and pickers." : "Inactive — hidden from POS. Still saved for history."}</Text>
              </View>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: colors.destructive + "80", true: colors.primary }} />
            </View>

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

            {!isSaloon && (
              <View style={[styles.ingredientSection, { borderColor: colors.border, borderRadius: colors.radius, marginTop: 24 }]}>
                <View style={styles.ingredientHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.ingredientIconWrap, { backgroundColor: "#E67E22" + "18" }]}>
                      <Feather name="sliders" size={14} color="#E67E22" />
                    </View>
                    <Text style={[styles.ingredientTitle, { color: colors.foreground }]}>Modifier Groups</Text>
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{modifierDrafts.length} group{modifierDrafts.length !== 1 ? "s" : ""}</Text>
                </View>

                {modifierDrafts.length > 0 && (
                  <View style={{ paddingHorizontal: 12 }}>
                    {modifierDrafts.map((g, idx) => (
                      <View key={idx} style={[styles.recipeItemRow, { borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{g.name}</Text>
                            <View style={{ backgroundColor: g.required ? colors.primary + "20" : colors.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: g.required ? colors.primary : colors.mutedForeground, fontSize: 10, fontWeight: "600" }}>{g.required ? "Required" : "Optional"}</Text>
                            </View>
                            <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{g.maxSelections === 1 ? "Single" : "Multi"}</Text>
                          </View>
                          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                            {g.options.map((o) => o.name).join(", ")}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 12 }}>
                          <TouchableOpacity onPress={() => openGroupForm(idx)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Feather name="edit-2" size={14} color={colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setModifierDrafts((prev) => prev.filter((_, i) => i !== idx))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Feather name="trash-2" size={14} color={colors.destructive} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {!showGroupForm ? (
                  <TouchableOpacity
                    onPress={() => openGroupForm(null)}
                    style={[styles.addIngBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
                  >
                    <Feather name="plus" size={14} color="#E67E22" />
                    <Text style={{ color: "#E67E22", fontSize: 13, fontWeight: "600", marginLeft: 6 }}>Add Group</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ padding: 12 }}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Group Name</Text>
                    <TextInput
                      value={groupFormName}
                      onChangeText={setGroupFormName}
                      placeholder="e.g. Size, Add-ons, Extras"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                    />

                    <View style={[styles.toggleRow, { borderColor: colors.border, borderRadius: colors.radius }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Required</Text>
                        <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Customer must choose from this group</Text>
                      </View>
                      <Switch value={groupFormRequired} onValueChange={setGroupFormRequired} />
                    </View>

                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Selection Type</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                      <TouchableOpacity
                        onPress={() => setGroupFormMaxSel(1)}
                        style={[styles.chip, { flex: 1, justifyContent: "center", backgroundColor: groupFormMaxSel === 1 ? colors.primary : colors.secondary, borderColor: groupFormMaxSel === 1 ? colors.primary : colors.border, borderRadius: colors.radius }]}
                      >
                        <Text style={{ color: groupFormMaxSel === 1 ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 12 }}>Single choice</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setGroupFormMaxSel(99)}
                        style={[styles.chip, { flex: 1, justifyContent: "center", backgroundColor: groupFormMaxSel > 1 ? colors.primary : colors.secondary, borderColor: groupFormMaxSel > 1 ? colors.primary : colors.border, borderRadius: colors.radius }]}
                      >
                        <Text style={{ color: groupFormMaxSel > 1 ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 12 }}>Multi-select</Text>
                      </TouchableOpacity>
                    </View>

                    {groupFormOptions.length > 0 && (
                      <View style={{ marginBottom: 8 }}>
                        {groupFormOptions.map((opt, i) => (
                          <View key={i} style={[styles.recipeItemRow, { borderColor: colors.border }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{opt.name}</Text>
                              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{opt.priceAdjustment === 0 ? "Free" : `${opt.priceAdjustment > 0 ? "+" : ""}${CURRENCY} ${Math.abs(opt.priceAdjustment).toFixed(2)}`}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setGroupFormOptions((prev) => prev.filter((_, j) => j !== i))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                              <Feather name="x" size={14} color={colors.destructive} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                      <TextInput
                        value={optionDraftName}
                        onChangeText={setOptionDraftName}
                        placeholder="Option name"
                        placeholderTextColor={colors.mutedForeground}
                        style={[styles.input, { flex: 2, margin: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                        onSubmitEditing={handleAddOptionDraft}
                        returnKeyType="done"
                      />
                      <TextInput
                        value={optionDraftPrice}
                        onChangeText={setOptionDraftPrice}
                        placeholder="±0.00"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="decimal-pad"
                        style={[styles.input, { width: 70, margin: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                      />
                      <TouchableOpacity
                        onPress={handleAddOptionDraft}
                        style={{ backgroundColor: "#E67E22", paddingHorizontal: 12, borderRadius: colors.radius, justifyContent: "center" }}
                      >
                        <Feather name="plus" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        onPress={resetGroupForm}
                        style={{ flex: 1, padding: 10, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}
                      >
                        <Text style={{ color: colors.mutedForeground, fontWeight: "600" }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleSaveGroupForm}
                        style={{ flex: 2, padding: 10, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: "center" }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "700" }}>{editingGroupIdx === null ? "Add Group" : "Update Group"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {!isSaloon && <View style={[styles.ingredientSection, { borderColor: colors.border, borderRadius: colors.radius, marginTop: 24 }]}>
              <View style={styles.ingredientHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.ingredientIconWrap, { backgroundColor: "#8E44AD" + "18" }]}>
                    <Feather name="book-open" size={14} color="#8E44AD" />
                  </View>
                  <Text style={[styles.ingredientTitle, { color: colors.foreground }]}>Ingredients</Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{recipeItems.length} item{recipeItems.length !== 1 ? "s" : ""}</Text>
              </View>

              {recipeItems.length > 0 && (
                <View style={{ paddingHorizontal: 12 }}>
                  {recipeItems.map((ri, idx) => (
                    <View key={ri.ingredientId} style={[styles.recipeItemRow, { borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{ri.ingredientName}</Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                          {ri.quantity} {ingredients.find((i) => i.id === ri.ingredientId)?.unit ?? ""}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setRecipeItems((prev) => prev.filter((_, i) => i !== idx))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Feather name="x-circle" size={16} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {ingredients.length > 0 ? (
                <View style={{ padding: 12 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Add Ingredient</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {ingredients.filter((i) => !recipeItems.some((r) => r.ingredientId === i.id)).map((ing) => (
                      <TouchableOpacity
                        key={ing.id}
                        onPress={() => setRecipeIngId(ing.id)}
                        style={[styles.chip, { borderColor: recipeIngId === ing.id ? colors.primary : colors.border, backgroundColor: recipeIngId === ing.id ? colors.primary + "18" : "transparent", borderRadius: colors.radius, marginRight: 6 }]}
                      >
                        <Text style={{ color: recipeIngId === ing.id ? colors.primary : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>{ing.name} ({ing.unit})</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {recipeIngId !== "" && (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput
                        value={recipeIngQty}
                        onChangeText={setRecipeIngQty}
                        placeholder="Qty"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="decimal-pad"
                        style={[styles.input, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, paddingVertical: 10 }]}
                      />
                      <TouchableOpacity onPress={handleAddRecipeItem} style={[styles.addIngBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                        <Feather name="plus" size={14} color="#fff" />
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ padding: 12, alignItems: "center" }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    Add ingredients in Back Office first
                  </Text>
                </View>
              )}
            </View>}
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
  printerTag: { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(155,89,182,0.5)", borderRadius: 4, padding: 3 },
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
  toggleRow: { flexDirection: "row", alignItems: "center", padding: 12, marginTop: 16, borderWidth: 1, gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleHint: { fontSize: 11, marginTop: 2 },
  chips: { flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, marginRight: 8, flexDirection: "row", alignItems: "center" },
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
  ingredientSection: { borderWidth: 1, overflow: "hidden" },
  ingredientHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0 },
  ingredientIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  ingredientTitle: { fontSize: 14, fontWeight: "700" },
  recipeItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, gap: 8 },
  addIngBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, gap: 4 },
});

export default ProductsScreen;
