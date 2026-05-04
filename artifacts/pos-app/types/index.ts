export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  colorHex: string;
  barcode?: string;
  stockQuantity: number;
  taxGroupId?: string;
  lowStockThreshold: number;
  imageUri?: string;
  printerId?: string;
}

export interface PrinterConfig {
  id: string;
  name: string;
  ipAddress: string;
  type: "receipt" | "kitchen" | "both";
}

export interface Category {
  id: string;
  name: string;
  colorHex: string;
  imageUri?: string;
  sortOrder: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  discountAmount?: number;
  taxRate?: number;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  lineTotal: number;
  discountAmount?: number;
}

export interface SplitPaymentEntry {
  method: string;
  amount: number;
}

export type OrderType = "dine-in" | "takeaway" | "delivery";

export interface Sale {
  id: string;
  invoiceNumber: string;
  createdAt: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  paymentMethod: string;
  orderType?: OrderType;
  customerId?: string;
  customerName?: string;
  staffId?: string;
  staffName?: string;
  tableId?: string;
  tableName?: string;
  riderId?: string;
  riderName?: string;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  isRefund?: boolean;
  originalSaleId?: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  splitPayments?: SplitPaymentEntry[];
  items?: SaleItem[];
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  vehicleInfo: string;
  active: boolean;
  createdAt: number;
}

export interface HeldOrder {
  id: string;
  tableId: string;
  tableName: string;
  orderType: OrderType;
  staffId?: string;
  staffName?: string;
  customerId?: string;
  customerName?: string;
  createdAt: number;
  updatedAt: number;
  items: HeldOrderItem[];
}

export interface HeldOrderItem {
  id: string;
  heldOrderId: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  colorHex: string;
  category: string;
  taxRate?: number;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  discountAmount?: number;
  imageUri?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  costPerUnit: number;
  lowStockThreshold: number;
  createdAt: number;
}

export interface RecipeIngredient {
  id: string;
  productId: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  creditBalance: number;
  loyaltyPoints: number;
  createdAt: number;
}

export interface CreditPayment {
  id: string;
  customerId: string;
  amount: number;
  note: string;
  createdAt: number;
}

export interface Staff {
  id: string;
  name: string;
  role: "admin" | "cashier";
  pin: string;
  active: boolean;
  createdAt: number;
}

export interface StaffPermissions {
  canAccessBackOffice: boolean;
  boProducts: boolean;
  boCustomers: boolean;
  boReports: boolean;
  boCategories: boolean;
  boRiders: boolean;
  boIngredients: boolean;
  boRecipes: boolean;
  boReceipt: boolean;
  boPrinter: boolean;
  boKOT: boolean;
  boDisplay: boolean;
  boStaff: boolean;
  boTax: boolean;
  boBusiness: boolean;
  deleteProducts: boolean;
  deleteCustomers: boolean;
  deleteCategories: boolean;
  deleteRiders: boolean;
  deleteIngredients: boolean;
  deleteStaff: boolean;
  deleteTax: boolean;
  deleteTables: boolean;
  canRefund: boolean;
  canApplyDiscount: boolean;
  canManageTables: boolean;
}

export interface PosTable {
  id: string;
  name: string;
  capacity: number;
  status: "available" | "occupied" | "reserved";
  currentOrderId?: string;
  createdAt: number;
}

export interface TaxGroup {
  id: string;
  name: string;
  rate: number;
}

export interface ReceiptDesignSettings {
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showTrn: boolean;
  fontSize: "small" | "medium" | "large";
  paperWidth: "58mm" | "80mm";
}

export interface PrinterSettings {
  paperWidth: "58mm" | "80mm";
  autoPrintReceipt: boolean;
  autoPrintKOT: boolean;
  printMethod: "system" | "direct";
  printerIp: string;
  printers: PrinterConfig[];
  defaultReceiptPrinterId: string;
  defaultKOTPrinterId: string;
}

export interface KOTSettings {
  enabled: boolean;
  showPrice: boolean;
  showNotes: boolean;
  fontSize: "small" | "medium" | "large";
  categoryRouting: Record<string, string>;
}

