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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BusinessSettingsModal } from "@/components/BusinessSettingsModal";
import { useDatabase } from "@/context/DatabaseCore";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { generateReceiptHTML } from "@/lib/receiptTemplate";
import type {
  BusinessSettings,
  Category,
  CustomerDisplaySettings,
  Ingredient,
  KOTSettings,
  PrinterSettings,
  Product,
  RecipeIngredient,
  ReceiptDesignSettings,
  Rider,
  Staff,
  TaxGroup,
} from "@/types";
import {
  DEFAULT_CUSTOMER_DISPLAY,
  DEFAULT_KOT_SETTINGS,
  DEFAULT_PRINTER_SETTINGS,
  DEFAULT_RECEIPT_DESIGN,
  PRODUCT_COLORS,
  formatCurrency,
} from "@/types";

type Section =
  | "menu"
  | "categories"
  | "receipt"
  | "printer"
  | "kot"
  | "display"
  | "staff"
  | "tax"
  | "business"
  | "riders"
  | "ingredients"
  | "recipes";

interface SectionCard {
  id: Section;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
}

const SECTIONS: SectionCard[] = [
  { id: "categories", icon: "layers", title: "Categories", subtitle: "Manage product categories", color: "#4F8EF7" },
  { id: "riders", icon: "truck", title: "Delivery Riders", subtitle: "Manage delivery riders", color: "#3498DB" },
  { id: "ingredients", icon: "package", title: "Ingredients", subtitle: "Inventory & stock levels", color: "#16A085" },
  { id: "recipes", icon: "book-open", title: "Recipes", subtitle: "Link products to ingredients", color: "#8E44AD" },
  { id: "receipt", icon: "file-text", title: "Receipt Designer", subtitle: "Customize receipt layout", color: "#2ECC71" },
  { id: "printer", icon: "printer", title: "Printer Settings", subtitle: "Paper size & auto-print", color: "#9B59B6" },
  { id: "kot", icon: "clipboard", title: "KOT Settings", subtitle: "Kitchen ticket routing", color: "#E67E22" },
  { id: "display", icon: "monitor", title: "Customer Display", subtitle: "Customer-facing screen", color: "#1ABC9C" },
  { id: "staff", icon: "user-check", title: "Staff Management", subtitle: "Manage cashiers & admins", color: "#E74C3C" },
  { id: "tax", icon: "percent", title: "Tax Groups", subtitle: "VAT rates & tax groups", color: "#F39C12" },
  { id: "business", icon: "briefcase", title: "Business Settings", subtitle: "Company info & loyalty", color: "#6C63FF" },
];

