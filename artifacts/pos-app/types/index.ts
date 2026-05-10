export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  colorHex: string;
  barcode?: string;
  stockQuantity: number;
  /**
   * When true the product has real stock tracking enabled: the POS deducts
   * units on sale, shows a quantity badge, and alerts when low.
   * When false (default) the product is "untracked" — it behaves as if it
   * has infinite stock. Stored as 0/1 in SQLite via the `stock_tracking`
   * column; absent in legacy JSON is treated as false.
   */
  stockTracked?: boolean;
  taxGroupId?: string;
  lowStockThreshold: number;
  imageUri?: string;
  printerId?: string;
  /**
   * If true, the cashier can override the unit price during a sale via
   * a popup. When false (default), the price is fixed. Stored as 0/1
   * in SQLite; absent on legacy rows is treated as false.
   */
  priceChangeAllowed?: boolean;
  /**
   * If true, the product's `price` already INCLUDES VAT (gross). VAT is
   * back-calculated when computing line totals. When false (default),
   * VAT is added on top (the legacy behavior). Stored as 0/1 in SQLite.
   */
  vatInclusive?: boolean;
  /**
   * Wall-clock ms epoch of the last edit. Used for last-write-wins
   * conflict resolution when syncing the catalog with the cloud. Optional
   * for back-compat with seed data; absent / 0 is treated as "older than
   * any real edit".
   */
  updatedAt?: number;
  /**
   * Saloon mode: estimated service duration in minutes (e.g. 45 for a
   * haircut). Used for appointment scheduling / bookings. NULL / undefined
   * in standard mode; ignored for stock-tracked retail items in saloon mode.
   */
  durationMinutes?: number;
  /**
   * When false the product is inactive and hidden from POS pickers/grids.
   * Absent on legacy rows is treated as true (active). Stored as 0/1 in SQLite.
   */
  isActive?: boolean;
  /**
   * Retail mode: when true, this product is sold by weight (e.g. loose produce,
   * deli items). The price field is treated as price-per-kg. Weight barcodes
   * (EAN-13 prefix 20–29) decoded by the scanner supply the cart quantity in kg.
   * Stored as 0/1 in SQLite.
   */
  soldByWeight?: boolean;
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
  /** See Product.updatedAt — same LWW semantics. */
  updatedAt?: number;
  /** When false the category is inactive and hidden from POS. Absent = active. */
  isActive?: boolean;
}

/** One selectable option within a modifier group (e.g. "Extra Cheese +2.00"). */
export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  /** Positive = add to price, 0 = free, negative = subtract. */
  priceAdjustment: number;
  sortOrder: number;
}

/**
 * A named group of options attached to a product (e.g. "Size", "Add-ons").
 * `maxSelections = 1` renders as radio buttons; >1 as checkboxes.
 * `required = true` forces at least `minSelections` (default 1) choice.
 * Restaurant mode only — not used in saloon mode.
 */
export interface ModifierGroup {
  id: string;
  productId: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  options: ModifierOption[];
}

/** The specific modifier option chosen for one cart / sale line item. */
export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  discountAmount?: number;
  taxRate?: number;
  /** Saloon mode: stylist assigned to this specific line item. */
  stylistId?: string;
  stylistName?: string;
  /** Laundry mode: special care instructions for this item (e.g. "Starch", "Handle with care"). */
  notes?: string;
  /** Restaurant mode: modifier options chosen for this line. */
  selectedModifiers?: SelectedModifier[];
  /** Pre-computed sum of all selectedModifiers[].priceAdjustment. */
  modifierTotal?: number;
  /**
   * Unique key for this cart line. Set when modifiers are present so two
   * lines for the same product but different modifier choices coexist.
   * When undefined, the product.id is used as the line key (legacy behaviour).
   */
  lineId?: string;
  /**
   * Retail / weight-scale items: weight captured from the EAN-13 barcode in kg.
   * When set the cart quantity equals this value; the +/- quantity buttons are
   * hidden (weight is fixed by the scale label). Each weight scan creates its own
   * line (never merges) via a unique lineId.
   */
  weightKg?: number;
  /**
   * Saloon mode: set when this line is being redeemed from a customer prepaid
   * package. The value is the CustomerPackage.id. The line total is zeroed via
   * a full-price discount applied at the time of redemption toggle.
   */
  packageRedemptionId?: string;
  /**
   * Saloon mode: when true this cart line represents a prepaid package being
   * sold to the selected customer (not a regular service). `packageId` must be
   * set; on checkout success `purchaseCustomerPackage` is called automatically.
   */
  isPackagePurchase?: boolean;
  /** Saloon mode: the PrepaidPackage.id being sold when isPackagePurchase=true. */
  packageId?: string;
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
  /** Saloon mode: stylist who performed this service. */
  stylistId?: string;
  stylistName?: string;
  /** Restaurant mode: snapshot of modifier choices at time of sale. */
  modifiers?: SelectedModifier[];
  modifierTotal?: number;
  /** Saloon mode: the CustomerPackage.id if this session was redeemed from a prepaid package. */
  packageRedemptionId?: string;
}