export interface CustomerDisplaySettings {
  showItemList: boolean;
  showTotal: boolean;
  welcomeMessage: string;
  thankYouMessage: string;
  displayMode: "mirror" | "summary" | "custom";
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

export interface BusinessSettings {
  businessName: string;
  trn: string;
  address: string;
  phone: string;
  email: string;
  logoBase64?: string;
  loyaltyPointsPerAed: number;
  loyaltyRedemptionRate: number;
  receiptDesign?: ReceiptDesignSettings;
  printerSettings?: PrinterSettings;
  kotSettings?: KOTSettings;
  customerDisplay?: CustomerDisplaySettings;
  rolePermissions?: { cashier: StaffPermissions };
  zReportEmail?: string;
  smtpConfig?: SmtpConfig;
  lastClosedAt?: number;
}

export interface ZReport {
  date: string;
  openedAt: number;
  closedAt: number;
  openingCash: number;
  closingCash: number;
  totalSales: number;
  totalRefunds: number;
  netSales: number;
  totalVat: number;
  totalDiscount: number;
  transactionCount: number;
  refundCount: number;
  paymentBreakdown: { method: string; amount: number }[];
  categorySales: { category: string; amount: number }[];
  staffSales: { staffName: string; amount: number; count: number }[];
}

export const VAT_RATE = 0.05;

export const CURRENCY = "AED";

export function formatCurrency(amount: number): string {
  return `${CURRENCY} ${amount.toFixed(2)}`;
}

export const CATEGORIES = ["All", "Beverages", "Food", "Snacks", "Desserts"];

export const PRODUCT_COLORS = [
  "#4F8EF7",
  "#6C63FF",
  "#2ECC71",
  "#F39C12",
  "#E74C3C",
  "#1ABC9C",
  "#9B59B6",
  "#E67E22",
];

export const SEED_PRODUCTS: Product[] = [
  { id: "p1", name: "Espresso", category: "Beverages", price: 12, description: "Single shot espresso", colorHex: "#E74C3C", stockQuantity: 999, lowStockThreshold: 10 },
  { id: "p2", name: "Cappuccino", category: "Beverages", price: 15, description: "Espresso with milk foam", colorHex: "#E67E22", stockQuantity: 999, lowStockThreshold: 10 },
  { id: "p3", name: "Latte", category: "Beverages", price: 18, description: "Espresso with steamed milk", colorHex: "#F39C12", stockQuantity: 999, lowStockThreshold: 10 },
  { id: "p4", name: "Americano", category: "Beverages", price: 14, description: "Espresso with hot water", colorHex: "#8E44AD", stockQuantity: 999, lowStockThreshold: 10 },
  { id: "p5", name: "Green Tea", category: "Beverages", price: 10, description: "Japanese green tea", colorHex: "#2ECC71", stockQuantity: 999, lowStockThreshold: 10 },
  { id: "p6", name: "Orange Juice", category: "Beverages", price: 15, description: "Fresh squeezed", colorHex: "#F39C12", stockQuantity: 999, lowStockThreshold: 10 },
  { id: "p7", name: "Club Sandwich", category: "Food", price: 35, description: "Triple decker sandwich", colorHex: "#4F8EF7", stockQuantity: 50, lowStockThreshold: 5 },
  { id: "p8", name: "Caesar Salad", category: "Food", price: 38, description: "Classic caesar salad", colorHex: "#1ABC9C", stockQuantity: 50, lowStockThreshold: 5 },
  { id: "p9", name: "Margherita Pizza", category: "Food", price: 55, description: "Classic pizza", colorHex: "#E74C3C", stockQuantity: 30, lowStockThreshold: 5 },
  { id: "p10", name: "Pasta Bolognese", category: "Food", price: 52, description: "Pasta with meat sauce", colorHex: "#E67E22", stockQuantity: 30, lowStockThreshold: 5 },
  { id: "p11", name: "Chips", category: "Snacks", price: 8, description: "Salted potato chips", colorHex: "#F1C40F", stockQuantity: 100, lowStockThreshold: 10 },
  { id: "p12", name: "Cookies", category: "Snacks", price: 10, description: "Chocolate chip cookies", colorHex: "#8E44AD", stockQuantity: 100, lowStockThreshold: 10 },
  { id: "p13", name: "Nachos", category: "Snacks", price: 18, description: "Nachos with salsa", colorHex: "#E67E22", stockQuantity: 60, lowStockThreshold: 5 },
  { id: "p14", name: "Pretzel", category: "Snacks", price: 12, description: "Warm soft pretzel", colorHex: "#4F8EF7", stockQuantity: 60, lowStockThreshold: 5 },
  { id: "p15", name: "Chocolate Cake", category: "Desserts", price: 25, description: "Rich chocolate cake", colorHex: "#9B59B6", stockQuantity: 20, lowStockThreshold: 3 },
  { id: "p16", name: "Cheesecake", category: "Desserts", price: 28, description: "New York cheesecake", colorHex: "#4F8EF7", stockQuantity: 20, lowStockThreshold: 3 },
  { id: "p17", name: "Ice Cream", category: "Desserts", price: 18, description: "Two scoops", colorHex: "#E74C3C", stockQuantity: 40, lowStockThreshold: 5 },
  { id: "p18", name: "Brownie", category: "Desserts", price: 15, description: "Warm fudge brownie", colorHex: "#6C63FF", stockQuantity: 40, lowStockThreshold: 5 },
];

export const SEED_CATEGORIES: Category[] = [
  { id: "cat_beverages", name: "Beverages", colorHex: "#E74C3C", sortOrder: 1 },
  { id: "cat_food", name: "Food", colorHex: "#4F8EF7", sortOrder: 2 },
  { id: "cat_snacks", name: "Snacks", colorHex: "#F39C12", sortOrder: 3 },
  { id: "cat_desserts", name: "Desserts", colorHex: "#9B59B6", sortOrder: 4 },
];

export const DEFAULT_RECEIPT_DESIGN: ReceiptDesignSettings = {
  headerText: "",
  footerText: "Thank you for your business!\nشكراً لتعاملكم معنا",
  showLogo: false,
  showTrn: true,
  fontSize: "medium",
  paperWidth: "80mm",
};

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  paperWidth: "80mm",
  autoPrintReceipt: false,
  autoPrintKOT: false,
  printMethod: "system",
  printerIp: "",
  printers: [],
  defaultReceiptPrinterId: "",
  defaultKOTPrinterId: "",
};