export default function BackOfficeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const { currentStaff, refreshStaffCheck, logout } = useStaff();
  const [section, setSection] = useState<Section>("menu");

  const [categories, setCategories] = useState<Category[]>([]);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(PRODUCT_COLORS[0]);
  const [catOrder, setCatOrder] = useState("0");
  const [catImageUri, setCatImageUri] = useState<string | undefined>(undefined);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);

  const [receiptDesign, setReceiptDesign] = useState<ReceiptDesignSettings>({ ...DEFAULT_RECEIPT_DESIGN });
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>({ ...DEFAULT_PRINTER_SETTINGS });
  const [kotSettings, setKotSettings] = useState<KOTSettings>({ ...DEFAULT_KOT_SETTINGS });
  const [customerDisplay, setCustomerDisplay] = useState<CustomerDisplaySettings>({ ...DEFAULT_CUSTOMER_DISPLAY });
  const [bizSettings, setBizSettings] = useState<BusinessSettings | null>(null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffName, setStaffName] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [staffRole, setStaffRole] = useState<"admin" | "cashier">("cashier");
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showStaffModal, setShowStaffModal] = useState(false);

  const [taxList, setTaxList] = useState<TaxGroup[]>([]);
  const [taxName, setTaxName] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [editingTax, setEditingTax] = useState<TaxGroup | null>(null);
  const [showTaxModal, setShowTaxModal] = useState(false);

  const [showBizSettings, setShowBizSettings] = useState(false);

  const [riderList, setRiderList] = useState<Rider[]>([]);
  const [riderName, setRiderName] = useState("");
  const [riderPhone, setRiderPhone] = useState("");
  const [editingRider, setEditingRider] = useState<Rider | null>(null);
  const [showRiderModal, setShowRiderModal] = useState(false);

  const [ingredientList, setIngredientList] = useState<Ingredient[]>([]);
  const [ingName, setIngName] = useState("");
  const [ingUnit, setIngUnit] = useState("g");
  const [ingStock, setIngStock] = useState("0");
  const [ingCost, setIngCost] = useState("0");
  const [ingLowStock, setIngLowStock] = useState("10");
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [showIngModal, setShowIngModal] = useState(false);

  const [productsList, setProductsList] = useState<Product[]>([]);
  const [recipeProductId, setRecipeProductId] = useState<string | null>(null);
  const [recipeItems, setRecipeItems] = useState<{ ingredientId: string; ingredientName: string; quantity: number }[]>([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeIngId, setRecipeIngId] = useState("");
  const [recipeIngQty, setRecipeIngQty] = useState("");

  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;

  const loadAllSettings = useCallback(async () => {
    const biz = await db.loadBusinessSettings();
    setBizSettings(biz);
    setReceiptDesign(biz.receiptDesign ?? { ...DEFAULT_RECEIPT_DESIGN });
    setPrinterSettings(biz.printerSettings ?? { ...DEFAULT_PRINTER_SETTINGS });
    setKotSettings(biz.kotSettings ?? { ...DEFAULT_KOT_SETTINGS });
    setCustomerDisplay(biz.customerDisplay ?? { ...DEFAULT_CUSTOMER_DISPLAY });
  }, [db]);

  const loadCats = useCallback(async () => {
    const cats = await db.loadCategories();
    setCategories(cats);
  }, [db]);

  useEffect(() => {
    loadAllSettings();
    loadCats();
  }, [loadAllSettings, loadCats]);

  const saveSettings = useCallback(async (
    rd?: ReceiptDesignSettings,
    ps?: PrinterSettings,
    ks?: KOTSettings,
    cd?: CustomerDisplaySettings
  ) => {
    const biz = bizSettings ?? await db.loadBusinessSettings();
    const updated: BusinessSettings = {
      ...biz,
      receiptDesign: rd ?? receiptDesign,
      printerSettings: ps ?? printerSettings,
      kotSettings: ks ?? kotSettings,
      customerDisplay: cd ?? customerDisplay,
    };
    await db.saveBusinessSettings(updated);
    setBizSettings(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [bizSettings, receiptDesign, printerSettings, kotSettings, customerDisplay, db]);

  const pickCatImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow photo library access to add category images.");
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
          setCatImageUri(`data:${mimeType};base64,${asset.base64}`);
        } else {
          Alert.alert("Image Error", "Could not process the selected image. Please try another.");
        }
      }
    } catch {
      Alert.alert("Error", "Failed to open image picker. Please try again.");
    }
  };

  const handleSaveCat = async () => {
    if (!catName.trim()) { Alert.alert("Invalid", "Category name is required."); return; }
    const order = parseInt(catOrder, 10) || 0;
    if (editingCat) {
      await db.updateCategory({ ...editingCat, name: catName.trim(), colorHex: catColor, sortOrder: order, imageUri: catImageUri });
    } else {
      await db.createCategory({ name: catName.trim(), colorHex: catColor, sortOrder: order, imageUri: catImageUri });
    }
    await loadCats();
    setShowCatModal(false);
    setEditingCat(null);
    setCatName("");
    setCatColor(PRODUCT_COLORS[0]);
    setCatOrder("0");
    setCatImageUri(undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteCat = (cat: Category) => {
    Alert.alert("Delete Category", `Remove "${cat.name}"? Products in this category won't be deleted.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await db.deleteCategory(cat.id); await loadCats(); } },
    ]);
  };

  const openEditCat = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatColor(cat.colorHex);
    setCatOrder(String(cat.sortOrder));
    setCatImageUri(cat.imageUri);
    setShowCatModal(true);
  };

  const openAddCat = () => {
    setEditingCat(null);
    setCatName("");
    setCatColor(PRODUCT_COLORS[0]);
    setCatOrder(String(categories.length + 1));
    setCatImageUri(undefined);
    setShowCatModal(true);
  };

  const loadStaffList = async () => {
    const list = await db.loadStaff();
    setStaffList(list);
  };

  const handleSaveStaff = async () => {
    if (!staffName.trim() || !staffPin.trim() || staffPin.length < 4) { Alert.alert("Invalid", "Name and 4+ digit PIN required."); return; }
    if (editingStaff) { await db.updateStaff({ ...editingStaff, name: staffName.trim(), pin: staffPin, role: staffRole }); }
    else { await db.createStaff({ name: staffName.trim(), pin: staffPin, role: staffRole }); }
    await loadStaffList();
    setEditingStaff(null);
    setStaffName("");
    setStaffPin("");
    setStaffRole("cashier");
    setShowStaffModal(false);
    await refreshStaffCheck();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteStaff = (staff: Staff) => {
    Alert.alert("Delete Staff", `Remove "${staff.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await db.deleteStaff(staff.id);
        await loadStaffList();
        await refreshStaffCheck();
      }},
    ]);
  };

  const loadTaxList = async () => {
    const list = await db.loadTaxGroups();
    setTaxList(list);
  };

  const handleSaveTax = async () => {
    const rate = parseFloat(taxRate);
    if (!taxName.trim() || isNaN(rate) || rate < 0 || rate > 100) { Alert.alert("Invalid", "Name and valid rate (0-100) required."); return; }
    if (editingTax) { await db.updateTaxGroup({ ...editingTax, name: taxName.trim(), rate: rate / 100 }); }
    else { await db.createTaxGroup({ name: taxName.trim(), rate: rate / 100 }); }
    await loadTaxList();
    setEditingTax(null);
    setTaxName("");
    setTaxRate("");
    setShowTaxModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteTax = (tg: TaxGroup) => {
    Alert.alert("Delete Tax Group", `Remove "${tg.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await db.deleteTaxGroup(tg.id); await loadTaxList(); } },
    ]);
  };

  const loadRiderList = async () => { const list = await db.loadRiders(); setRiderList(list); };

  const handleSaveRider = async () => {
    if (!riderName.trim()) { Alert.alert("Invalid", "Rider name is required."); return; }
    try {
      if (editingRider) {
        await db.updateRider({ ...editingRider, name: riderName.trim(), phone: riderPhone.trim() });
      } else {
        await db.createRider({ name: riderName.trim(), phone: riderPhone.trim(), vehicleInfo: "" });
      }
      await loadRiderList();
      setEditingRider(null); setRiderName(""); setRiderPhone(""); setShowRiderModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save rider");
    }
  };

  const handleDeleteRider = (rider: Rider) => {
    Alert.alert("Delete Rider", `Remove "${rider.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await db.deleteRider(rider.id); await loadRiderList(); } },
    ]);
  };

  const loadIngredientList = async () => { const list = await db.loadIngredients(); setIngredientList(list); };

  const handleSaveIngredient = async () => {
    if (!ingName.trim()) { Alert.alert("Invalid", "Ingredient name is required."); return; }
    const stock = parseFloat(ingStock) || 0;
    const cost = parseFloat(ingCost) || 0;
    const low = parseFloat(ingLowStock) || 10;
    try {
      if (editingIngredient) {
        await db.updateIngredient({ ...editingIngredient, name: ingName.trim(), unit: ingUnit.trim(), stockQuantity: stock, costPerUnit: cost, lowStockThreshold: low });
      } else {
        await db.createIngredient({ name: ingName.trim(), unit: ingUnit.trim() || "g", stockQuantity: stock, costPerUnit: cost, lowStockThreshold: low });
      }
      await loadIngredientList();
      setEditingIngredient(null); setIngName(""); setIngUnit("g"); setIngStock("0"); setIngCost("0"); setIngLowStock("10"); setShowIngModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save ingredient");
    }
  };

  const handleDeleteIngredient = (ing: Ingredient) => {
    Alert.alert("Delete Ingredient", `Remove "${ing.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await db.deleteIngredient(ing.id); await loadIngredientList(); } },
    ]);
  };

  const loadProductsList = async () => { const list = await db.loadProducts(); setProductsList(list); };

  const openRecipeEditor = async (product: Product) => {
    setRecipeProductId(product.id);
    const items = await db.loadRecipeIngredients(product.id);
    setRecipeItems(items.map((ri) => ({ ingredientId: ri.ingredientId, ingredientName: ri.ingredientName ?? "", quantity: ri.quantity })));
    setRecipeIngId(""); setRecipeIngQty("");
    setShowRecipeModal(true);
  };

  const handleAddRecipeItem = () => {
    if (!recipeIngId) return;
    const qty = parseFloat(recipeIngQty);
    if (isNaN(qty) || qty <= 0) { Alert.alert("Invalid", "Enter a valid quantity."); return; }
    if (recipeItems.some((r) => r.ingredientId === recipeIngId)) { Alert.alert("Duplicate", "This ingredient is already added."); return; }
    const ing = ingredientList.find((i) => i.id === recipeIngId);
    if (!ing) return;
    setRecipeItems((prev) => [...prev, { ingredientId: ing.id, ingredientName: ing.name, quantity: qty }]);
    setRecipeIngId(""); setRecipeIngQty("");
  };

  const handleSaveRecipe = async () => {
    if (!recipeProductId) return;
    try {
      await db.saveRecipeIngredients(recipeProductId, recipeItems.map((ri) => ({
        productId: recipeProductId,
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredientName,
        quantity: ri.quantity,
      })));
      setShowRecipeModal(false);
      setRecipeProductId(null);
      setRecipeItems([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save recipe");
    }
  };

  const renderHeader = (title: string) => (
    <View style={[s.sectionHeader, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => setSection("menu")} style={s.backBtn}>
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[s.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={{ width: 30 }} />
    </View>
  );

  const renderField = (label: string, value: string, onChange: (v: string) => void, placeholder: string, kbType?: "default" | "decimal-pad" | "number-pad") => (
    <View style={s.fieldWrap}>
      <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground} keyboardType={kbType}
        style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
      />
    </View>
  );

  const renderSwitch = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={[s.switchRow, { borderBottomColor: colors.border }]}>
      <Text style={[s.switchLabel, { color: colors.foreground }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.primary }} />
    </View>
  );

  const renderMenu = () => (
    <ScrollView style={s.menuScroll} contentContainerStyle={s.menuContent} showsVerticalScrollIndicator={false}>
      <Text style={[s.menuTitle, { color: colors.foreground }]}>Back Office</Text>
      <Text style={[s.menuSub, { color: colors.mutedForeground }]}>Manage your POS settings</Text>

      <View style={s.cardsGrid}>
        {SECTIONS.map((sec) => (
          <TouchableOpacity
            key={sec.id}
            onPress={() => {
              setSection(sec.id);
              if (sec.id === "staff") loadStaffList();
              if (sec.id === "tax") loadTaxList();
              if (sec.id === "riders") loadRiderList();
              if (sec.id === "ingredients") loadIngredientList();
              if (sec.id === "recipes") { loadProductsList(); loadIngredientList(); }
              if (sec.id === "business") setShowBizSettings(true);
            }}
            style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <View style={[s.cardIconWrap, { backgroundColor: sec.color + "18" }]}>
              <Feather name={sec.icon as any} size={22} color={sec.color} />
            </View>
            <Text style={[s.cardTitle, { color: colors.foreground }]}>{sec.title}</Text>
            <Text style={[s.cardSub, { color: colors.mutedForeground }]}>{sec.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {currentStaff && (
        <TouchableOpacity onPress={logout} style={[s.logoutBtn, { borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="log-out" size={16} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, marginLeft: 8, fontWeight: "600" }}>Lock / Switch Staff</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderCategories = () => (
    <View style={s.sectionContent}>
      {renderHeader("Categories")}
      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={<Text style={[s.emptyText, { color: colors.mutedForeground }]}>No categories yet. Tap + to add one.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openEditCat(item)} style={[s.listItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            {item.imageUri ? (
              <Image source={{ uri: item.imageUri }} style={s.catImageThumb} resizeMode="cover" />
            ) : (
              <View style={[s.catColorDot, { backgroundColor: item.colorHex }]} />
            )}
            <View style={s.listItemInfo}>
              <Text style={[s.listItemTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[s.listItemSub, { color: colors.mutedForeground }]}>Order: {item.sortOrder}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteCat(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity onPress={openAddCat} style={[s.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderReceiptDesigner = () => {
    const previewHtml = bizSettings ? generateReceiptHTML(
      { id: "preview", invoiceNumber: "INV-20260101-0001", createdAt: Date.now(), subtotal: 100, vatRate: 0.05, vatAmount: 5, total: 105, paymentMethod: "Card", staffName: "Demo Staff" },
      [{ id: "i1", saleId: "preview", productId: "p1", productName: "Sample Item", productPrice: 50, quantity: 2, lineTotal: 100 }],
      bizSettings,
      receiptDesign
    ) : "";

    return (
      <View style={s.sectionContent}>
        {renderHeader("Receipt Designer")}
        <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>
          {renderField("Header Text", receiptDesign.headerText, (v) => setReceiptDesign({ ...receiptDesign, headerText: v }), "Custom header text")}
          {renderField("Footer Text", receiptDesign.footerText, (v) => setReceiptDesign({ ...receiptDesign, footerText: v }), "Thank you message")}
          {renderSwitch("Show TRN on Receipt", receiptDesign.showTrn, (v) => setReceiptDesign({ ...receiptDesign, showTrn: v }))}
          {renderSwitch("Show Logo", receiptDesign.showLogo, (v) => setReceiptDesign({ ...receiptDesign, showLogo: v }))}

          <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Font Size</Text>
          <View style={s.chipRow}>
            {(["small", "medium", "large"] as const).map((sz) => (
              <TouchableOpacity key={sz} onPress={() => setReceiptDesign({ ...receiptDesign, fontSize: sz })}
                style={[s.chip, { backgroundColor: receiptDesign.fontSize === sz ? colors.primary : colors.secondary, borderColor: receiptDesign.fontSize === sz ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                <Text style={{ color: receiptDesign.fontSize === sz ? "#fff" : colors.mutedForeground, fontWeight: "600", textTransform: "capitalize" }}>{sz}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Paper Width</Text>
          <View style={s.chipRow}>
            {(["58mm", "80mm"] as const).map((pw) => (
              <TouchableOpacity key={pw} onPress={() => setReceiptDesign({ ...receiptDesign, paperWidth: pw })}
                style={[s.chip, { backgroundColor: receiptDesign.paperWidth === pw ? colors.primary : colors.secondary, borderColor: receiptDesign.paperWidth === pw ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                <Text style={{ color: receiptDesign.paperWidth === pw ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>{pw}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={() => saveSettings(receiptDesign)} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <Feather name="save" size={16} color="#fff" />
            <Text style={s.saveBtnText}>Save Receipt Settings</Text>
          </TouchableOpacity>

          {Platform.OS === "web" && previewHtml ? (
            <View style={[s.previewWrap, { borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Preview</Text>
              <View style={[s.previewBox, { backgroundColor: "#fff", borderRadius: colors.radius }]}>
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} style={{ transform: "scale(0.75)", transformOrigin: "top center", maxWidth: 300 }} />
              </View>
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  };

  const renderPrinterSettings = () => (
    <View style={s.sectionContent}>
      {renderHeader("Printer Settings")}
      <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>
        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Paper Width</Text>
        <View style={s.chipRow}>
          {(["58mm", "80mm"] as const).map((pw) => (
            <TouchableOpacity key={pw} onPress={() => setPrinterSettings({ ...printerSettings, paperWidth: pw })}
              style={[s.chip, { backgroundColor: printerSettings.paperWidth === pw ? colors.primary : colors.secondary, borderColor: printerSettings.paperWidth === pw ? colors.primary : colors.border, borderRadius: colors.radius }]}>
              <Text style={{ color: printerSettings.paperWidth === pw ? "#fff" : colors.mutedForeground, fontWeight: "600" }}>{pw}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {renderSwitch("Auto-print Receipt on Sale", printerSettings.autoPrintReceipt, (v) => setPrinterSettings({ ...printerSettings, autoPrintReceipt: v }))}
        {renderSwitch("Auto-print Kitchen Ticket", printerSettings.autoPrintKOT, (v) => setPrinterSettings({ ...printerSettings, autoPrintKOT: v }))}

        <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Print Method</Text>
        <View style={s.chipRow}>
          {(["system", "direct"] as const).map((pm) => (
            <TouchableOpacity key={pm} onPress={() => setPrinterSettings({ ...printerSettings, printMethod: pm })}
              style={[s.chip, { backgroundColor: printerSettings.printMethod === pm ? colors.primary : colors.secondary, borderColor: printerSettings.printMethod === pm ? colors.primary : colors.border, borderRadius: colors.radius }]}>
              <Text style={{ color: printerSettings.printMethod === pm ? "#fff" : colors.mutedForeground, fontWeight: "600", textTransform: "capitalize" }}>
                {pm === "system" ? "System Dialog" : "Direct IP"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {printerSettings.printMethod === "direct" && renderField("Printer IP Address", printerSettings.printerIp, (v) => setPrinterSettings({ ...printerSettings, printerIp: v }), "192.168.1.100")}

        <TouchableOpacity onPress={() => saveSettings(undefined, printerSettings)} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
          <Feather name="save" size={16} color="#fff" />
          <Text style={s.saveBtnText}>Save Printer Settings</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );

  const renderKOTSettings = () => (
    <View style={s.sectionContent}>
      {renderHeader("KOT Settings")}
      <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>
        {renderSwitch("Enable Kitchen Tickets", kotSettings.enabled, (v) => setKotSettings({ ...kotSettings, enabled: v }))}

        {kotSettings.enabled && (
          <>
            {renderSwitch("Show Price on KOT", kotSettings.showPrice, (v) => setKotSettings({ ...kotSettings, showPrice: v }))}
            {renderSwitch("Show Notes Field", kotSettings.showNotes, (v) => setKotSettings({ ...kotSettings, showNotes: v }))}

            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Font Size</Text>
            <View style={s.chipRow}>
              {(["small", "medium", "large"] as const).map((sz) => (
                <TouchableOpacity key={sz} onPress={() => setKotSettings({ ...kotSettings, fontSize: sz })}
                  style={[s.chip, { backgroundColor: kotSettings.fontSize === sz ? colors.primary : colors.secondary, borderColor: kotSettings.fontSize === sz ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                  <Text style={{ color: kotSettings.fontSize === sz ? "#fff" : colors.mutedForeground, fontWeight: "600", textTransform: "capitalize" }}>{sz}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 20 }]}>Category Routing (Station Names)</Text>
            <Text style={[s.hintText, { color: colors.mutedForeground }]}>Assign each category to a kitchen station/printer</Text>
            {categories.map((cat) => (
              <View key={cat.id} style={s.routingRow}>
                <View style={[s.catColorDot, { backgroundColor: cat.colorHex }]} />
                <Text style={[s.routingCatName, { color: colors.foreground }]}>{cat.name}</Text>
                <TextInput
                  value={kotSettings.categoryRouting[cat.name] ?? ""}
                  onChangeText={(v) => setKotSettings({ ...kotSettings, categoryRouting: { ...kotSettings.categoryRouting, [cat.name]: v } })}
                  placeholder="Station name"
                  placeholderTextColor={colors.mutedForeground}
                  style={[s.routingInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                />
              </View>
            ))}
          </>
        )}

        <TouchableOpacity onPress={() => saveSettings(undefined, undefined, kotSettings)} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
          <Feather name="save" size={16} color="#fff" />
          <Text style={s.saveBtnText}>Save KOT Settings</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );

  const renderCustomerDisplay = () => (
    <View style={s.sectionContent}>
      {renderHeader("Customer Display")}
      <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>
        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Display Mode</Text>
        <View style={s.chipRow}>
          {(["mirror", "summary", "custom"] as const).map((dm) => (
            <TouchableOpacity key={dm} onPress={() => setCustomerDisplay({ ...customerDisplay, displayMode: dm })}
              style={[s.chip, { backgroundColor: customerDisplay.displayMode === dm ? colors.primary : colors.secondary, borderColor: customerDisplay.displayMode === dm ? colors.primary : colors.border, borderRadius: colors.radius }]}>
              <Text style={{ color: customerDisplay.displayMode === dm ? "#fff" : colors.mutedForeground, fontWeight: "600", textTransform: "capitalize" }}>{dm}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {renderSwitch("Show Item List", customerDisplay.showItemList, (v) => setCustomerDisplay({ ...customerDisplay, showItemList: v }))}
        {renderSwitch("Show Total", customerDisplay.showTotal, (v) => setCustomerDisplay({ ...customerDisplay, showTotal: v }))}
        {renderField("Welcome Message", customerDisplay.welcomeMessage, (v) => setCustomerDisplay({ ...customerDisplay, welcomeMessage: v }), "Welcome!")}
        {renderField("Thank You Message", customerDisplay.thankYouMessage, (v) => setCustomerDisplay({ ...customerDisplay, thankYouMessage: v }), "Thank you!")}

        <TouchableOpacity onPress={() => saveSettings(undefined, undefined, undefined, customerDisplay)} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
          <Feather name="save" size={16} color="#fff" />
          <Text style={s.saveBtnText}>Save Display Settings</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );

  const renderStaff = () => (
    <View style={s.sectionContent}>
      {renderHeader("Staff Management")}
      <FlatList
        data={staffList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={<Text style={[s.emptyText, { color: colors.mutedForeground }]}>No staff members. Tap + to add one.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => { setEditingStaff(item); setStaffName(item.name); setStaffPin(item.pin); setStaffRole(item.role); setShowStaffModal(true); }}
            style={[s.listItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[s.cardIconWrap, { backgroundColor: "#E74C3C18" }]}>
              <Feather name="user" size={18} color="#E74C3C" />
            </View>
            <View style={s.listItemInfo}>
              <Text style={[s.listItemTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[s.listItemSub, { color: colors.mutedForeground }]}>{item.role} {!item.active ? "(inactive)" : ""}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteStaff(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity onPress={() => { setEditingStaff(null); setStaffName(""); setStaffPin(""); setStaffRole("cashier"); setShowStaffModal(true); }}
        style={[s.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderTax = () => (
    <View style={s.sectionContent}>
      {renderHeader("Tax Groups")}
      <FlatList
        data={taxList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={<Text style={[s.emptyText, { color: colors.mutedForeground }]}>No tax groups. Tap + to add one.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => { setEditingTax(item); setTaxName(item.name); setTaxRate(String(item.rate * 100)); setShowTaxModal(true); }}
            style={[s.listItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[s.cardIconWrap, { backgroundColor: "#F39C1218" }]}>
              <Feather name="percent" size={18} color="#F39C12" />
            </View>
            <View style={s.listItemInfo}>
              <Text style={[s.listItemTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[s.listItemSub, { color: colors.mutedForeground }]}>{(item.rate * 100).toFixed(1)}%</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteTax(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity onPress={() => { setEditingTax(null); setTaxName(""); setTaxRate(""); setShowTaxModal(true); }}
        style={[s.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderRiders = () => (
    <View style={s.sectionContent}>
      {renderHeader("Delivery Riders")}
      <FlatList
        data={riderList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={<Text style={[s.emptyText, { color: colors.mutedForeground }]}>No riders yet. Tap + to add one.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => { setEditingRider(item); setRiderName(item.name); setRiderPhone(item.phone || ""); setShowRiderModal(true); }}
            style={[s.listItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[s.cardIconWrap, { backgroundColor: "#3498DB18" }]}>
              <Feather name="truck" size={18} color="#3498DB" />
            </View>
            <View style={s.listItemInfo}>
              <Text style={[s.listItemTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[s.listItemSub, { color: colors.mutedForeground }]}>{item.phone || "No phone"} · {item.active ? "Active" : "Inactive"}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteRider(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity onPress={() => { setEditingRider(null); setRiderName(""); setRiderPhone(""); setShowRiderModal(true); }}
        style={[s.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderIngredients = () => {
    const lowStockItems = ingredientList.filter((i) => i.stockQuantity <= i.lowStockThreshold);
    return (
      <View style={s.sectionContent}>
        {renderHeader("Ingredients")}
        {lowStockItems.length > 0 && (
          <View style={[s.lowStockBanner, { backgroundColor: "#E74C3C18", borderBottomColor: colors.border }]}>
            <Feather name="alert-triangle" size={14} color="#E74C3C" />
            <Text style={{ color: "#E74C3C", fontSize: 12, fontWeight: "600", marginLeft: 6 }}>
              {lowStockItems.length} ingredient{lowStockItems.length > 1 ? "s" : ""} low on stock
            </Text>
          </View>
        )}
        <FlatList
          data={ingredientList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={<Text style={[s.emptyText, { color: colors.mutedForeground }]}>No ingredients yet. Tap + to add one.</Text>}
          renderItem={({ item }) => {
            const isLow = item.stockQuantity <= item.lowStockThreshold;
            return (
              <TouchableOpacity onPress={() => {
                setEditingIngredient(item); setIngName(item.name); setIngUnit(item.unit);
                setIngStock(String(item.stockQuantity)); setIngCost(String(item.costPerUnit));
                setIngLowStock(String(item.lowStockThreshold)); setShowIngModal(true);
              }}
                style={[s.listItem, { backgroundColor: colors.card, borderColor: isLow ? "#E74C3C" : colors.border, borderRadius: colors.radius }]}>
                <View style={[s.cardIconWrap, { backgroundColor: isLow ? "#E74C3C18" : "#16A08518" }]}>
                  <Feather name="package" size={18} color={isLow ? "#E74C3C" : "#16A085"} />
                </View>
                <View style={s.listItemInfo}>
                  <Text style={[s.listItemTitle, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[s.listItemSub, { color: isLow ? "#E74C3C" : colors.mutedForeground }]}>
                    Stock: {item.stockQuantity} {item.unit} · Cost: {formatCurrency(item.costPerUnit)}/{item.unit}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteIngredient(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity onPress={() => { setEditingIngredient(null); setIngName(""); setIngUnit("g"); setIngStock("0"); setIngCost("0"); setIngLowStock("10"); setShowIngModal(true); }}
          style={[s.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderRecipes = () => (
    <View style={s.sectionContent}>
      {renderHeader("Recipe Management")}
      <FlatList
        data={productsList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={<Text style={[s.emptyText, { color: colors.mutedForeground }]}>No products found.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openRecipeEditor(item)}
            style={[s.listItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={[s.cardIconWrap, { backgroundColor: (item.colorHex || "#8E44AD") + "18" }]}>
              <Feather name="book-open" size={18} color={item.colorHex || "#8E44AD"} />
            </View>
            <View style={s.listItemInfo}>
              <Text style={[s.listItemTitle, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[s.listItemSub, { color: colors.mutedForeground }]}>{item.category} · {formatCurrency(item.price)}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      />
    </View>
  );

  const renderContent = () => {
    switch (section) {
      case "menu": return renderMenu();
      case "categories": return renderCategories();
      case "receipt": return renderReceiptDesigner();
      case "printer": return renderPrinterSettings();
      case "kot": return renderKOTSettings();
      case "display": return renderCustomerDisplay();
      case "staff": return renderStaff();
      case "tax": return renderTax();
      case "riders": return renderRiders();
      case "ingredients": return renderIngredients();
      case "recipes": return renderRecipes();
      case "business": {
        setSection("menu");
        setShowBizSettings(true);
        return renderMenu();
      }
      default: return renderMenu();
    }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      {renderContent()}

      <Modal visible={showCatModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCatModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{editingCat ? "Edit Category" : "New Category"}</Text>
            <TouchableOpacity onPress={handleSaveCat}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            {renderField("Name", catName, setCatName, "Category name")}
            {renderField("Sort Order", catOrder, setCatOrder, "0", "number-pad")}

            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Category Image</Text>
            <View style={s.imagePickerRow}>
              <TouchableOpacity onPress={pickCatImage} style={[s.imagePickerBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
                {catImageUri ? (
                  <Image source={{ uri: catImageUri }} style={s.imagePreview} resizeMode="cover" />
                ) : (
                  <View style={s.imagePickerPlaceholder}>
                    <Feather name="camera" size={24} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>Add Photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              {catImageUri && (
                <TouchableOpacity onPress={() => setCatImageUri(undefined)} style={[s.removeImageBtn, { borderColor: colors.destructive, borderRadius: colors.radius }]}>
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                  <Text style={{ color: colors.destructive, fontSize: 12, marginLeft: 6 }}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Color</Text>
            <View style={s.colorRow}>
              {PRODUCT_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setCatColor(c)} style={[s.colorSwatch, { backgroundColor: c }, catColor === c && s.colorSwatchSelected]}>
                  {catColor === c && <Feather name="check" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showStaffModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowStaffModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{editingStaff ? "Edit Staff" : "New Staff"}</Text>
            <TouchableOpacity onPress={handleSaveStaff}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            {renderField("Name", staffName, setStaffName, "Staff name")}
            {renderField("PIN (4+ digits)", staffPin, setStaffPin, "1234", "number-pad")}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Role</Text>
            <View style={s.chipRow}>
              {(["cashier", "admin"] as const).map((r) => (
                <TouchableOpacity key={r} onPress={() => setStaffRole(r)}
                  style={[s.chip, { backgroundColor: staffRole === r ? colors.primary : colors.secondary, borderColor: staffRole === r ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                  <Text style={{ color: staffRole === r ? "#fff" : colors.mutedForeground, fontWeight: "600", textTransform: "capitalize" }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showTaxModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowTaxModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{editingTax ? "Edit Tax Group" : "New Tax Group"}</Text>
            <TouchableOpacity onPress={handleSaveTax}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            {renderField("Name", taxName, setTaxName, "e.g. Standard VAT")}
            {renderField("Rate (%)", taxRate, setTaxRate, "5", "decimal-pad")}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showRiderModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowRiderModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{editingRider ? "Edit Rider" : "New Rider"}</Text>
            <TouchableOpacity onPress={handleSaveRider}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            {renderField("Name", riderName, setRiderName, "Rider name")}
            {renderField("Phone", riderPhone, setRiderPhone, "050-xxx-xxxx")}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showIngModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowIngModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{editingIngredient ? "Edit Ingredient" : "New Ingredient"}</Text>
            <TouchableOpacity onPress={handleSaveIngredient}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            {renderField("Name", ingName, setIngName, "e.g. Flour")}
            {renderField("Unit", ingUnit, setIngUnit, "g, kg, ml, pcs")}
            {renderField("Current Stock", ingStock, setIngStock, "0", "decimal-pad")}
            {renderField("Cost per Unit (AED)", ingCost, setIngCost, "0.00", "decimal-pad")}
            {renderField("Low Stock Threshold", ingLowStock, setIngLowStock, "10", "decimal-pad")}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showRecipeModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowRecipeModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>Recipe</Text>
            <TouchableOpacity onPress={handleSaveRecipe}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Product: {productsList.find((p) => p.id === recipeProductId)?.name ?? ""}</Text>

            {recipeItems.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Ingredients in Recipe</Text>
                {recipeItems.map((ri, idx) => (
                  <View key={ri.ingredientId} style={[s.recipeItemRow, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>{ri.ingredientName}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{ri.quantity} {ingredientList.find((i) => i.id === ri.ingredientId)?.unit ?? ""}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setRecipeItems((prev) => prev.filter((_, i) => i !== idx))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Feather name="x-circle" size={18} color={colors.destructive} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Add Ingredient</Text>
            <View style={{ marginBottom: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {ingredientList.filter((i) => !recipeItems.some((r) => r.ingredientId === i.id)).map((ing) => (
                  <TouchableOpacity
                    key={ing.id}
                    onPress={() => setRecipeIngId(ing.id)}
                    style={[s.chip, { borderColor: recipeIngId === ing.id ? colors.primary : colors.border, backgroundColor: recipeIngId === ing.id ? colors.primary + "18" : "transparent", borderRadius: colors.radius, marginRight: 6 }]}
                  >
                    <Text style={{ color: recipeIngId === ing.id ? colors.primary : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>{ing.name} ({ing.unit})</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {recipeIngId !== "" && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  value={recipeIngQty}
                  onChangeText={setRecipeIngQty}
                  placeholder="Qty"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  style={[s.input, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                />
                <TouchableOpacity onPress={handleAddRecipeItem} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 0, paddingVertical: 12 }]}>
                  <Text style={s.saveBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {ingredientList.length === 0 && (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center", marginTop: 20 }}>
                Add ingredients in the Ingredients section first.
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <BusinessSettingsModal visible={showBizSettings} onClose={() => { setShowBizSettings(false); loadAllSettings(); }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  menuScroll: { flex: 1 },
  menuContent: { padding: 20 },
  menuTitle: { fontSize: 28, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 4 },
  menuSub: { fontSize: 14, marginBottom: 20 },
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  sectionCard: { width: "47%", padding: 16, borderWidth: 1, minWidth: 140 },
  cardIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 4 },
  cardSub: { fontSize: 12, lineHeight: 16 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderWidth: 1, marginTop: 24 },
  sectionContent: { flex: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  backBtn: { padding: 4 },
  formContent: { padding: 20, paddingBottom: 60 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 0.5 },
  switchLabel: { fontSize: 15 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 16, marginTop: 24, gap: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  listContent: { padding: 16, paddingBottom: 100, gap: 8 },
  listItem: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, gap: 12 },
  listItemInfo: { flex: 1 },
  listItemTitle: { fontSize: 15, fontWeight: "600" },
  listItemSub: { fontSize: 12, marginTop: 2 },
  catColorDot: { width: 24, height: 24, borderRadius: 12 },
  catImageThumb: { width: 36, height: 36, borderRadius: 8 },
  emptyText: { fontSize: 14, textAlign: "center", marginTop: 40 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  colorSwatchSelected: { borderWidth: 3, borderColor: "#fff" },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  previewWrap: { marginTop: 20, borderWidth: 1, padding: 12 },
  previewBox: { padding: 12, minHeight: 200, overflow: "hidden" },
  hintText: { fontSize: 12, marginBottom: 12 },
  routingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  routingCatName: { flex: 1, fontSize: 14, fontWeight: "600" },
  routingInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, borderWidth: 1 },
  imagePickerRow: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 4 },
  imagePickerBtn: { width: 90, height: 90, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  imagePreview: { width: "100%", height: "100%" },
  imagePickerPlaceholder: { alignItems: "center", justifyContent: "center" },
  removeImageBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  lowStockBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  recipeItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 0.5, gap: 8 },
});