/**
 * A prepaid package definition (saloon mode only).
 * Customers purchase these upfront and redeem sessions against their balance.
 * The `price` is the total package price (all sessions bundled).
 */
export interface PrepaidPackage {
  id: string;
  name: string;
  description: string;
  /** Number of sessions included in this package. */
  totalSessions: number;
  /** Total package price in AED. */
  price: number;
  /**
   * When null the package can be redeemed against any service.
   * When set, only the listed product IDs are eligible for redemption.
   */
  applicableServiceIds: string[] | null;
  isActive: boolean;
  createdAt: number;
}

/**
 * A service bundle groups multiple DIFFERENT services at one combined price.
 * e.g. "VIP Package: Haircut + Beard + Facial = AED 200"
 * Sold as a single cart line item — distinct from PrepaidPackage (session credits).
 */
export interface ServiceBundle {
  id: string;
  name: string;
  description: string;
  /** Combined selling price of the bundle in AED. */
  price: number;
  /** The services included in this bundle (for display / info). */
  services: Array<{ serviceId: string; serviceName: string }>;
  isActive: boolean;
  createdAt: number;
}

/**
 * A customer's purchased instance of a PrepaidPackage.
 * Created on checkout when a package cart line is present.
 * Each service redemption increments `usedSessions` by 1.
 */
export interface CustomerPackage {
  id: string;
  packageId: string;
  customerId: string;
  customerName: string;
  packageName: string;
  totalSessions: number;
  usedSessions: number;
  purchaseSaleId: string | null;
  purchasedAt: number;
  /** Optional expiry epoch ms. null = never expires. */
  expiresAt: number | null;
  isActive: boolean;
}

export type LaundryOrderStatus = "received" | "ready" | "collected";

export interface LaundryOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string | null;
}

export interface LaundryOrder {
  id: string;
  ticketNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  status: LaundryOrderStatus;
  /** ms epoch when the order is promised to be ready */
  promisedAt: number;
  orderType: "drop-off" | "express";
  notes: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  /** null = pay on collection */
  paidAt: number | null;
  paymentMethod: string | null;
  /** linked Sale.id once collected and paid */
  saleId: string | null;
  staffId: string | null;
  staffName: string | null;
  createdAt: number;
  updatedAt: number;
  items: LaundryOrderItem[];
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
  cashTendered?: number;
  changeDue?: number;
  /** Customer's credit balance BEFORE this sale (snapshot at time of charge). Used on receipt to show old balance + new outstanding. */
  customerCreditBalance?: number;
  /** Short kitchen order number generated by the device, e.g. "#C3A1-0042". Distinct from the tax invoice number. */
  orderNumber?: string;
  items?: SaleItem[];
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  vehicleInfo: string;
  active: boolean;
  createdAt: number;
  commissionPct?: number;
}

export type KdsStatus = "new" | "preparing" | "ready" | "bumped";

export type AppointmentStatus = "scheduled" | "in-progress" | "completed" | "cancelled" | "no-show";

export interface Appointment {
  id: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  stylistId?: string;
  stylistName: string;
  serviceName: string;
  chairId?: string;
  chairName: string;
  appointmentDate: number;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string;
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
  kdsStatus?: KdsStatus;
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
  /**
   * Wall-clock ms epoch of the last local edit, used by Phase 3d catalog
   * sync for last-write-wins resolution. Optional because legacy SQLite
   * rows pre-Phase-3d may not have it (treated as 0 by the LWW comparison
   * so any real cloud edit wins over those rows).
   */
  updatedAt?: number;
  /** When false the customer is inactive and hidden from POS pickers. Absent = active. */
  isActive?: boolean;
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
  /**
   * - "admin"   — full back office access, ADMIN_PERMISSIONS
   * - "manager" — full back office access except business settings; cannot
   *               delete anything or create admin-level staff.
   * - "cashier" — register only, permissions governed by rolePermissions.cashier
   * - "driver"  — laundry / delivery pickup role; uses cashier permissions.
   *               Designed for staff who visit customers, create orders on-device,
   *               and send the receipt via WhatsApp.
   */
  role: "admin" | "manager" | "cashier" | "driver";
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
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
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
  windowsReceiptPrinterName?: string;
  windowsKOTPrinterName?: string;
  windowsDrawerPrinterName?: string;
  rawTextMode?: boolean;
  autoCutPaper?: boolean;
  rawCodepage?: "cp437" | "cp1252" | "ascii";
  androidPrinterEnabled?: boolean;
  androidPrinterPath?: string;
  sunmiEnabled?: boolean;
  networkPrinterEnabled?: boolean;
  networkPrinterIp?: string;
  networkPrinterPort?: number;
  bluetoothPrinterEnabled?: boolean;
  bluetoothPrinterAddress?: string;
  bluetoothPrinterName?: string;
  usbPrinterEnabled?: boolean;
  usbPrinterVendorId?: number;
  usbPrinterProductId?: number;
  usbPrinterName?: string;
  usbPrintMode?: "text" | "bitmap";
}