export const DEFAULT_KOT_SETTINGS: KOTSettings = {
  enabled: true,
  showPrice: false,
  showNotes: true,
  fontSize: "medium",
  categoryRouting: {},
};

export const DEFAULT_CUSTOMER_DISPLAY: CustomerDisplaySettings = {
  showItemList: true,
  showTotal: true,
  welcomeMessage: "Welcome!",
  thankYouMessage: "Thank you for your purchase!",
  displayMode: "mirror",
};

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  businessName: "",
  trn: "",
  address: "",
  phone: "",
  email: "",
  loyaltyPointsPerAed: 1,
  loyaltyRedemptionRate: 0.01,
  receiptDesign: DEFAULT_RECEIPT_DESIGN,
  printerSettings: DEFAULT_PRINTER_SETTINGS,
  kotSettings: DEFAULT_KOT_SETTINGS,
  customerDisplay: DEFAULT_CUSTOMER_DISPLAY,
};

export const ADMIN_PERMISSIONS: StaffPermissions = {
  canAccessBackOffice: true,
  boProducts: true, boCustomers: true, boReports: true, boCategories: true,
  boRiders: true, boIngredients: true, boRecipes: true, boReceipt: true,
  boPrinter: true, boKOT: true, boDisplay: true, boStaff: true,
  boTax: true, boBusiness: true,
  deleteProducts: true, deleteCustomers: true, deleteCategories: true,
  deleteRiders: true, deleteIngredients: true, deleteStaff: true,
  deleteTax: true, deleteTables: true,
  canRefund: true, canApplyDiscount: true, canManageTables: true,
};

export const DEFAULT_CASHIER_PERMISSIONS: StaffPermissions = {
  canAccessBackOffice: false,
  boProducts: false, boCustomers: false, boReports: false, boCategories: false,
  boRiders: false, boIngredients: false, boRecipes: false, boReceipt: false,
  boPrinter: false, boKOT: false, boDisplay: false, boStaff: false,
  boTax: false, boBusiness: false,
  deleteProducts: false, deleteCustomers: false, deleteCategories: false,
  deleteRiders: false, deleteIngredients: false, deleteStaff: false,
  deleteTax: false, deleteTables: false,
  canRefund: false, canApplyDiscount: true, canManageTables: true,
};
