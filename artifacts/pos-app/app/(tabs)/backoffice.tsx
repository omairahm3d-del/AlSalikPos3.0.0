import React, { useCallback, useEffect, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
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
import { BusinessSettingsModal } from "@/components/BusinessSettingsModal";
import { ProductsScreen } from "./products";
import { CustomersScreen } from "./customers";
import { ReportsHub } from "@/components/ReportsHub";
import { SyncQueueScreen } from "@/components/SyncQueueScreen";
import { useDatabase } from "@/context/DatabaseCore";
import { useLicense } from "@/context/LicenseContext";
import { useStaff } from "@/context/StaffContext";
import { useWorkMode } from "@/context/WorkModeContext";
import { useColors } from "@/hooks/useColors";
import { generateReceiptHTML } from "@/lib/receiptTemplate";
import { generateKitchenTicketHTML } from "@/lib/kitchenTicketTemplate";
import { isElectron, listWindowsPrinters, printHtml } from "@/lib/printBridge";
import type {
  BusinessSettings,
  Category,
  CustomerDisplaySettings,
  Ingredient,
  KOTSettings,
  PrinterConfig,
  PrinterSettings,
  Product,
  RecipeIngredient,
  ReceiptDesignSettings,
  Rider,
  SmtpConfig,
  Staff,
  StaffPermissions,
  TaxGroup,
} from "@/types";
import {
  ADMIN_PERMISSIONS,
  DEFAULT_CASHIER_PERMISSIONS,
  DEFAULT_CUSTOMER_DISPLAY,
  DEFAULT_KOT_SETTINGS,
  DEFAULT_PRINTER_SETTINGS,
  DEFAULT_RECEIPT_DESIGN,
  PRODUCT_COLORS,
  formatCurrency,
} from "@/types";

type Section =
  | "menu"
  | "products"
  | "customers"
  | "reports"
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
  | "recipes"
  | "permissions"
  | "emailSettings"
  | "database"
  | "stock"
  | "purchases"
  | "receiveStock"
  | "expenses"
  | "suppliers"
  | "syncQueue";

interface SectionCard {
  id: Section;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  permKey?: keyof StaffPermissions;
  adminOnly?: boolean;
  saloonHide?: boolean;
}

const SECTIONS: SectionCard[] = [
  { id: "stock", icon: "box", title: "Stock", subtitle: "On-hand, history & adjust", color: "#16A085", permKey: "boProducts" },
  { id: "purchases", icon: "shopping-bag", title: "Purchases", subtitle: "Recent goods received", color: "#9B59B6", permKey: "boProducts" },
  { id: "receiveStock", icon: "plus-square", title: "Receive Stock", subtitle: "Record a goods received note", color: "#27AE60", permKey: "boProducts" },
  { id: "suppliers", icon: "truck", title: "Suppliers", subtitle: "Manage supplier profiles", color: "#8E44AD", permKey: "boProducts" },
  { id: "expenses", icon: "minus-circle", title: "Cash-Out / Expenses", subtitle: "Record & review petty cash", color: "#E74C3C" },
  { id: "products", icon: "package", title: "Products", subtitle: "Manage items, pricing & stock", color: "#4F8EF7", permKey: "boProducts" },
  { id: "customers", icon: "users", title: "Customers", subtitle: "Manage customer profiles", color: "#1ABC9C", permKey: "boCustomers" },
  { id: "reports", icon: "bar-chart-2", title: "Reports", subtitle: "View sales summaries", color: "#F39C12", permKey: "boReports" },
  { id: "categories", icon: "layers", title: "Categories", subtitle: "Manage product categories", color: "#4F8EF7", permKey: "boCategories" },
  { id: "riders", icon: "truck", title: "Delivery Riders", subtitle: "Manage delivery riders", color: "#3498DB", permKey: "boRiders" },
  { id: "ingredients", icon: "package", title: "Ingredients", subtitle: "Inventory & stock levels", color: "#16A085", permKey: "boIngredients", saloonHide: true },
  { id: "recipes", icon: "book-open", title: "Recipes", subtitle: "Link products to ingredients", color: "#8E44AD", permKey: "boRecipes", saloonHide: true },
  { id: "receipt", icon: "file-text", title: "Receipt Designer", subtitle: "Customize receipt layout", color: "#2ECC71", permKey: "boReceipt" },
  { id: "printer", icon: "printer", title: "Printer Settings", subtitle: "Paper size & auto-print", color: "#9B59B6", permKey: "boPrinter" },
  { id: "kot", icon: "clipboard", title: "KOT Settings", subtitle: "Kitchen ticket routing", color: "#E67E22", permKey: "boKOT", saloonHide: true },
  { id: "display", icon: "monitor", title: "Customer Display", subtitle: "Customer-facing screen", color: "#1ABC9C", permKey: "boDisplay" },
  { id: "staff", icon: "user-check", title: "Staff Management", subtitle: "Manage cashiers & admins", color: "#E74C3C", permKey: "boStaff" },
  { id: "tax", icon: "percent", title: "Tax Groups", subtitle: "VAT rates & tax groups", color: "#F39C12", permKey: "boTax" },
  { id: "business", icon: "briefcase", title: "Business Settings", subtitle: "Company info & loyalty", color: "#6C63FF", permKey: "boBusiness" },
  { id: "emailSettings", icon: "mail", title: "Email Settings", subtitle: "Z-Report email delivery", color: "#3498DB", permKey: "boBusiness" },
  { id: "database", icon: "database", title: "Database", subtitle: "Backup, restore & clear data", color: "#16A085" },
  { id: "syncQueue", icon: "refresh-cw", title: "Sync Queue", subtitle: "Pending items & sync history", color: "#3B82F6" },
  { id: "permissions", icon: "shield", title: "Permissions", subtitle: "Configure staff access rights", color: "#E74C3C", adminOnly: true },
];

export default function BackOfficeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const { session: licenseSession, deactivate } = useLicense();
  const isOffline = licenseSession?.license.licenseType === "offline";
  const { currentStaff, refreshStaffCheck, logout } = useStaff();
  const { isSaloon, isLaundry, isRetail, productLabel, productLabelSingular, orderTicketLabel } = useWorkMode();
  const [section, setSection] = useState<Section>("menu");

  useFocusEffect(useCallback(() => {
    setSection("menu");
  }, []));

  const [categories, setCategories] = useState<Category[]>([]);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(PRODUCT_COLORS[0]);
  const [catOrder, setCatOrder] = useState("0");
  const [catImageUri, setCatImageUri] = useState<string | undefined>(undefined);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);

  const [receiptDesign, setReceiptDesign] = useState<ReceiptDesignSettings>({ ...DEFAULT_RECEIPT_DESIGN });
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>({ ...DEFAULT_PRINTER_SETTINGS });
  const [windowsPrinters, setWindowsPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([]);
  const [btDevices, setBtDevices] = useState<{ name: string; address: string }[]>([]);
  const [btScanning, setBtScanning] = useState(false);
  const [networkTestState, setNetworkTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [btTestState, setBtTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const refreshWindowsPrinters = useCallback(async () => {
    if (!isElectron()) return;
    const list = await listWindowsPrinters();
    setWindowsPrinters(list.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault })));
  }, []);
  useEffect(() => { refreshWindowsPrinters(); }, [refreshWindowsPrinters]);
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
  const [riderActive, setRiderActive] = useState(true);
  const [riderCommission, setRiderCommission] = useState("0");
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

  const [productCsvBusy, setProductCsvBusy] = useState(false);
  const [productCsvMsg, setProductCsvMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [productsList, setProductsList] = useState<Product[]>([]);
  const [recipeProductId, setRecipeProductId] = useState<string | null>(null);
  const [recipeItems, setRecipeItems] = useState<{ ingredientId: string; ingredientName: string; quantity: number }[]>([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeIngId, setRecipeIngId] = useState("");
  const [recipeIngQty, setRecipeIngQty] = useState("");

  const [cashierPerms, setCashierPerms] = useState<StaffPermissions>({ ...DEFAULT_CASHIER_PERMISSIONS });

  const [zReportEmail, setZReportEmail] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);

  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const topPadding = Platform.OS === "web" ? insets.top + 8 : 0;

  const permissions = useMemo<StaffPermissions>(() => {
    if (!currentStaff || currentStaff.role === "admin") return ADMIN_PERMISSIONS;
    const saved = bizSettings?.rolePermissions?.cashier;
    return saved ? { ...DEFAULT_CASHIER_PERMISSIONS, ...saved } : DEFAULT_CASHIER_PERMISSIONS;
  }, [currentStaff, bizSettings]);

  const loadAllSettings = useCallback(async () => {
    const biz = await db.loadBusinessSettings();
    setBizSettings(biz);
    setReceiptDesign(biz.receiptDesign ?? { ...DEFAULT_RECEIPT_DESIGN });
    setPrinterSettings(biz.printerSettings ?? { ...DEFAULT_PRINTER_SETTINGS });
    setKotSettings(biz.kotSettings ?? { ...DEFAULT_KOT_SETTINGS });
    setCustomerDisplay(biz.customerDisplay ?? { ...DEFAULT_CUSTOMER_DISPLAY });
    setCashierPerms(biz.rolePermissions?.cashier ? { ...DEFAULT_CASHIER_PERMISSIONS, ...biz.rolePermissions.cashier } : { ...DEFAULT_CASHIER_PERMISSIONS });
    setZReportEmail(biz.zReportEmail ?? "");
    const sc = biz.smtpConfig;
    setSmtpHost(sc?.host ?? "");
    setSmtpPort(sc?.port?.toString() ?? "587");
    setSmtpSecure(sc?.secure ?? false);
    setSmtpUser(sc?.user ?? "");
    setSmtpPass(sc?.pass ?? "");
    setSmtpFromEmail(sc?.fromEmail ?? "");
    setSmtpFromName(sc?.fromName ?? "");
  }, [db]);

  const savePermissions = useCallback(async () => {
    const biz = bizSettings ?? await db.loadBusinessSettings();
    const updated: BusinessSettings = { ...biz, rolePermissions: { cashier: cashierPerms } };
    await db.saveBusinessSettings(updated);
    setBizSettings(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Permissions updated successfully.");
  }, [bizSettings, cashierPerms, db]);

  const loadCats = useCallback(async () => {
    const cats = await db.loadCategories();
    setCategories(cats);
  }, [db]);

  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

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
    Alert.alert("Saved", "Settings have been saved successfully.");
  }, [bizSettings, receiptDesign, printerSettings, kotSettings, customerDisplay, db]);

  const openSection = useCallback((sec: Section) => {
    // Inventory screens live as their own expo-router routes (so deep-links
    // and the back button behave correctly) rather than embedded sections.
    if (sec === "stock") { router.push("/stock"); return; }
    if (sec === "purchases") { router.push("/purchases"); return; }
    if (sec === "receiveStock") { router.push("/receive-stock"); return; }
    if (sec === "expenses") { router.push("/expenses"); return; }
    if (sec === "suppliers") { router.push("/suppliers"); return; }
    if (sec === "syncQueue") { setSection("syncQueue"); return; }
    setSection(sec);
    if (sec === "staff") loadStaffList();
    if (sec === "tax") loadTaxList();
    if (sec === "riders") loadRiderList();
    if (sec === "ingredients") loadIngredientList();
    if (sec === "recipes") {
      loadProductsList();
      loadIngredientList();
    }
    if (sec === "business") setShowBizSettings(true);
  }, []);

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
    Alert.alert("Saved", editingCat ? "Category updated successfully." : "Category created successfully.");
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
    Alert.alert("Saved", editingStaff ? "Staff member updated successfully." : "Staff member added successfully.");
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
    Alert.alert("Saved", editingTax ? "Tax group updated successfully." : "Tax group created successfully.");
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
      const commissionPct = parseFloat(riderCommission) || 0;
      if (editingRider) {
        await db.updateRider({ ...editingRider, name: riderName.trim(), phone: riderPhone.trim(), active: riderActive, commissionPct });
      } else {
        await db.createRider({ name: riderName.trim(), phone: riderPhone.trim(), vehicleInfo: "", commissionPct });
      }
      await loadRiderList();
      setEditingRider(null); setRiderName(""); setRiderPhone(""); setRiderActive(true); setRiderCommission("0"); setShowRiderModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", editingRider ? "Rider updated successfully." : "Rider added successfully.");
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
      Alert.alert("Saved", editingIngredient ? "Ingredient updated successfully." : "Ingredient added successfully.");
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
      Alert.alert("Saved", "Recipe saved successfully.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save recipe");
    }
  };

  const [clearOpts, setClearOpts] = useState<import("@/types").ClearDataOptions>({});
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [dbBusy, setDbBusy] = useState(false);

  const ALL_CLEAR_KEYS: Array<keyof import("@/types").ClearDataOptions> = [
    "suppliers", "purchases", "stockMovements", "ingredients", "recipes",
    "riders", "sales", "zReports", "heldOrders", "customers", "products",
    "categories", "taxGroups", "tables", "expenses", "resetInvoiceCounter",
  ];
  const allClearSelected = ALL_CLEAR_KEYS.every((k) => !!clearOpts[k]);
  const onMasterClearToggle = (v: boolean) => {
    const next: import("@/types").ClearDataOptions = {};
    if (v) ALL_CLEAR_KEYS.forEach((k) => { (next as Record<string, boolean>)[k] = true; });
    setClearOpts(next);
  };

  const onBackup = useCallback(async () => {
    try {
      setDbBusy(true);
      const data = await db.exportData();
      const { downloadBackup } = await import("@/lib/backupFile");
      const res = await downloadBackup(data);
      if (res.ok) Alert.alert("Backup Created", "Your database backup has been saved.");
      else Alert.alert("Backup Failed", res.error || "Could not create backup.");
    } catch (e: any) {
      Alert.alert("Backup Failed", e?.message || String(e));
    } finally {
      setDbBusy(false);
    }
  }, [db]);

  const onRestore = useCallback(async () => {
    const { confirmDestructive, notify } = await import("@/lib/confirm");
    const ok = await confirmDestructive(
      "Restore Database?",
      "This will REPLACE all current data with the backup file contents. Continue?",
      "Restore",
    );
    if (!ok) return;
    try {
      setDbBusy(true);
      const { pickBackup } = await import("@/lib/backupFile");
      const picked = await pickBackup();
      if (!picked.ok || !picked.data) {
        if (picked.error && picked.error !== "Cancelled" && picked.error !== "No file selected") {
          notify("Restore Failed", picked.error);
        }
        return;
      }
      await db.importData(picked.data);
      notify("Restore Complete", "Database restored successfully. Please restart the app.");
    } catch (e: any) {
      notify("Restore Failed", e?.message || String(e));
    } finally {
      setDbBusy(false);
    }
  }, [db]);

  const onProductExport = useCallback(async () => {
    try {
      setProductCsvBusy(true);
      setProductCsvMsg(null);
      const products = await db.loadProducts();
      const { exportProductsCsv } = await import("@/lib/productCsv");
      const res = await exportProductsCsv(products);
      if (!res.ok && res.error) setProductCsvMsg({ ok: false, text: res.error });
    } catch (e: any) {
      setProductCsvMsg({ ok: false, text: e?.message || "Export failed." });
    } finally {
      setProductCsvBusy(false);
    }
  }, [db]);

  const onProductImport = useCallback(async () => {
    try {
      setProductCsvBusy(true);
      setProductCsvMsg(null);
      const { pickProductsCsv } = await import("@/lib/productCsv");
      const picked = await pickProductsCsv();
      if (!picked.ok) {
        if (picked.error) setProductCsvMsg({ ok: false, text: picked.error });
        return;
      }
      const rows = picked.rows!;
      const existing = await db.loadProducts();
      const byName = new Map(existing.map((p) => [p.name.toLowerCase().trim(), p]));
      let created = 0;
      let updated = 0;
      const now = Date.now();
      for (const row of rows) {
        const match = byName.get(row.name.toLowerCase().trim());
        if (match) {
          await db.updateProduct({
            ...match,
            category: row.category || match.category,
            price: row.price,
            barcode: row.barcode || match.barcode,
            description: row.description || match.description,
            stockQuantity: row.stockQuantity,
            stockTracked: row.stockTracked,
            vatInclusive: row.vatInclusive,
            lowStockThreshold: row.lowStockThreshold,
            colorHex: row.colorHex || match.colorHex,
            updatedAt: now,
          });
          updated++;
        } else {
          await db.createProduct({
            name: row.name,
            category: row.category,
            price: row.price,
            barcode: row.barcode,
            description: row.description,
            stockQuantity: row.stockQuantity,
            stockTracked: row.stockTracked,
            vatInclusive: row.vatInclusive,
            lowStockThreshold: row.lowStockThreshold,
            colorHex: row.colorHex,
            updatedAt: now,
          });
          created++;
        }
      }
      setProductCsvMsg({ ok: true, text: `Import done — ${created} created, ${updated} updated.` });
    } catch (e: any) {
      setProductCsvMsg({ ok: false, text: e?.message || "Import failed." });
    } finally {
      setProductCsvBusy(false);
    }
  }, [db]);

  const onClear = useCallback(async () => {
    setClearConfirmOpen(false);
    try {
      setDbBusy(true);
      await db.clearData(clearOpts);
      setClearOpts({});
      try { await loadCats(); } catch {}
      try { await loadProductsList(); } catch {}
      try { await loadIngredientList(); } catch {}
      try { await loadAllSettings(); } catch {}
    } catch (e: any) {
      Alert.alert("Clear Failed", e?.message || String(e));
    } finally {
      setDbBusy(false);
    }
  }, [clearOpts, db, loadCats, loadAllSettings]);

  const renderClearRow = (
    key: keyof import("@/types").ClearDataOptions,
    label: string,
    refs: string,
  ) => (
    <View key={key} style={[s.switchRow, { borderBottomColor: colors.border, alignItems: "flex-start", paddingVertical: 14 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[s.switchLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>{refs}</Text>
      </View>
      <Switch
        value={!!clearOpts[key]}
        onValueChange={(v) => setClearOpts((o) => ({ ...o, [key]: v }))}
        trackColor={{ false: colors.border, true: colors.destructive }}
      />
    </View>
  );

  const renderDatabase = () => (
    <View style={s.sectionContent}>
      {renderHeader("Database")}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, padding: 16, marginBottom: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Feather name="download" size={18} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginLeft: 8 }}>Backup</Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 12, lineHeight: 18 }}>
            Download a full snapshot of every table (sales, products, customers, settings, staff…) as a single JSON file.
          </Text>
          <TouchableOpacity
            disabled={dbBusy}
            onPress={onBackup}
            style={{ backgroundColor: colors.primary, padding: 14, borderRadius: colors.radius, alignItems: "center", opacity: dbBusy ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Download Backup</Text>
          </TouchableOpacity>
        </View>

        <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, padding: 16, marginBottom: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Feather name="upload" size={18} color="#F39C12" />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginLeft: 8 }}>Restore</Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 12, lineHeight: 18 }}>
            Restore a previously downloaded backup file. This will REPLACE all existing data.
          </Text>
          <TouchableOpacity
            disabled={dbBusy}
            onPress={onRestore}
            style={{ backgroundColor: "#F39C12", padding: 14, borderRadius: colors.radius, alignItems: "center", opacity: dbBusy ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Choose Backup File…</Text>
          </TouchableOpacity>
        </View>

        <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, padding: 16, marginBottom: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Feather name="trash-2" size={18} color={colors.destructive} />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginLeft: 8 }}>Clear Data</Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8, lineHeight: 18 }}>
            Tick what you want to wipe. Business details, staff, printers, KOT, receipt design and email settings are always kept.
          </Text>
          <View style={{ marginTop: 4, marginBottom: 4, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.switchLabel, { color: colors.foreground, fontSize: 14 }]}>Select All</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>Enable or disable all categories at once</Text>
            </View>
            <Switch
              value={allClearSelected}
              onValueChange={onMasterClearToggle}
              trackColor={{ false: colors.border, true: colors.destructive }}
            />
          </View>
          <View style={{ marginTop: 4 }}>
            {renderClearRow("suppliers",     "Suppliers",             "Removes all local supplier records")}
            {renderClearRow("purchases",     "Purchases / GRNs",      "Removes all goods received notes and purchase lines")}
            {renderClearRow("stockMovements","Stock Movements",        "Removes local stock movement history")}
            {renderClearRow("ingredients",   "Ingredients",           "Removes ingredients and their recipe links")}
            {renderClearRow("recipes",       "Recipes",               "Removes recipe ingredient links (keeps ingredients)")}
            {renderClearRow("riders",        "Delivery Riders",       "Removes rider list")}
            {renderClearRow("sales",         "Sales & Transactions",  "Removes sales, sale items, split payments, resets invoice number")}
            {renderClearRow("zReports",      "Z-Report History",      "Removes all end-of-day Z-Reports")}
            {renderClearRow("heldOrders",    "Held Orders / KOT",     "Removes parked orders and frees occupied tables")}
            {renderClearRow("customers",     "Customers",             "Removes customers + their credit payments")}
            {renderClearRow("products",      "Products",              "Removes products and their recipe links")}
            {renderClearRow("categories",    "Categories",            "Removes product categories")}
            {renderClearRow("taxGroups",     "Tax Groups",            "Removes VAT/tax group configuration")}
            {renderClearRow("tables",        "POS Tables",            "Removes table list and any held orders on them")}
            {renderClearRow("expenses",      "Cash-Out / Expenses",   "Removes all expense records")}
            {renderClearRow("resetInvoiceCounter", "Reset Invoice Counter", "Restarts invoice numbering at 0001")}
          </View>
          {!clearConfirmOpen ? (
            <TouchableOpacity
              disabled={dbBusy}
              onPress={() => {
                const selected = Object.entries(clearOpts).filter(([, v]) => v);
                if (selected.length === 0) {
                  Alert.alert("Nothing Selected", "Please tick at least one data category to clear.");
                  return;
                }
                setClearConfirmOpen(true);
              }}
              style={{ backgroundColor: colors.destructive, padding: 14, borderRadius: colors.radius, alignItems: "center", marginTop: 16, opacity: dbBusy ? 0.6 : 1 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Clear Selected Data</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ marginTop: 16, padding: 14, backgroundColor: colors.destructive + "12", borderRadius: colors.radius, borderWidth: 1, borderColor: colors.destructive }}>
              <Text style={{ color: colors.destructive, fontWeight: "700", fontSize: 14, marginBottom: 6 }}>Permanently delete selected data?</Text>
              <Text style={{ color: colors.foreground, fontSize: 13, marginBottom: 12 }}>
                Business settings, staff, printers and configuration are NOT affected.
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  disabled={dbBusy}
                  onPress={onClear}
                  style={{ flex: 1, backgroundColor: colors.destructive, padding: 12, borderRadius: colors.radius, alignItems: "center", opacity: dbBusy ? 0.5 : 1 }}
                >
                  {dbBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Yes, Clear</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={dbBusy}
                  onPress={() => setClearConfirmOpen(false)}
                  style={{ flex: 1, backgroundColor: colors.secondary, padding: 12, borderRadius: colors.radius, alignItems: "center", borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", lineHeight: 18 }}>
          Tip: always download a Backup before clearing or restoring data.
        </Text>
      </ScrollView>
    </View>
  );

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

  const renderMenu = () => {
    if (currentStaff && currentStaff.role !== "admin" && !permissions.canAccessBackOffice) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Feather name="lock" size={48} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
          <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "700", marginTop: 20 }}>Access Restricted</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 }}>
            Your account doesn't have Back Office access. Contact your administrator.
          </Text>
          <TouchableOpacity onPress={logout} style={[s.logoutBtn, { borderColor: colors.border, borderRadius: colors.radius, marginTop: 32 }]}>
            <Feather name="log-out" size={16} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, marginLeft: 8, fontWeight: "600" }}>Switch Staff</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const LABEL_OVERRIDES: Partial<Record<string, { title: string; subtitle: string; icon?: string }>> = isSaloon
      ? {
          products: { title: productLabel, subtitle: `Manage ${productLabel.toLowerCase()}, pricing & stock` },
          categories: { title: "Service Categories", subtitle: "Manage service categories" },
          riders: { title: "Stylists", subtitle: "Manage your stylists", icon: "scissors" },
        }
      : {};

    const visibleSections = SECTIONS.filter((sec) => {
      if ((isSaloon || isLaundry || isRetail) && sec.saloonHide) return false;
      if (sec.adminOnly) return !currentStaff || currentStaff.role === "admin";
      if (!sec.permKey) return true;
      return permissions[sec.permKey] as boolean;
    }).map((sec) => {
      const override = LABEL_OVERRIDES[sec.id];
      return override ? { ...sec, ...override } : sec;
    });

    return (
      <ScrollView style={s.menuScroll} contentContainerStyle={s.menuContent} showsVerticalScrollIndicator={false}>
        <Text style={[s.menuTitle, { color: colors.foreground }]}>Back Office</Text>
        <Text style={[s.menuSub, { color: colors.mutedForeground }]}>Manage your POS settings</Text>

        <View style={s.cardsGrid}>
          {visibleSections.map((sec) => (
            <TouchableOpacity
              key={sec.id}
              onPress={() => openSection(sec.id)}
              style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, width: isTablet ? "30.5%" : "47%" }]}
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

        <View style={[s.aboutCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[s.aboutIconWrap, { backgroundColor: "#6C63FF18" }]}>
            <Feather name="monitor" size={20} color="#6C63FF" />
          </View>
          <View style={s.aboutInfo}>
            <Text style={[s.aboutAppName, { color: colors.foreground }]}>Al Salik POS</Text>
            <Text style={[s.aboutVersion, { color: colors.mutedForeground }]}>Version 1.0.0</Text>
          </View>
          <View style={s.aboutProvider}>
            <Text style={[s.aboutProviderLabel, { color: colors.mutedForeground }]}>Software by</Text>
            <Text style={[s.aboutProviderName, { color: "#6C63FF" }]}>Al Salik Computers</Text>
          </View>
        </View>

        {licenseSession && (
          <View style={[s.deactivateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <View style={s.deactivateInfo}>
              <Text style={[s.deactivateTitle, { color: colors.foreground }]}>
                {licenseSession.company.name}
              </Text>
              <Text style={[s.deactivateSub, { color: colors.mutedForeground }]}>
                {licenseSession.branch ? licenseSession.branch.name + " · " : ""}
                {licenseSession.license.licenseType === "offline" ? "Offline license" : "Online license"}
              </Text>
              {confirmingDeactivate && (
                <Text style={[s.deactivateWarning, { color: colors.mutedForeground }]}>
                  This device will need a license key to reactivate. Local data stays on device.
                </Text>
              )}
            </View>
            {confirmingDeactivate ? (
              <View style={s.deactivateConfirmRow}>
                <TouchableOpacity onPress={() => setConfirmingDeactivate(false)} style={s.deactivateCancelBtn}>
                  <Text style={[s.deactivateCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deactivate()} style={s.deactivateConfirmBtn}>
                  <Feather name="log-out" size={13} color="#fff" />
                  <Text style={s.deactivateConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setConfirmingDeactivate(true)} style={s.deactivateBtn}>
                <Feather name="log-out" size={14} color="#E74C3C" />
                <Text style={s.deactivateBtnText}>Deactivate</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

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
            {permissions.deleteCategories && (
              <TouchableOpacity onPress={() => handleDeleteCat(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </TouchableOpacity>
            )}
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
          {receiptDesign.showLogo && !bizSettings?.logoBase64 && (
            <Text style={{ color: "#E67E22", fontSize: 11, marginTop: 2, marginBottom: 4 }}>Upload a logo in Business Settings to display it on receipts.</Text>
          )}

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

          <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Page Margins (mm)</Text>
          <Text style={[s.hintText, { color: colors.mutedForeground }]}>Adjust if your printer cuts off text or leaves too much white space.</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            {([
              { key: "marginTop" as const, label: "Top" },
              { key: "marginRight" as const, label: "Right" },
              { key: "marginBottom" as const, label: "Bottom" },
              { key: "marginLeft" as const, label: "Left" },
            ]).map((m) => {
              const val = (receiptDesign as any)[m.key];
              const num = val == null ? (m.key === "marginTop" || m.key === "marginBottom" ? 4 : 2) : val;
              return (
                <View key={m.key} style={{ flex: 1 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4 }}>{m.label}</Text>
                  <TextInput
                    value={String(num)}
                    onChangeText={(t) => {
                      const n = Math.max(0, Math.min(50, parseFloat(t.replace(/[^0-9.]/g, "")) || 0));
                      setReceiptDesign({ ...receiptDesign, [m.key]: n });
                    }}
                    keyboardType="numeric"
                    style={{ backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlign: "center" }}
                  />
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            <TouchableOpacity onPress={() => saveSettings(receiptDesign)} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, flex: 1 }]}>
              <Feather name="save" size={16} color="#fff" />
              <Text style={s.saveBtnText}>Save Receipt Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                if (!bizSettings) { Alert.alert("Save first", "Save business settings before printing a test receipt."); return; }
                const sampleSale = { id: "test", invoiceNumber: "INV-TEST-0001", createdAt: Date.now(), subtotal: 100, vatRate: 0.05, vatAmount: 5, total: 105, paymentMethod: "Cash", staffName: currentStaff?.name || "Test Staff" } as any;
                const sampleItems = [
                  { id: "i1", saleId: "test", productId: "p1", productName: "Sample Item A", productPrice: 25, quantity: 2, lineTotal: 50 },
                  { id: "i2", saleId: "test", productId: "p2", productName: "Sample Item B", productPrice: 50, quantity: 1, lineTotal: 50 },
                ] as any;
                const html = generateReceiptHTML(sampleSale, sampleItems, bizSettings, receiptDesign);
                const ps = printerSettings;
                let rawText: string | undefined;
                if (ps?.rawTextMode) {
                  const { generateReceiptText } = await import("@/lib/textReceipt");
                  rawText = generateReceiptText(sampleSale, sampleItems, bizSettings, receiptDesign);
                }
                const ok = await printHtml(html, {
                  deviceName: ps?.windowsReceiptPrinterName || "",
                  paperWidth: receiptDesign.paperWidth,
                  rawMode: !!ps?.rawTextMode,
                  rawText,
                  autoCut: ps?.autoCutPaper !== false,
                  codepage: ps?.rawCodepage || "cp1252",
                });
                if (!ok) Alert.alert("Test Print", "Could not send the test receipt. Check Printer Settings.");
              }}
              style={[s.saveBtn, { backgroundColor: colors.success, borderRadius: colors.radius, flex: 1 }]}
            >
              <Feather name="printer" size={16} color="#fff" />
              <Text style={s.saveBtnText}>Test Print</Text>
            </TouchableOpacity>
          </View>

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

  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterConfig | null>(null);
  const [printerNameInput, setPrinterNameInput] = useState("");
  const [printerIpInput, setPrinterIpInput] = useState("");
  const [printerTypeInput, setPrinterTypeInput] = useState<PrinterConfig["type"]>("both");

  const openAddPrinter = () => {
    setEditingPrinter(null);
    setPrinterNameInput("");
    setPrinterIpInput("");
    setPrinterTypeInput("both");
    setShowPrinterModal(true);
  };

  const openEditPrinter = (p: PrinterConfig) => {
    setEditingPrinter(p);
    setPrinterNameInput(p.name);
    setPrinterIpInput(p.ipAddress);
    setPrinterTypeInput(p.type);
    setShowPrinterModal(true);
  };

  const handleSavePrinter = () => {
    if (!printerNameInput.trim()) { Alert.alert("Invalid", "Printer name is required."); return; }
    const printers = printerSettings.printers ?? [];
    if (editingPrinter) {
      const updated: PrinterConfig = { ...editingPrinter, name: printerNameInput.trim(), ipAddress: printerIpInput.trim(), type: printerTypeInput };
      setPrinterSettings({ ...printerSettings, printers: printers.map((p) => p.id === editingPrinter.id ? updated : p) });
    } else {
      const newPrinter: PrinterConfig = { id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7), name: printerNameInput.trim(), ipAddress: printerIpInput.trim(), type: printerTypeInput };
      setPrinterSettings({ ...printerSettings, printers: [...printers, newPrinter] });
    }
    setShowPrinterModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeletePrinter = (p: PrinterConfig) => {
    Alert.alert("Delete Printer", `Remove "${p.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        const printers = (printerSettings.printers ?? []).filter((pr) => pr.id !== p.id);
        const updates: Partial<PrinterSettings> = { printers };
        if (printerSettings.defaultReceiptPrinterId === p.id) updates.defaultReceiptPrinterId = "";
        if (printerSettings.defaultKOTPrinterId === p.id) updates.defaultKOTPrinterId = "";
        setPrinterSettings({ ...printerSettings, ...updates });
      }},
    ]);
  };

  const printerList = printerSettings.printers ?? [];

  const renderPrinterSettings = () => (
    <View style={s.sectionContent}>
      {renderHeader("Printer Settings")}
      <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>

        {/* ── Receipt Print Method ─────────────────────────────────── */}
        <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, marginBottom: 4 }}>Receipt Print Method</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 10, lineHeight: 15 }}>
            Choose how the Print button on the receipt behaves.{"\n"}
            <Text style={{ fontWeight: "600" }}>Generic / Text Print</Text> — sends ESC/POS raw text directly (thermal, auto paper-cut).{"\n"}
            <Text style={{ fontWeight: "600" }}>Windows Printer</Text> — renders HTML and prints silently via the Windows print system.
          </Text>
          <View style={s.chipRow}>
            {([
              { label: "Generic / Text Print", value: "direct" as const },
              { label: "Windows Printer", value: "system" as const },
            ]).map(({ label, value }) => {
              const selected = (printerSettings.printMethod ?? "system") === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setPrinterSettings({ ...printerSettings, printMethod: value })}
                  style={[s.chip, { backgroundColor: selected ? colors.primary : colors.secondary, borderColor: selected ? colors.primary : colors.border, borderRadius: colors.radius }]}
                >
                  <Text style={{ color: selected ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 12 }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isElectron() && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Windows Direct Printers</Text>
              <TouchableOpacity onPress={refreshWindowsPrinters} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="refresh-cw" size={12} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>Refresh</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 12, lineHeight: 15 }}>
              Pick a Windows printer for each job. Selected printers will print silently (no dialog) at full thermal paper width.
            </Text>
            {windowsPrinters.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontStyle: "italic", paddingVertical: 6 }}>
                No printers detected. Install your printer in Windows then tap Refresh.
              </Text>
            ) : (
              <>
                {([
                  { label: "Receipt Printer", key: "windowsReceiptPrinterName" as const },
                  { label: "Kitchen (KOT) Printer", key: "windowsKOTPrinterName" as const },
                  { label: "Cash Drawer Printer", key: "windowsDrawerPrinterName" as const },
                ]).map((row) => {
                  const cur = (printerSettings as any)[row.key] as string | undefined;
                  return (
                    <View key={row.key} style={{ marginBottom: 10 }}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4 }}>{row.label}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <TouchableOpacity
                          onPress={() => setPrinterSettings({ ...printerSettings, [row.key]: "" })}
                          style={[s.chip, { backgroundColor: !cur ? colors.primary : colors.secondary, borderColor: !cur ? colors.primary : colors.border, borderRadius: colors.radius, marginRight: 8 }]}
                        >
                          <Text style={{ color: !cur ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 12 }}>None</Text>
                        </TouchableOpacity>
                        {windowsPrinters.map((wp) => {
                          const sel = cur === wp.name;
                          return (
                            <TouchableOpacity
                              key={wp.name}
                              onPress={() => setPrinterSettings({ ...printerSettings, [row.key]: wp.name })}
                              style={[s.chip, { backgroundColor: sel ? colors.primary : colors.secondary, borderColor: sel ? colors.primary : colors.border, borderRadius: colors.radius, marginRight: 8 }]}
                            >
                              <Text style={{ color: sel ? "#fff" : colors.foreground, fontWeight: "600", fontSize: 12 }} numberOfLines={1}>
                                {wp.displayName}{wp.isDefault ? " ★" : ""}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })}
                <TouchableOpacity
                  onPress={async () => {
                    const dn = printerSettings.windowsReceiptPrinterName || windowsPrinters.find((p) => p.isDefault)?.name || windowsPrinters[0]?.name || "";
                    if (!dn) { Alert.alert("No Printer", "Select a printer first."); return; }
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>@page{margin:0;size:${printerSettings.paperWidth} auto}body{margin:0;padding:8px;font-family:'Tahoma','Arial',sans-serif;color:#000;font-size:12px;text-align:center}</style></head><body><div style="font-size:14px;font-weight:bold">AL SALIK POS</div><div>Test Print</div><div>${new Date().toLocaleString("en-GB")}</div><div style="margin-top:6px">--------------------------------</div><div>If this prints clearly,</div><div>your printer is configured.</div><div style="margin-top:6px">--------------------------------</div></body></html>`;
                    const rawText = printerSettings.rawTextMode
                      ? `AL SALIK POS\nTest Print (RAW)\n${new Date().toLocaleString("en-GB")}\n--------------------------------\nIf you see this with a clean cut,\nESC/POS RAW mode works.\n--------------------------------\n`
                      : undefined;
                    const ok = await printHtml(html, {
                      deviceName: dn,
                      paperWidth: printerSettings.paperWidth,
                      rawMode: !!printerSettings.rawTextMode,
                      rawText,
                      autoCut: printerSettings.autoCutPaper !== false,
                      codepage: printerSettings.rawCodepage || "cp1252",
                    });
                    Alert.alert(ok ? "Test Sent" : "Test Failed", ok ? `Sent to "${dn}".` : "Could not send to printer. Check Windows printer status.");
                  }}
                  style={[s.chip, { borderColor: colors.success, borderStyle: "dashed", alignSelf: "flex-start", marginTop: 4, borderRadius: colors.radius, flexDirection: "row", gap: 6 }]}
                >
                  <Feather name="printer" size={12} color={colors.success} />
                  <Text style={{ color: colors.success, fontWeight: "600", fontSize: 12 }}>Send Test Print</Text>
                </TouchableOpacity>

                <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13, marginBottom: 8 }}>Thermal Print Mode</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 10, lineHeight: 15 }}>
                    Enable RAW (ESC/POS) mode if your POS-80 printer prints question marks or garbled text.
                    RAW sends plain text + paper-cut commands directly to the printer (Latin-only, no Arabic).
                  </Text>
                  {renderSwitch("Use RAW Text Mode (ESC/POS)", !!printerSettings.rawTextMode, (v) => setPrinterSettings({ ...printerSettings, rawTextMode: v }))}
                  {renderSwitch("Auto-cut paper after print", printerSettings.autoCutPaper !== false, (v) => setPrinterSettings({ ...printerSettings, autoCutPaper: v }))}
                  {printerSettings.rawTextMode && (
                    <View style={{ marginTop: 6 }}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4 }}>Code Page</Text>
                      <View style={s.chipRow}>
                        {(["cp1252", "cp437", "ascii"] as const).map((cp) => (
                          <TouchableOpacity key={cp} onPress={() => setPrinterSettings({ ...printerSettings, rawCodepage: cp })}
                            style={[s.chip, { backgroundColor: (printerSettings.rawCodepage || "cp1252") === cp ? colors.primary : colors.secondary, borderColor: colors.border, borderRadius: colors.radius }]}>
                            <Text style={{ color: (printerSettings.rawCodepage || "cp1252") === cp ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 11, textTransform: "uppercase" }}>{cp}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {Platform.OS === "android" && !isElectron() && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Sunmi Built-in Printer</Text>
              <View style={{ backgroundColor: colors.primary + "20", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>RECOMMENDED</Text>
              </View>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 12, lineHeight: 15 }}>
              For Sunmi POS devices (V1, V2, T2, P2, etc.) with internal thermal printers.
              Uses the Sunmi AIDL SDK — no device path needed.
            </Text>
            {renderSwitch(
              "Enable Sunmi printer",
              !!printerSettings.sunmiEnabled,
              (v) => setPrinterSettings({ ...printerSettings, sunmiEnabled: v }),
            )}
            {printerSettings.sunmiEnabled && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <TouchableOpacity
                  onPress={async () => {
                    const { sunmiTestPrint } = await import("@/lib/printBridge");
                    const ok = await sunmiTestPrint(printerSettings.autoCutPaper !== false);
                    Alert.alert(
                      ok ? "Test Sent" : "Test Failed",
                      ok
                        ? "ESC/POS bytes sent via Sunmi SDK.\nCheck if the printer printed a test strip."
                        : "Could not reach the Sunmi printer service.\nMake sure this is a Sunmi device and the app was built with the Sunmi module.",
                    );
                  }}
                  style={[s.chip, { borderColor: colors.success, borderStyle: "dashed", alignSelf: "flex-start", borderRadius: colors.radius, flexDirection: "row", gap: 6 }]}
                >
                  <Feather name="printer" size={12} color={colors.success} />
                  <Text style={{ color: colors.success, fontWeight: "600", fontSize: 12 }}>Send Test Print</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    const { isSunmiDevice } = await import("@/lib/printBridge");
                    const found = await isSunmiDevice();
                    Alert.alert(
                      found ? "Sunmi Detected" : "Not a Sunmi Device",
                      found
                        ? "Sunmi printer service is available on this device."
                        : "No Sunmi printer service found.\nIf this is a Sunmi device, try rebuilding the APK with the Sunmi module included.",
                    );
                  }}
                  style={[s.chip, { borderColor: colors.primary, borderStyle: "dashed", alignSelf: "flex-start", borderRadius: colors.radius, flexDirection: "row", gap: 6 }]}
                >
                  <Feather name="search" size={12} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12 }}>Detect Sunmi</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {Platform.OS === "android" && !isElectron() && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, marginBottom: 4 }}>Android Built-in Printer (Serial / USB)</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 6, lineHeight: 15 }}>
              For devices with a built-in thermal printer accessible via a serial or USB device path.
              Sends ESC/POS commands directly — no dialog, no extra app.
            </Text>
            <View style={{ backgroundColor: colors.primary + "12", borderRadius: 6, padding: 8, marginBottom: 10 }}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 11, marginBottom: 2 }}>Dukkantek / SmartPos devices</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15 }}>
                Try tapping <Text style={{ fontFamily: "monospace", color: colors.foreground }}>/dev/ttyHSL0</Text> or <Text style={{ fontFamily: "monospace", color: colors.foreground }}>/dev/ttyMT0</Text> first, then press "Send Test Print". Use "Auto-detect" to scan all paths automatically.
              </Text>
            </View>
            {renderSwitch(
              "Enable Android built-in printer",
              !!printerSettings.androidPrinterEnabled,
              (v) => setPrinterSettings({ ...printerSettings, androidPrinterEnabled: v }),
            )}
            {printerSettings.androidPrinterEnabled && (
              <>
                {renderField(
                  "Printer device path",
                  printerSettings.androidPrinterPath || "",
                  (v) => setPrinterSettings({ ...printerSettings, androidPrinterPath: v }),
                  "/dev/prnt",
                )}
                <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 8, lineHeight: 15 }}>
                  Tap a common path to select it, or type your own above.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {["/dev/ttyHSL0", "/dev/ttyHSL1", "/dev/ttyMT0", "/dev/ttyMT1", "/dev/ttyACM0", "/dev/ttyACM1", "/dev/prnt", "/dev/usb/lp0", "/dev/ttyS0", "/dev/ttyS1", "/dev/ttyS2", "/dev/ttyS3", "/dev/ttyS4", "/dev/ttyS5", "/dev/ttyXR0", "/dev/ttyXR1", "/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/thermal_printer", "/dev/tp", "/dev/printer", "/dev/bprint"].map((p) => {
                    const active = (printerSettings.androidPrinterPath || "/dev/prnt") === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setPrinterSettings({ ...printerSettings, androidPrinterPath: p })}
                        style={[s.chip, { backgroundColor: active ? colors.primary : colors.secondary, borderColor: active ? colors.primary : colors.border, borderRadius: colors.radius, paddingVertical: 3 }]}
                      >
                        <Text style={{ color: active ? "#fff" : colors.mutedForeground, fontSize: 11, fontFamily: "monospace" }}>{p}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {renderSwitch("Auto-cut paper after print", printerSettings.autoCutPaper !== false, (v) => setPrinterSettings({ ...printerSettings, autoCutPaper: v }))}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const { printAndroidDevice } = await import("@/lib/printBridge");
                      const devPath = printerSettings.androidPrinterPath || "/dev/prnt";
                      const testText = `AL SALIK POS\nTest Print\n${new Date().toLocaleString("en-GB")}\n--------------------------------\nIf this prints clearly,\nyour printer is configured.\n--------------------------------\n`;
                      const ok = await printAndroidDevice(testText, {
                        devicePath: devPath,
                        autoCut: printerSettings.autoCutPaper !== false,
                      });
                      Alert.alert(
                        ok ? "Test Sent" : "Test Failed",
                        ok
                          ? `ESC/POS bytes sent to ${devPath}.\nCheck if the printer printed a test strip.`
                          : `Could not write to ${devPath}.\n\nTap "Auto-detect" to find the correct path for your device automatically.`,
                      );
                    }}
                    style={[s.chip, { borderColor: colors.success, borderStyle: "dashed", alignSelf: "flex-start", borderRadius: colors.radius, flexDirection: "row", gap: 6 }]}
                  >
                    <Feather name="printer" size={12} color={colors.success} />
                    <Text style={{ color: colors.success, fontWeight: "600", fontSize: 12 }}>Send Test Print</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const { detectAndroidPrinterPath } = await import("@/lib/printBridge");
                      Alert.alert("Auto-detecting…", "Trying common printer paths. The printer will print a test strip when found.");
                      const found = await detectAndroidPrinterPath(printerSettings.autoCutPaper !== false);
                      if (found) {
                        setPrinterSettings({ ...printerSettings, androidPrinterPath: found });
                        Alert.alert("Printer Found", `Working path: ${found}\n\nIt has been set as your device path automatically.`);
                      } else {
                        Alert.alert(
                        "Not Found",
                        "Could not write to any common printer path.\n\nTry these steps:\n1. Make sure the printer is ON and connected.\n2. Go to Android Settings → Apps → Al Salik POS → Permissions and grant Storage access.\n3. Try typing your device's path manually above (e.g. /dev/ttyXR0 for Sunmy/Rockchip devices, /dev/ttyS4 for some built-in printers).\n4. On some devices, the Sunmi SDK option above works instead."
                      );
                      }
                    }}
                    style={[s.chip, { borderColor: colors.primary, borderStyle: "dashed", alignSelf: "flex-start", borderRadius: colors.radius, flexDirection: "row", gap: 6 }]}
                  >
                    <Feather name="search" size={12} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12 }}>Auto-detect</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Wi-Fi / Network Printer ─────────────────────────────────── */}
        <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Feather name="wifi" size={15} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Wi-Fi / Network Printer</Text>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 12, lineHeight: 15 }}>
            Connects to any ESC/POS network thermal printer on your Wi-Fi. Uses raw TCP port 9100 (standard for Epson, Star, Xprinter, Bixolon, etc.).
          </Text>
          {renderSwitch(
            "Enable Wi-Fi printer",
            !!printerSettings.networkPrinterEnabled,
            (v) => setPrinterSettings({ ...printerSettings, networkPrinterEnabled: v }),
          )}
          {printerSettings.networkPrinterEnabled && (
            <>
              {renderField(
                "Printer IP Address",
                printerSettings.networkPrinterIp || "",
                (v) => setPrinterSettings({ ...printerSettings, networkPrinterIp: v }),
                "192.168.1.100",
              )}
              {renderField(
                "Port (default 9100)",
                String(printerSettings.networkPrinterPort || 9100),
                (v) => setPrinterSettings({ ...printerSettings, networkPrinterPort: parseInt(v, 10) || 9100 }),
                "9100",
              )}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <TouchableOpacity
                  onPress={async () => {
                    const ip = printerSettings.networkPrinterIp?.trim();
                    if (!ip) { Alert.alert("No IP", "Enter the printer IP address first."); return; }
                    setNetworkTestState("testing");
                    const { testNetworkPrinter } = await import("@/lib/printBridge");
                    const ok = await testNetworkPrinter(ip, printerSettings.networkPrinterPort || 9100, printerSettings.autoCutPaper !== false);
                    setNetworkTestState(ok ? "ok" : "fail");
                    setTimeout(() => setNetworkTestState("idle"), 3000);
                    if (!ok) Alert.alert("Connection Failed", `Could not reach printer at ${ip}:${printerSettings.networkPrinterPort || 9100}.\n\nCheck that:\n• The printer is on the same Wi-Fi\n• The IP address is correct\n• Port 9100 is open on the printer`);
                  }}
                  style={[s.chip, {
                    borderColor: networkTestState === "ok" ? colors.success : networkTestState === "fail" ? "#E74C3C" : colors.primary,
                    borderStyle: "dashed", alignSelf: "flex-start", borderRadius: colors.radius, flexDirection: "row", gap: 6
                  }]}
                >
                  <Feather
                    name={networkTestState === "testing" ? "loader" : networkTestState === "ok" ? "check-circle" : networkTestState === "fail" ? "x-circle" : "printer"}
                    size={12}
                    color={networkTestState === "ok" ? colors.success : networkTestState === "fail" ? "#E74C3C" : colors.primary}
                  />
                  <Text style={{ color: networkTestState === "ok" ? colors.success : networkTestState === "fail" ? "#E74C3C" : colors.primary, fontWeight: "600", fontSize: 12 }}>
                    {networkTestState === "testing" ? "Testing..." : networkTestState === "ok" ? "Connected!" : networkTestState === "fail" ? "Failed" : "Test Print"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* ── Bluetooth Printer ────────────────────────────────────────── */}
        {Platform.OS !== "web" && !isElectron() && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Feather name="bluetooth" size={15} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Bluetooth Printer</Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 12, lineHeight: 15 }}>
              Connect a Bluetooth ESC/POS thermal printer. Pair the printer in your device's Bluetooth settings first, then scan here to find it.
            </Text>
            {renderSwitch(
              "Enable Bluetooth printer",
              !!printerSettings.bluetoothPrinterEnabled,
              (v) => setPrinterSettings({ ...printerSettings, bluetoothPrinterEnabled: v }),
            )}
            {printerSettings.bluetoothPrinterEnabled && (
              <>
                {printerSettings.bluetoothPrinterAddress ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.success + "15", borderRadius: colors.radius, padding: 10, marginBottom: 8 }}>
                    <Feather name="bluetooth" size={14} color={colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }}>{printerSettings.bluetoothPrinterName || printerSettings.bluetoothPrinterAddress}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{printerSettings.bluetoothPrinterAddress}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setPrinterSettings({ ...printerSettings, bluetoothPrinterAddress: undefined, bluetoothPrinterName: undefined })}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8 }}>No printer selected. Scan to find paired devices.</Text>
                )}

                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      setBtScanning(true);
                      setBtDevices([]);
                      try {
                        const { listBluetoothDevices } = await import("@/lib/printBridge");
                        const devices = await listBluetoothDevices();
                        setBtDevices(devices);
                        if (devices.length === 0) Alert.alert("No Devices Found", "No paired Bluetooth devices found.\n\nMake sure you have:\n1. Paired the printer in your device Settings > Bluetooth\n2. Bluetooth is turned on\n3. The printer is powered on");
                      } catch {
                        Alert.alert("Bluetooth Error", "Could not scan for devices. Make sure Bluetooth is enabled and the app has Bluetooth permissions.");
                      } finally {
                        setBtScanning(false);
                      }
                    }}
                    style={[s.chip, { borderColor: colors.primary, borderStyle: "dashed", alignSelf: "flex-start", borderRadius: colors.radius, flexDirection: "row", gap: 6 }]}
                  >
                    <Feather name={btScanning ? "loader" : "search"} size={12} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12 }}>{btScanning ? "Scanning..." : "Scan for Devices"}</Text>
                  </TouchableOpacity>

                  {printerSettings.bluetoothPrinterAddress && (
                    <TouchableOpacity
                      onPress={async () => {
                        const addr = printerSettings.bluetoothPrinterAddress;
                        if (!addr) return;
                        setBtTestState("testing");
                        const { testBluetoothPrinter } = await import("@/lib/printBridge");
                        const ok = await testBluetoothPrinter(addr, printerSettings.autoCutPaper !== false);
                        setBtTestState(ok ? "ok" : "fail");
                        setTimeout(() => setBtTestState("idle"), 3000);
                        if (!ok) Alert.alert("Print Failed", `Could not send to ${printerSettings.bluetoothPrinterName || addr}.\n\nCheck that:\n• The printer is powered on and in range\n• Bluetooth is enabled\n• The printer is paired in Settings`);
                      }}
                      style={[s.chip, {
                        borderColor: btTestState === "ok" ? colors.success : btTestState === "fail" ? "#E74C3C" : colors.success,
                        borderStyle: "dashed", alignSelf: "flex-start", borderRadius: colors.radius, flexDirection: "row", gap: 6
                      }]}
                    >
                      <Feather
                        name={btTestState === "testing" ? "loader" : btTestState === "ok" ? "check-circle" : btTestState === "fail" ? "x-circle" : "printer"}
                        size={12}
                        color={btTestState === "ok" ? colors.success : btTestState === "fail" ? "#E74C3C" : colors.success}
                      />
                      <Text style={{ color: btTestState === "ok" ? colors.success : btTestState === "fail" ? "#E74C3C" : colors.success, fontWeight: "600", fontSize: 12 }}>
                        {btTestState === "testing" ? "Sending..." : btTestState === "ok" ? "Printed!" : btTestState === "fail" ? "Failed" : "Test Print"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {btDevices.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 6 }}>Tap a device to select it as your printer:</Text>
                    {btDevices.map((d) => (
                      <TouchableOpacity
                        key={d.address}
                        onPress={() => {
                          setPrinterSettings({ ...printerSettings, bluetoothPrinterAddress: d.address, bluetoothPrinterName: d.name });
                          setBtDevices([]);
                        }}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 10, padding: 10,
                          backgroundColor: printerSettings.bluetoothPrinterAddress === d.address ? colors.primary + "15" : colors.background,
                          borderRadius: colors.radius, borderWidth: 1,
                          borderColor: printerSettings.bluetoothPrinterAddress === d.address ? colors.primary : colors.border,
                          marginBottom: 6,
                        }}
                      >
                        <Feather name="bluetooth" size={14} color={printerSettings.bluetoothPrinterAddress === d.address ? colors.primary : colors.mutedForeground} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }}>{d.name}</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{d.address}</Text>
                        </View>
                        {printerSettings.bluetoothPrinterAddress === d.address && (
                          <Feather name="check" size={14} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

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
        {!isSaloon && !isLaundry && !isRetail && renderSwitch("Auto-print Kitchen Ticket", printerSettings.autoPrintKOT, (v) => setPrinterSettings({ ...printerSettings, autoPrintKOT: v }))}

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

        <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 24 }]}>Configured Printers</Text>
        <Text style={[s.hintText, { color: colors.mutedForeground }]}>Add printers to assign to products for receipt or kitchen ticket printing</Text>

        {printerList.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Feather name="printer" size={32} color={colors.mutedForeground + "50"} />
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>No printers configured</Text>
          </View>
        ) : (
          printerList.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => openEditPrinter(p)} style={[s.listItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, marginBottom: 8 }]}>
              <View style={[s.cardIconWrap, { backgroundColor: "#9B59B6" + "18", width: 36, height: 36 }]}>
                <Feather name="printer" size={16} color="#9B59B6" />
              </View>
              <View style={s.listItemInfo}>
                <Text style={[s.listItemTitle, { color: colors.foreground }]}>{p.name}</Text>
                <Text style={[s.listItemSub, { color: colors.mutedForeground }]}>
                  {p.ipAddress || "No IP"} · {p.type === "receipt" ? "Receipt" : p.type === "kitchen" ? "Kitchen" : "Receipt & Kitchen"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleDeletePrinter(p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity onPress={openAddPrinter} style={[s.chip, { borderColor: colors.primary, borderStyle: "dashed", alignSelf: "flex-start", marginTop: 8, borderRadius: colors.radius, flexDirection: "row", gap: 6 }]}>
          <Feather name="plus" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Add Printer</Text>
        </TouchableOpacity>

        {printerList.length > 0 && (
          <>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 24 }]}>Default Receipt Printer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => setPrinterSettings({ ...printerSettings, defaultReceiptPrinterId: "" })}
                style={[s.chip, { backgroundColor: !printerSettings.defaultReceiptPrinterId ? colors.primary : colors.secondary, borderColor: !printerSettings.defaultReceiptPrinterId ? colors.primary : colors.border, borderRadius: colors.radius, marginRight: 8 }]}
              >
                <Text style={{ color: !printerSettings.defaultReceiptPrinterId ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 13 }}>None</Text>
              </TouchableOpacity>
              {printerList.filter((p) => p.type === "receipt" || p.type === "both").map((p) => (
                <TouchableOpacity key={p.id}
                  onPress={() => setPrinterSettings({ ...printerSettings, defaultReceiptPrinterId: p.id })}
                  style={[s.chip, { backgroundColor: printerSettings.defaultReceiptPrinterId === p.id ? colors.primary : colors.secondary, borderColor: printerSettings.defaultReceiptPrinterId === p.id ? colors.primary : colors.border, borderRadius: colors.radius, marginRight: 8 }]}
                >
                  <Text style={{ color: printerSettings.defaultReceiptPrinterId === p.id ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 13 }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {!isSaloon && !isLaundry && !isRetail && (
              <>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Default KOT Printer</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <TouchableOpacity
                    onPress={() => setPrinterSettings({ ...printerSettings, defaultKOTPrinterId: "" })}
                    style={[s.chip, { backgroundColor: !printerSettings.defaultKOTPrinterId ? colors.primary : colors.secondary, borderColor: !printerSettings.defaultKOTPrinterId ? colors.primary : colors.border, borderRadius: colors.radius, marginRight: 8 }]}
                  >
                    <Text style={{ color: !printerSettings.defaultKOTPrinterId ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 13 }}>None</Text>
                  </TouchableOpacity>
                  {printerList.filter((p) => p.type === "kitchen" || p.type === "both").map((p) => (
                    <TouchableOpacity key={p.id}
                      onPress={() => setPrinterSettings({ ...printerSettings, defaultKOTPrinterId: p.id })}
                      style={[s.chip, { backgroundColor: printerSettings.defaultKOTPrinterId === p.id ? colors.primary : colors.secondary, borderColor: printerSettings.defaultKOTPrinterId === p.id ? colors.primary : colors.border, borderRadius: colors.radius, marginRight: 8 }]}
                    >
                      <Text style={{ color: printerSettings.defaultKOTPrinterId === p.id ? "#fff" : colors.mutedForeground, fontWeight: "600", fontSize: 13 }}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}

        <TouchableOpacity onPress={() => saveSettings(undefined, printerSettings)} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 16 }]}>
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

            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 20 }]}>Category Printers</Text>
            <Text style={[s.hintText, { color: colors.mutedForeground }]}>
              Pick which Windows printer each category prints to. Leave blank to use the main KOT printer. Tap "Test" to send a sample ticket.
            </Text>
            {categories.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontStyle: "italic", marginTop: 8 }}>No categories yet — add some in Back Office → Categories.</Text>
            ) : null}
            {categories.map((cat) => {
              const printerName = (kotSettings.categoryPrinters ?? {})[cat.name] ?? "";
              const station = kotSettings.categoryRouting[cat.name] ?? "";
              return (
                <View key={cat.id} style={{ marginBottom: 14, padding: 12, backgroundColor: colors.secondary, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View style={[s.catColorDot, { backgroundColor: cat.colorHex, marginRight: 8 }]} />
                    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14, flex: 1 }}>{cat.name}</Text>
                    <TouchableOpacity
                      onPress={async () => {
                        const ps = printerSettings;
                        const target = printerName || ps?.windowsKOTPrinterName || ps?.windowsReceiptPrinterName || "";
                        if (!target && isElectron()) {
                          Alert.alert("No printer", `Pick a printer for "${cat.name}" first, or set a default KOT printer in Printer Settings.`);
                          return;
                        }
                        const sampleItems: any[] = [
                          { product: { id: "t1", name: `Test Item (${cat.name})`, price: 10, category: cat.name }, quantity: 1, taxRate: 0.05 },
                          { product: { id: "t2", name: `Sample Dish`, price: 15, category: cat.name }, quantity: 2, taxRate: 0.05 },
                        ];
                        const stationLabel = station || cat.name;
                        const html = generateKitchenTicketHTML(sampleItems, "KOT-TEST-" + cat.name.toUpperCase().replace(/\s+/g, ""), "Table 1", currentStaff?.name || "Test", kotSettings, stationLabel);
                        const ok = await printHtml(html || generateKitchenTicketHTML(sampleItems, "KOT-TEST", "Table 1", currentStaff?.name || "Test", kotSettings), {
                          deviceName: target,
                          paperWidth: "80mm",
                          rawMode: !!ps?.rawTextMode,
                          autoCut: ps?.autoCutPaper !== false,
                          codepage: ps?.rawCodepage || "cp1252",
                        });
                        if (!ok) Alert.alert("Test failed", `Could not print to "${target || "default printer"}". Check the printer is online.`);
                        else Alert.alert("Sent", `Test ticket sent to "${target || "default printer"}" for category "${cat.name}".`);
                      }}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.success, borderRadius: colors.radius, flexDirection: "row", alignItems: "center", gap: 4 }}
                    >
                      <Feather name="printer" size={12} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Test</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4 }}>Windows Printer</Text>
                  {isElectron() && windowsPrinters.length > 0 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      <TouchableOpacity
                        onPress={() => {
                          const next = { ...(kotSettings.categoryPrinters ?? {}) };
                          delete next[cat.name];
                          setKotSettings({ ...kotSettings, categoryPrinters: next });
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: colors.radius, backgroundColor: !printerName ? colors.primary : colors.card, borderWidth: 1, borderColor: !printerName ? colors.primary : colors.border }}
                      >
                        <Text style={{ color: !printerName ? "#fff" : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>(Default KOT)</Text>
                      </TouchableOpacity>
                      {windowsPrinters.map((wp) => {
                        const active = printerName === wp.name;
                        return (
                          <TouchableOpacity
                            key={wp.name}
                            onPress={() => setKotSettings({ ...kotSettings, categoryPrinters: { ...(kotSettings.categoryPrinters ?? {}), [cat.name]: wp.name } })}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: colors.radius, backgroundColor: active ? colors.primary : colors.card, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}
                          >
                            <Text style={{ color: active ? "#fff" : colors.foreground, fontSize: 11, fontWeight: "600" }} numberOfLines={1}>{wp.displayName || wp.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <TextInput
                      value={printerName}
                      onChangeText={(v) => setKotSettings({ ...kotSettings, categoryPrinters: { ...(kotSettings.categoryPrinters ?? {}), [cat.name]: v } })}
                      placeholder="Printer name (or leave blank for default KOT printer)"
                      placeholderTextColor={colors.mutedForeground}
                      style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, borderWidth: 1, padding: 8, fontSize: 13, marginBottom: 8 }}
                    />
                  )}

                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4 }}>Station Label (optional, prints on ticket header)</Text>
                  <TextInput
                    value={station}
                    onChangeText={(v) => setKotSettings({ ...kotSettings, categoryRouting: { ...kotSettings.categoryRouting, [cat.name]: v } })}
                    placeholder="e.g. Hot Kitchen, Cold Bar"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius, borderWidth: 1, padding: 8, fontSize: 13 }}
                  />
                </View>
              );
            })}
          </>
        )}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TouchableOpacity onPress={() => saveSettings(undefined, undefined, kotSettings)} style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, flex: 1 }]}>
            <Feather name="save" size={16} color="#fff" />
            <Text style={s.saveBtnText}>Save KOT Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              const ps = printerSettings;
              const target = ps?.windowsKOTPrinterName || ps?.windowsReceiptPrinterName || "";
              if (!target && isElectron()) {
                Alert.alert("No KOT printer", "Set a Kitchen (KOT) Printer in Printer Settings → Windows Direct Printers first.");
                return;
              }
              const sampleItems: any[] = [
                { product: { id: "p1", name: "Test Burger", price: 25, category: "Food" }, quantity: 2, taxRate: 0.05 },
                { product: { id: "p2", name: "Test Fries", price: 10, category: "Food" }, quantity: 1, taxRate: 0.05 },
                { product: { id: "p3", name: "Test Cola", price: 5, category: "Drinks" }, quantity: 2, taxRate: 0.05 },
              ];
              const html = generateKitchenTicketHTML(sampleItems, "KOT-TEST-0001", "Table 1", currentStaff?.name || "Test", kotSettings);
              const ok = await printHtml(html, {
                deviceName: target,
                paperWidth: "80mm",
                rawMode: !!ps?.rawTextMode,
                rawText: ps?.rawTextMode
                  ? `\n  KITCHEN ORDER\n  Order: KOT-TEST-0001\n  Table: Table 1\n  ----------------\n  2x Test Burger\n  1x Test Fries\n  2x Test Cola\n  ----------------\n  *** TEST PRINT ***\n\n\n`
                  : undefined,
                autoCut: ps?.autoCutPaper !== false,
                codepage: ps?.rawCodepage || "cp1252",
              });
              if (!ok) Alert.alert("Test KOT", "Could not send to the KOT printer. Check the printer name and connection.");
              else Alert.alert("Test KOT sent", `Sent a test ticket to "${target || "default printer"}".`);
            }}
            style={[s.saveBtn, { backgroundColor: colors.success, borderRadius: colors.radius, flex: 1 }]}
          >
            <Feather name="printer" size={16} color="#fff" />
            <Text style={s.saveBtnText}>Test KOT Print</Text>
          </TouchableOpacity>
        </View>
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
            {permissions.deleteStaff && (
              <TouchableOpacity onPress={() => handleDeleteStaff(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </TouchableOpacity>
            )}
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
            {permissions.deleteTax && (
              <TouchableOpacity onPress={() => handleDeleteTax(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity onPress={() => { setEditingTax(null); setTaxName(""); setTaxRate(""); setShowTaxModal(true); }}
        style={[s.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderRiders = () => {
    const riderLabel = isSaloon ? "Stylists" : "Delivery Riders";
    const riderIcon = isSaloon ? "scissors" : "truck";
    const riderColor = isSaloon ? "#E91E8C" : "#3498DB";
    return (
      <View style={s.sectionContent}>
        {renderHeader(riderLabel)}
        <FlatList
          data={riderList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={<Text style={[s.emptyText, { color: colors.mutedForeground }]}>No {riderLabel.toLowerCase()} yet. Tap + to add one.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => { setEditingRider(item); setRiderName(item.name); setRiderPhone(item.phone || ""); setRiderActive(item.active ?? true); setRiderCommission(String(item.commissionPct ?? 0)); setShowRiderModal(true); }}
              style={[s.listItem, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: item.active ? 1 : 0.6 }]}>
              <View style={[s.cardIconWrap, { backgroundColor: riderColor + "18" }]}>
                <Feather name={riderIcon as any} size={18} color={riderColor} />
              </View>
              <View style={s.listItemInfo}>
                <Text style={[s.listItemTitle, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[s.listItemSub, { color: colors.mutedForeground }]}>{item.phone || "No phone"} · {item.active ? "Active" : "Inactive"}{(item.commissionPct ?? 0) > 0 ? ` · ${item.commissionPct}% commission` : ""}</Text>
              </View>
              {permissions.deleteRiders && (
                <TouchableOpacity onPress={() => handleDeleteRider(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity onPress={() => { setEditingRider(null); setRiderName(""); setRiderPhone(""); setRiderActive(true); setRiderCommission("0"); setShowRiderModal(true); }}
          style={[s.fab, { backgroundColor: colors.primary, borderRadius: 28, bottom: insets.bottom + 20 }]}>
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

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
                {permissions.deleteIngredients && (
                  <TouchableOpacity onPress={() => handleDeleteIngredient(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                )}
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

  const saveEmailSettings = useCallback(async () => {
    const emailTrimmed = zReportEmail.trim();
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      Alert.alert("Invalid Email", "Please enter a valid recipient email address.");
      return;
    }
    const portNum = parseInt(smtpPort, 10);
    if (smtpHost.trim() && (isNaN(portNum) || portNum <= 0 || portNum > 65535)) {
      Alert.alert("Invalid Port", "Please enter a valid SMTP port (1–65535).");
      return;
    }
    try {
      const biz = bizSettings ?? await db.loadBusinessSettings();
      const smtpConfig: SmtpConfig | undefined = smtpHost.trim() ? {
        host: smtpHost.trim(),
        port: portNum || 587,
        secure: smtpSecure,
        user: smtpUser.trim(),
        pass: smtpPass,
        fromEmail: smtpFromEmail.trim() || smtpUser.trim(),
        fromName: smtpFromName.trim(),
      } : undefined;
      const updated: BusinessSettings = { ...biz, zReportEmail: emailTrimmed || undefined, smtpConfig };
      await db.saveBusinessSettings(updated);
      setBizSettings(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Email settings saved. Z-Reports will be sent automatically via SMTP when closing the register.");
    } catch {
      Alert.alert("Error", "Failed to save email settings. Please try again.");
    }
  }, [bizSettings, zReportEmail, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFromEmail, smtpFromName, db]);

  const testSmtpConnection = useCallback(async () => {
    const recipientEmail = zReportEmail.trim();
    if (!recipientEmail) {
      Alert.alert("No Recipient", "Enter a recipient email address before testing.");
      return;
    }
    if (!smtpHost.trim() || !smtpUser.trim() || !smtpPass) {
      Alert.alert("Incomplete Config", "Please fill in SMTP host, username and password.");
      return;
    }
    setIsSendingTest(true);
    try {
      const baseUrl = Platform.OS === "web" ? "" : `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
      const response = await fetch(`${baseUrl}/api/email/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          config: {
            host: smtpHost.trim(),
            port: parseInt(smtpPort, 10) || 587,
            secure: smtpSecure,
            user: smtpUser.trim(),
            pass: smtpPass,
            fromEmail: smtpFromEmail.trim() || smtpUser.trim(),
            fromName: smtpFromName.trim(),
          },
        }),
      });
      const result = await response.json() as { success: boolean; message: string };
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Test Successful", `Test email sent to ${recipientEmail}. Check your inbox.`);
      } else {
        Alert.alert("Connection Failed", result.message || "Could not connect to SMTP server.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Test Failed", `Could not reach the email API.\n\n${msg}`);
    } finally {
      setIsSendingTest(false);
    }
  }, [zReportEmail, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFromEmail, smtpFromName]);

  const renderEmailSettings = () => (
    <View style={s.sectionContent}>
      {renderHeader("Email Settings")}
      <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>

        {/* ── SMTP Server ── */}
        <View style={[{ backgroundColor: colors.primary + "12", borderRadius: colors.radius, padding: 12, marginBottom: 18 }]}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", marginBottom: 4 }}>SMTP Configuration</Text>
          <Text style={{ color: colors.primary, fontSize: 12, lineHeight: 17 }}>
            Configure your outgoing mail server so Z-Reports are sent automatically when you close the register. Common providers: Gmail (smtp.gmail.com:587), Outlook (smtp.office365.com:587).
          </Text>
        </View>

        {renderField("SMTP Host", smtpHost, setSmtpHost, "e.g. smtp.gmail.com")}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Port</Text>
            <TextInput
              value={smtpPort}
              onChangeText={setSmtpPort}
              placeholder="587"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Security</Text>
            <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 12, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Switch
                value={smtpSecure}
                onValueChange={setSmtpSecure}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                {smtpSecure ? "SSL/TLS" : "STARTTLS"}
              </Text>
            </View>
          </View>
        </View>

        {renderField("SMTP Username", smtpUser, setSmtpUser, "e.g. your@email.com")}

        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>SMTP Password / App Password</Text>
        <TextInput
          value={smtpPass}
          onChangeText={setSmtpPass}
          placeholder="••••••••"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
        />

        <View style={[{ backgroundColor: colors.secondary, borderRadius: colors.radius, padding: 10, marginBottom: 4 }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            For Gmail: use an App Password (Google Account → Security → App passwords). For Outlook: use your normal password or App password if 2FA is enabled.
          </Text>
        </View>

        {/* ── From Address ── */}
        <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 18 }]}>From Name</Text>
        <TextInput
          value={smtpFromName}
          onChangeText={setSmtpFromName}
          placeholder="e.g. Al Baraka POS"
          placeholderTextColor={colors.mutedForeground}
          style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
        />

        {renderField("From Email (optional)", smtpFromEmail, setSmtpFromEmail, "Leave blank to use SMTP username")}

        {/* ── Recipient ── */}
        <View style={[{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, marginBottom: 16 }]} />
        <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Z-Report Recipient Email</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 6 }}>
          Z-Reports will be sent to this address each time the register is closed.
        </Text>
        <TextInput
          value={zReportEmail}
          onChangeText={setZReportEmail}
          placeholder="e.g. owner@albaraka.ae"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
        />

        {zReportEmail.trim() && smtpHost.trim() ? (
          <View style={[{ backgroundColor: colors.success + "15", borderRadius: colors.radius, flexDirection: "row", alignItems: "center", padding: 12, gap: 8, marginTop: 8 }]}>
            <Feather name="check-circle" size={14} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 13, flex: 1 }}>
              Z-Reports will be auto-emailed via SMTP to {zReportEmail.trim()}
            </Text>
          </View>
        ) : zReportEmail.trim() && !smtpHost.trim() ? (
          <View style={[{ backgroundColor: "#F39C12" + "15", borderRadius: colors.radius, flexDirection: "row", alignItems: "center", padding: 12, gap: 8, marginTop: 8 }]}>
            <Feather name="alert-circle" size={14} color="#F39C12" />
            <Text style={{ color: "#F39C12", fontSize: 13, flex: 1 }}>
              Recipient set, but no SMTP server configured. Z-Reports will use device email client.
            </Text>
          </View>
        ) : (
          <View style={[{ backgroundColor: colors.secondary, borderRadius: colors.radius, flexDirection: "row", alignItems: "center", padding: 12, gap: 8, marginTop: 8 }]}>
            <Feather name="mail" size={14} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontSize: 13, flex: 1 }}>
              No email configured. Z-Reports will only be printed.
            </Text>
          </View>
        )}

        {/* ── Actions ── */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            onPress={testSmtpConnection}
            disabled={isSendingTest}
            style={[s.saveBtn, { flex: 1, backgroundColor: colors.secondary, borderRadius: colors.radius, marginTop: 0, borderWidth: 1, borderColor: colors.border, opacity: isSendingTest ? 0.4 : 1, flexDirection: "row", gap: 6 }]}
          >
            {isSendingTest ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="send" size={15} color={colors.primary} />
            )}
            <Text style={[s.saveBtnText, { color: colors.primary }]}>{isSendingTest ? "Sending..." : "Send Test"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={saveEmailSettings}
            style={[s.saveBtn, { flex: 1, backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 0, flexDirection: "row", gap: 6 }]}
          >
            <Feather name="save" size={15} color="#fff" />
            <Text style={s.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );

  const renderPermissions = () => {
    if (currentStaff && currentStaff.role !== "admin") {
      return (
        <View style={s.sectionContent}>
          {renderHeader("Permissions")}
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Feather name="lock" size={40} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
            <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700", marginTop: 16 }}>Admin Only</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center", marginTop: 8 }}>Only administrators can configure staff permissions.</Text>
          </View>
        </View>
      );
    }

    const toggle = (key: keyof StaffPermissions, val: boolean) =>
      setCashierPerms((p) => ({ ...p, [key]: val }));

    const SectionHead = ({ title }: { title: string }) => (
      <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 24, marginBottom: 2 }]}>{title}</Text>
    );

    return (
      <View style={s.sectionContent}>
        {renderHeader("Permissions")}
        <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8, lineHeight: 18 }}>
            Admins always have full access. Configure what Cashier staff can do.
          </Text>

          <SectionHead title="Back Office Access" />
          {renderSwitch("Can Access Back Office", cashierPerms.canAccessBackOffice, (v) => toggle("canAccessBackOffice", v))}

          {cashierPerms.canAccessBackOffice && (
            <>
              <SectionHead title="Back Office Sections" />
              {renderSwitch("Products", cashierPerms.boProducts, (v) => toggle("boProducts", v))}
              {renderSwitch("Customers", cashierPerms.boCustomers, (v) => toggle("boCustomers", v))}
              {renderSwitch("Reports", cashierPerms.boReports, (v) => toggle("boReports", v))}
              {renderSwitch("Categories", cashierPerms.boCategories, (v) => toggle("boCategories", v))}
              {renderSwitch("Delivery Riders", cashierPerms.boRiders, (v) => toggle("boRiders", v))}
              {renderSwitch("Ingredients", cashierPerms.boIngredients, (v) => toggle("boIngredients", v))}
              {renderSwitch("Recipes", cashierPerms.boRecipes, (v) => toggle("boRecipes", v))}
              {renderSwitch("Receipt Designer", cashierPerms.boReceipt, (v) => toggle("boReceipt", v))}
              {renderSwitch("Printer Settings", cashierPerms.boPrinter, (v) => toggle("boPrinter", v))}
              {renderSwitch("KOT Settings", cashierPerms.boKOT, (v) => toggle("boKOT", v))}
              {renderSwitch("Customer Display", cashierPerms.boDisplay, (v) => toggle("boDisplay", v))}
              {renderSwitch("Staff Management", cashierPerms.boStaff, (v) => toggle("boStaff", v))}
              {renderSwitch("Tax Groups", cashierPerms.boTax, (v) => toggle("boTax", v))}
              {renderSwitch("Business Settings", cashierPerms.boBusiness, (v) => toggle("boBusiness", v))}
            </>
          )}

          <SectionHead title="Delete Rights" />
          {renderSwitch("Delete Products", cashierPerms.deleteProducts, (v) => toggle("deleteProducts", v))}
          {renderSwitch("Delete Customers", cashierPerms.deleteCustomers, (v) => toggle("deleteCustomers", v))}
          {renderSwitch("Delete Categories", cashierPerms.deleteCategories, (v) => toggle("deleteCategories", v))}
          {renderSwitch("Delete Delivery Riders", cashierPerms.deleteRiders, (v) => toggle("deleteRiders", v))}
          {renderSwitch("Delete Ingredients", cashierPerms.deleteIngredients, (v) => toggle("deleteIngredients", v))}
          {renderSwitch("Delete Staff", cashierPerms.deleteStaff, (v) => toggle("deleteStaff", v))}
          {renderSwitch("Delete Tax Groups", cashierPerms.deleteTax, (v) => toggle("deleteTax", v))}
          {renderSwitch("Delete Tables", cashierPerms.deleteTables, (v) => toggle("deleteTables", v))}

          <SectionHead title="Register & Operations" />
          {renderSwitch("Process Refunds", cashierPerms.canRefund, (v) => toggle("canRefund", v))}
          {renderSwitch("Apply Discounts", cashierPerms.canApplyDiscount, (v) => toggle("canApplyDiscount", v))}
          {renderSwitch("Manage Tables (Add / Edit)", cashierPerms.canManageTables, (v) => toggle("canManageTables", v))}

          <TouchableOpacity
            onPress={savePermissions}
            style={[s.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 32, flexDirection: "row", gap: 8 }]}
          >
            <Feather name="save" size={16} color="#fff" />
            <Text style={s.saveBtnText}>Save Permissions</Text>
          </TouchableOpacity>
          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    );
  };

  const renderContent = () => {
    switch (section) {
      case "menu": return renderMenu();
      case "products": return (
        <View style={s.sectionContent}>
          {renderHeader("Products")}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card, gap: 8 }}>
            {productCsvMsg ? (
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setProductCsvMsg(null)}>
                <Text style={{ fontSize: 12, color: productCsvMsg.ok ? "#16A085" : "#E74C3C", lineHeight: 16 }} numberOfLines={2}>
                  {productCsvMsg.text}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground }}>
                Export products to CSV or import from a CSV file.
              </Text>
            )}
            <TouchableOpacity
              disabled={productCsvBusy}
              onPress={onProductExport}
              style={{ backgroundColor: colors.primary + "22", paddingHorizontal: 12, paddingVertical: 7, borderRadius: colors.radius, opacity: productCsvBusy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>↓ Export</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={productCsvBusy}
              onPress={onProductImport}
              style={{ backgroundColor: "#16A08522", paddingHorizontal: 12, paddingVertical: 7, borderRadius: colors.radius, opacity: productCsvBusy ? 0.5 : 1 }}
            >
              <Text style={{ color: "#16A085", fontSize: 13, fontWeight: "600" }}>↑ Import</Text>
            </TouchableOpacity>
          </View>
          <ProductsScreen embedded />
        </View>
      );
      case "customers": return <View style={s.sectionContent}>{renderHeader("Customers")}<CustomersScreen embedded /></View>;
      case "reports": return <ReportsHub onBack={() => setSection("menu")} workMode={licenseSession?.workMode ?? "standard"} />;
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
      case "permissions": return renderPermissions();
      case "emailSettings": return renderEmailSettings();
      case "database": return renderDatabase();
      case "syncQueue": return (
        <SyncQueueScreen onBack={() => setSection("menu")} />
      );
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
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowRiderModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {editingRider ? (isSaloon ? "Edit Stylist" : "Edit Rider") : (isSaloon ? "New Stylist" : "New Rider")}
            </Text>
            <TouchableOpacity onPress={handleSaveRider}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            {renderField("Name", riderName, setRiderName, isSaloon ? "Stylist name" : "Rider name")}
            {renderField("Phone", riderPhone, setRiderPhone, "050-xxx-xxxx")}
            {renderField("Commission %", riderCommission, setRiderCommission, "e.g. 10", "decimal-pad")}
            {renderSwitch("Active", riderActive, setRiderActive)}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showIngModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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

      <Modal visible={showPrinterModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowPrinterModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{editingPrinter ? "Edit Printer" : "New Printer"}</Text>
            <TouchableOpacity onPress={handleSavePrinter}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent}>
            {renderField("Printer Name", printerNameInput, setPrinterNameInput, "e.g. Kitchen Printer 1")}
            {renderField("IP Address", printerIpInput, setPrinterIpInput, "192.168.1.100")}

            <Text style={[s.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Printer Type</Text>
            <View style={s.chipRow}>
              {(["receipt", "kitchen", "both"] as const).map((pt) => (
                <TouchableOpacity key={pt} onPress={() => setPrinterTypeInput(pt)}
                  style={[s.chip, { backgroundColor: printerTypeInput === pt ? colors.primary : colors.secondary, borderColor: printerTypeInput === pt ? colors.primary : colors.border, borderRadius: colors.radius }]}>
                  <Text style={{ color: printerTypeInput === pt ? "#fff" : colors.mutedForeground, fontWeight: "600", textTransform: "capitalize" }}>
                    {pt === "both" ? "Receipt & Kitchen" : pt === "receipt" ? "Receipt Only" : "Kitchen Only"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
  aboutCard: { flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, marginTop: 16, gap: 12 },
  aboutIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  aboutInfo: { flex: 1 },
  aboutAppName: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  aboutVersion: { fontSize: 11, marginTop: 1 },
  aboutProvider: { alignItems: "flex-end" },
  aboutProviderLabel: { fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 },
  aboutProviderName: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
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
  deactivateCard: { flexDirection: "row", alignItems: "flex-start", padding: 14, borderWidth: 1, marginTop: 12, gap: 12 },
  deactivateInfo: { flex: 1 },
  deactivateTitle: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  deactivateSub: { fontSize: 11, marginTop: 2 },
  deactivateWarning: { fontSize: 11, marginTop: 6, lineHeight: 15 },
  deactivateBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(231,76,60,0.10)", borderWidth: 1, borderColor: "rgba(231,76,60,0.25)" },
  deactivateBtnText: { color: "#E74C3C", fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  deactivateConfirmRow: { flexDirection: "column", gap: 6 },
  deactivateCancelBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  deactivateCancelText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  deactivateConfirmBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#E74C3C" },
  deactivateConfirmText: { color: "#fff", fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