export interface KOTSettings {
  enabled: boolean;
  showPrice: boolean;
  showNotes: boolean;
  fontSize: "small" | "medium" | "large";
  categoryRouting: Record<string, string>;
  categoryPrinters?: Record<string, string>;
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

/**
 * Configuration for EAN-13 weight-scale barcode decoding (retail mode).
 * GS1 reserves prefixes 20–29 for in-store printed labels that embed an
 * item PLU and either a weight (grams) or price (fils) in the barcode.
 */
export interface WeightBarcodeSettings {
  /** Master switch — when false the feature is completely disabled. */
  enabled: boolean;
  /**
   * EAN-13 2-digit prefixes treated as weight/price labels.
   * Default: all of 20–29.
   */
  prefixes: string[];
  /** Whether the 5-digit value field encodes weight (grams) or price (fils). */
  encoding: "weight" | "price";
  /**
   * Divide the raw 5-digit integer by this to convert to kg.
   * Default 1000 means the value field is in grams (1250 → 1.250 kg).
   */
  weightDivisor: number;
}

export const DEFAULT_WEIGHT_BARCODE_SETTINGS: WeightBarcodeSettings = {
  enabled: false,
  prefixes: ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"],
  encoding: "weight",
  weightDivisor: 1000,
};

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
  keyboardMode?: "off" | "builtin" | "windows-osk";
  /**
   * Master VAT switch. When false, all sales are zero-VAT regardless of
   * per-product taxGroup, the TRN field is hidden in Business Settings,
   * and "TRN" / "SIMPLIFIED TAX INVOICE" / "Prices inclusive" lines are
   * suppressed from receipts. Default true (back-compat).
   */
  vatEnabled?: boolean;
  /**
   * Cash drawer / register session state. `registerOpen===false` blocks
   * the Charge button; opening the register records `openingFloat` and
   * `openedAt` and unblocks sales. `lastClosingCash` is captured on
   * close so the next Open Register modal can pre-fill it.
   */
  registerOpen?: boolean;
  openingFloat?: number;
  openedAt?: number;
  lastClosingCash?: number;
  /**
   * When true (default), selling a tracked product whose stock_quantity
   * is already at or below zero is allowed — the quantity goes negative.
   * When false, adding an out-of-stock product to the cart is blocked
   * and the stock deduction is clamped to zero on the device ledger.
   */
  allowNegativeStock?: boolean;
  /**
   * Retail mode: EAN-13 weight-scale barcode decoding. When enabled, barcodes
   * with prefixes 20–29 are parsed to extract a 5-digit PLU and a weight (kg)
   * or price, and the matching product is added with the decoded weight as its
   * cart quantity.
   */
  weightBarcodeSettings?: WeightBarcodeSettings;
}

/**
 * Cash-out / petty-cash record. Subtracted from expected cash at close
 * and shown in the Z-Report. One row per outflow (e.g. "Paid milkman
 * 25 AED"); deletes are hard.
 */
export interface Expense {
  id: string;
  amount: number;
  note: string;
  staffId?: string;
  staffName?: string;
  createdAt: number;
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
  /** Sum of cash-out expenses recorded during the session. Subtracted from
   * expected cash so an over/short calc reflects petty-cash withdrawals. */
  totalExpenses?: number;
  /** Per-row breakdown for receipt audit. Optional for back-compat with
   * pre-feature reports that have no expense data. */
  expenses?: { id: string; amount: number; note: string; staffName?: string; createdAt: number }[];
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

// Default admin staff. PIN login is 4-digit, so the credentials are
// name "Admin" / PIN "1234". Shown as a hint on the lock screen on a
// fresh install. Can be changed/removed from Back Office → Staff.
export const SEED_STAFF: Staff[] = [
  { id: "staff_admin", name: "Admin", role: "admin", pin: "1234", active: true, createdAt: 0 },
];

export const SEED_TABLES: PosTable[] = [
  { id: "tbl_1", name: "Table 1", capacity: 4, status: "available", createdAt: 0 },
  { id: "tbl_2", name: "Table 2", capacity: 4, status: "available", createdAt: 0 },
  { id: "tbl_3", name: "Table 3", capacity: 2, status: "available", createdAt: 0 },
  { id: "tbl_4", name: "Table 4", capacity: 6, status: "available", createdAt: 0 },
];

export const SEED_TAX_GROUPS: TaxGroup[] = [
  { id: "tg_default", name: "Standard VAT (5%)", rate: 0.05 },
  { id: "tg_zero", name: "Zero-rated (0%)", rate: 0 },
];

export const SEED_CUSTOMERS: Customer[] = [
  { id: "cust_walkin", name: "Walk-in Customer", phone: "", email: "", company: "", creditBalance: 0, loyaltyPoints: 0, createdAt: 0 },
  { id: "cust_demo", name: "Demo Customer", phone: "+971500000000", email: "demo@example.com", company: "Al Salik Demo", creditBalance: 0, loyaltyPoints: 0, createdAt: 0 },
];

export const DEFAULT_RECEIPT_DESIGN: ReceiptDesignSettings = {
  headerText: "",
  footerText: "Thank you for your business!\nشكراً لتعاملكم معنا",
  showLogo: false,
  showTrn: true,
  fontSize: "medium",
  paperWidth: "80mm",
  marginTop: 4,
  marginRight: 2,
  marginBottom: 4,
  marginLeft: 2,
};

export interface ClearDataOptions {
  sales?: boolean;
  customers?: boolean;
  products?: boolean;
  categories?: boolean;
  ingredients?: boolean;
  recipes?: boolean;
  taxGroups?: boolean;
  riders?: boolean;
  tables?: boolean;
  zReports?: boolean;
  heldOrders?: boolean;
  expenses?: boolean;
  suppliers?: boolean;
  purchases?: boolean;
  stockMovements?: boolean;
  resetInvoiceCounter?: boolean;
}

export interface BackupData {
  app: "al-salik-pos";
  version: number;
  exportedAt: number;
  tables: Record<string, unknown[]>;
  meta?: Record<string, unknown>;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  paperWidth: "80mm",
  autoPrintReceipt: false,
  autoPrintKOT: false,
  printMethod: "system",
  printerIp: "",
  printers: [],
  defaultReceiptPrinterId: "",
  defaultKOTPrinterId: "",
  rawTextMode: false,
  autoCutPaper: true,
  rawCodepage: "cp1252",
};

export const DEFAULT_KOT_SETTINGS: KOTSettings = {
  enabled: false,
  showPrice: false,
  showNotes: true,
  fontSize: "medium",
  categoryRouting: {},
  categoryPrinters: {},
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
  keyboardMode: "off",
  vatEnabled: true,
  allowNegativeStock: true,
  registerOpen: false,
  openingFloat: 0,
  lastClosingCash: 0,
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

/**
 * Default permissions for the "driver" role (laundry pickup / delivery staff).
 * Drivers use cashier permissions by default. The key difference from a cashier
 * is the role label — managers can grant additional permissions via the
 * Permissions screen just like any cashier.
 */
export const DRIVER_PERMISSIONS: StaffPermissions = {
  ...DEFAULT_CASHIER_PERMISSIONS,
  boCustomers: true,
};

/**
 * Permissions for the "manager" role.
 * Full back-office read/write access — except:
 *   - Cannot access Business Settings (boBusiness: false)
 *   - Cannot delete any data (all delete* = false)
 *   - Cannot access the Permissions screen (that section is adminOnly)
 *   - Cannot create or promote staff to admin role (enforced in handleSaveStaff)
 */
export const MANAGER_PERMISSIONS: StaffPermissions = {
  canAccessBackOffice: true,
  boProducts: true, boCustomers: true, boReports: true, boCategories: true,
  boRiders: true, boIngredients: true, boRecipes: true, boReceipt: true,
  boPrinter: true, boKOT: true, boDisplay: true, boStaff: true,
  boTax: true, boBusiness: false,
  deleteProducts: false, deleteCustomers: false, deleteCategories: false,
  deleteRiders: false, deleteIngredients: false, deleteStaff: false,
  deleteTax: false, deleteTables: false,
  canRefund: true, canApplyDiscount: true, canManageTables: true,
};
