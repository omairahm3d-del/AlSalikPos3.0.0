import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback } from "react";
import type {
  BackupData, BusinessSettings, CartItem, Category, ClearDataOptions, CreditPayment, Customer,
  HeldOrder, HeldOrderItem, Ingredient, PosTable, Product,
  RecipeIngredient, Rider, Sale, SaleItem, SplitPaymentEntry,
  Staff, TaxGroup,
} from "@/types";
import { DEFAULT_BUSINESS_SETTINGS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_STAFF, SEED_TABLES, SEED_TAX_GROUPS, SEED_CUSTOMERS, VAT_RATE } from "@/types";
import { generateId, generateInvoiceNumber } from "@/lib/database";
import { clearOwningCompanyId } from "@/lib/saasStorage";
import { DatabaseContext, type SaleOptions, type SyncEntityType, type SyncQueueItem, type SyncResultUpdate } from "./DatabaseCore";

const K = {
  products: "@pos_products", sales: "@pos_sales", saleItems: "@pos_sale_items",
  settings: "@pos_settings", counter: "@pos_invoice_counter",
  customers: "@pos_customers", creditPayments: "@pos_credit_payments",
  staff: "@pos_staff", tables: "@pos_tables", taxGroups: "@pos_tax_groups",
  splitPayments: "@pos_split_payments", zReports: "@pos_z_reports",
  categories: "@pos_categories", riders: "@pos_riders",
  heldOrders: "@pos_held_orders", ingredients: "@pos_ingredients",
  recipeIngredients: "@pos_recipe_ingredients",
  syncQueue: "@pos_sync_queue",
};

interface WebSyncQueueRow {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  enqueuedAt: number;
  attemptCount: number;
  lastAttemptAt: number | null;
  lastError: string | null;
  status: "pending";
}

async function enqueueSyncWeb(entityType: SyncEntityType, entityId: string): Promise<void> {
  const queue = await getJson<WebSyncQueueRow[]>(K.syncQueue, []);
  if (queue.some((q) => q.entityType === entityType && q.entityId === entityId)) return;
  queue.push({
    id: generateId(),
    entityType,
    entityId,
    enqueuedAt: Date.now(),
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    status: "pending",
  });
  await setJson(K.syncQueue, queue);
}

async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) as T : fallback;
}
async function setJson(key: string, data: any): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(data));
}

async function getProducts(): Promise<Product[]> {
  const raw = await AsyncStorage.getItem(K.products);
  if (!raw) { await setJson(K.products, SEED_PRODUCTS); return SEED_PRODUCTS; }
  return JSON.parse(raw) as Product[];
}

async function getCategories(): Promise<Category[]> {
  const raw = await AsyncStorage.getItem(K.categories);
  if (!raw) { await setJson(K.categories, SEED_CATEGORIES); return SEED_CATEGORIES; }
  return JSON.parse(raw) as Category[];
}

export function WebDatabaseProvider({ children }: { children: React.ReactNode }) {

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const p = await getProducts();
    return [...p].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, []);

  const createProduct = useCallback(async (product: Omit<Product, "id">): Promise<Product> => {
    const products = await getProducts();
    const np: Product = { ...product, id: generateId() };
    await setJson(K.products, [...products, np]);
    return np;
  }, []);

  const updateProduct = useCallback(async (product: Product): Promise<void> => {
    const products = await getProducts();
    await setJson(K.products, products.map((p) => p.id === product.id ? product : p));
  }, []);

  const deleteProduct = useCallback(async (id: string): Promise<void> => {
    const products = await getProducts();
    await setJson(K.products, products.filter((p) => p.id !== id));
  }, []);

  const updateStock = useCallback(async (productId: string, delta: number): Promise<void> => {
    const products = await getProducts();
    await setJson(K.products, products.map((p) =>
      p.id === productId ? { ...p, stockQuantity: Math.max(0, (p.stockQuantity ?? 999) + delta) } : p
    ));
  }, []);

  const saveSale = useCallback(async (items: CartItem[], options: SaleOptions): Promise<Sale> => {
    const { paymentMethod, orderType, customerId, customerName, staffId, staffName, tableId, tableName, riderId, riderName, discountType, discountValue, discountAmount: orderDiscount, loyaltyPointsRedeemed, splitPayments } = options;
    if (paymentMethod === "Credit" && !customerId) throw new Error("Credit sales require a customer");

    let subtotal = 0;
    for (const item of items) {
      subtotal += item.product.price * item.quantity - (item.discountAmount ?? 0);
    }
    subtotal -= (orderDiscount ?? 0);
    if (subtotal < 0) subtotal = 0;
    let vatAmount = 0;
    const rawSubtotal = items.reduce((s, i) => s + i.product.price * i.quantity - (i.discountAmount ?? 0), 0);
    const discountRatio = rawSubtotal > 0 ? subtotal / rawSubtotal : 0;
    for (const item of items) {
      const lineAfterDisc = item.product.price * item.quantity - (item.discountAmount ?? 0);
      const rate = item.taxRate ?? VAT_RATE;
      vatAmount += Math.max(0, lineAfterDisc) * rate * discountRatio;
    }
    const total = subtotal + vatAmount;
    const saleId = generateId();
    const createdAt = Date.now();
    const pointsEarned = customerId ? Math.floor(total) : 0;

    const existing = await getJson<Sale[]>(K.sales, []);
    const raw = await AsyncStorage.getItem(K.counter);
    const seq = raw ? parseInt(raw, 10) : existing.length + 1;
    const invoiceNumber = generateInvoiceNumber(seq - 1);
    await AsyncStorage.setItem(K.counter, String(seq + 1));

    const effectiveVatRate = subtotal > 0 ? vatAmount / subtotal : VAT_RATE;
    const sale: Sale = {
      id: saleId, invoiceNumber, createdAt, subtotal, vatRate: effectiveVatRate, vatAmount, total, paymentMethod,
      orderType, customerId, customerName, staffId, staffName, tableId, tableName, riderId, riderName,
      discountType, discountValue, discountAmount: orderDiscount ?? 0,
      loyaltyPointsEarned: pointsEarned, loyaltyPointsRedeemed: loyaltyPointsRedeemed ?? 0,
      splitPayments,
    };

    const saleItems: SaleItem[] = items.map((item) => ({
      id: generateId(), saleId, productId: item.product.id,
      productName: item.product.name, productPrice: item.product.price,
      quantity: item.quantity,
      lineTotal: item.product.price * item.quantity - (item.discountAmount ?? 0),
      discountAmount: item.discountAmount ?? 0,
    }));

    await setJson(K.sales, [sale, ...existing]);
    const existingItems = await getJson<SaleItem[]>(K.saleItems, []);
    await setJson(K.saleItems, [...saleItems, ...existingItems]);
    await enqueueSyncWeb("sale", saleId);

    if (splitPayments && splitPayments.length > 0) {
      const existSP = await getJson<any[]>(K.splitPayments, []);
      const newSP = splitPayments.map((sp) => ({ id: generateId(), saleId, ...sp }));
      await setJson(K.splitPayments, [...newSP, ...existSP]);
    }

    const products = await getProducts();
    await setJson(K.products, products.map((p) => {
      const cartItem = items.find((i) => i.product.id === p.id);
      if (cartItem) return { ...p, stockQuantity: Math.max(0, (p.stockQuantity ?? 999) - cartItem.quantity) };
      return p;
    }));

    if (paymentMethod === "Credit" && customerId) {
      const customers = await getJson<Customer[]>(K.customers, []);
      if (!customers.find((c) => c.id === customerId)) throw new Error("Customer not found");
      await setJson(K.customers, customers.map((c) =>
        c.id === customerId ? { ...c, creditBalance: c.creditBalance + total } : c
      ));
    }

    if (customerId) {
      const customers = await getJson<Customer[]>(K.customers, []);
      await setJson(K.customers, customers.map((c) => {
        if (c.id !== customerId) return c;
        let pts = c.loyaltyPoints ?? 0;
        if (pointsEarned > 0) pts += pointsEarned;
        if ((loyaltyPointsRedeemed ?? 0) > 0) pts -= (loyaltyPointsRedeemed ?? 0);
        return { ...c, loyaltyPoints: Math.max(0, pts) };
      }));
    }

    if (tableId) {
      const tables = await getJson<PosTable[]>(K.tables, []);
      await setJson(K.tables, tables.map((t) =>
        t.id === tableId ? { ...t, status: "available" as const, currentOrderId: undefined } : t
      ));
      const heldOrders = await getJson<HeldOrder[]>(K.heldOrders, []);
      await setJson(K.heldOrders, heldOrders.filter((h) => h.tableId !== tableId));
    }

    const allRecipes = await getJson<RecipeIngredient[]>(K.recipeIngredients, []);
    if (allRecipes.length > 0) {
      const ingredients = await getJson<Ingredient[]>(K.ingredients, []);
      const updated = [...ingredients];
      for (const item of items) {
        const itemRecipes = allRecipes.filter((r) => r.productId === item.product.id);
        for (const ri of itemRecipes) {
          const idx = updated.findIndex((ing) => ing.id === ri.ingredientId);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], stockQuantity: Math.max(0, updated[idx].stockQuantity - ri.quantity * item.quantity) };
          }
        }
      }
      await setJson(K.ingredients, updated);
    }

    return sale;
  }, []);

  const loadSales = useCallback(async (): Promise<Sale[]> => getJson<Sale[]>(K.sales, []), []);

  const loadSaleWithItems = useCallback(async (saleId: string): Promise<Sale | null> => {
    const sales = await getJson<Sale[]>(K.sales, []);
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return null;
    const allItems = await getJson<SaleItem[]>(K.saleItems, []);
    return { ...sale, items: allItems.filter((i) => i.saleId === saleId) };
  }, []);

  const loadSaleByInvoiceNumber = useCallback(async (invoiceNumber: string): Promise<Sale | null> => {
    const sales = await getJson<Sale[]>(K.sales, []);
    const sale = sales.find((s) => s.invoiceNumber === invoiceNumber);
    if (!sale) return null;
    const allItems = await getJson<SaleItem[]>(K.saleItems, []);
    return { ...sale, items: allItems.filter((i) => i.saleId === sale.id) };
  }, []);

  const loadSalesWithItemsByDateRange = useCallback(async (startMs: number, endMs: number): Promise<{ sales: Sale[]; items: SaleItem[] }> => {
    const allSales = await getJson<Sale[]>(K.sales, []);
    const sales = allSales.filter((s) => s.createdAt >= startMs && s.createdAt < endMs);
    if (sales.length === 0) return { sales, items: [] };
    const ids = new Set(sales.map((s) => s.id));
    const allItems = await getJson<SaleItem[]>(K.saleItems, []);
    return { sales, items: allItems.filter((i) => ids.has(i.saleId)) };
  }, []);

  const processRefund = useCallback(async (originalSaleId: string, staffId?: string, staffName?: string): Promise<Sale> => {
    const sales = await getJson<Sale[]>(K.sales, []);
    const orig = sales.find((s) => s.id === originalSaleId);
    if (!orig) throw new Error("Sale not found");
    if (orig.isRefund) throw new Error("Cannot refund a refund");
    if (sales.some((s) => s.originalSaleId === originalSaleId && s.isRefund)) throw new Error("Sale already refunded");

    const refundId = generateId();
    const createdAt = Date.now();
    const raw = await AsyncStorage.getItem(K.counter);
    const seq = raw ? parseInt(raw, 10) : sales.length + 1;
    const invoiceNumber = generateInvoiceNumber(seq - 1);
    await AsyncStorage.setItem(K.counter, String(seq + 1));

    const refund: Sale = {
      id: refundId, invoiceNumber, createdAt, subtotal: -orig.subtotal,
      vatRate: orig.vatRate, vatAmount: -orig.vatAmount, total: -orig.total,
      paymentMethod: orig.paymentMethod, isRefund: true, originalSaleId,
      staffId: staffId ?? orig.staffId, staffName: staffName ?? orig.staffName,
      customerId: orig.customerId, customerName: orig.customerName,
      discountAmount: -(orig.discountAmount ?? 0),
    };

    await setJson(K.sales, [refund, ...sales]);

    const allItems = await getJson<SaleItem[]>(K.saleItems, []);
    const origItems = allItems.filter((i) => i.saleId === originalSaleId);
    const refundItems: SaleItem[] = origItems.map((i) => ({
      ...i, id: generateId(), saleId: refundId, quantity: -i.quantity,
      lineTotal: -i.lineTotal, discountAmount: -(i.discountAmount ?? 0),
    }));
    await setJson(K.saleItems, [...refundItems, ...allItems]);

    const products = await getProducts();
    await setJson(K.products, products.map((p) => {
      const item = origItems.find((i) => i.productId === p.id);
      if (item) return { ...p, stockQuantity: (p.stockQuantity ?? 0) + item.quantity };
      return p;
    }));

    if (orig.paymentMethod === "Credit" && orig.customerId) {
      const customers = await getJson<Customer[]>(K.customers, []);
      await setJson(K.customers, customers.map((c) =>
        c.id === orig.customerId ? { ...c, creditBalance: c.creditBalance - orig.total } : c
      ));
    }

    if (orig.customerId && (orig.loyaltyPointsEarned ?? 0) > 0) {
      const customers = await getJson<Customer[]>(K.customers, []);
      await setJson(K.customers, customers.map((c) =>
        c.id === orig.customerId ? { ...c, loyaltyPoints: Math.max(0, (c.loyaltyPoints ?? 0) - (orig.loyaltyPointsEarned ?? 0)) } : c
      ));
    }

    await enqueueSyncWeb("sale", refundId);
    return refund;
  }, []);

  const loadBusinessSettings = useCallback(async (): Promise<BusinessSettings> => {
    const raw = await AsyncStorage.getItem(K.settings);
    if (!raw) return { ...DEFAULT_BUSINESS_SETTINGS };
    return { ...DEFAULT_BUSINESS_SETTINGS, ...JSON.parse(raw) } as BusinessSettings;
  }, []);

  const saveBusinessSettings = useCallback(async (settings: BusinessSettings): Promise<void> => {
    await setJson(K.settings, settings);
  }, []);

  const loadCustomers = useCallback(async (): Promise<Customer[]> => {
    const raw = await AsyncStorage.getItem(K.customers);
    let c: Customer[];
    if (!raw) {
      c = SEED_CUSTOMERS.map((x) => ({ ...x, createdAt: Date.now() }));
      await setJson(K.customers, c);
    } else {
      c = JSON.parse(raw) as Customer[];
    }
    return [...c].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const createCustomer = useCallback(async (customer: Omit<Customer, "id" | "creditBalance" | "loyaltyPoints" | "createdAt">): Promise<Customer> => {
    const customers = await getJson<Customer[]>(K.customers, []);
    const nc: Customer = { ...customer, id: generateId(), creditBalance: 0, loyaltyPoints: 0, createdAt: Date.now() };
    await setJson(K.customers, [...customers, nc]);
    return nc;
  }, []);

  const updateCustomer = useCallback(async (customer: Customer): Promise<void> => {
    const customers = await getJson<Customer[]>(K.customers, []);
    await setJson(K.customers, customers.map((c) => c.id === customer.id ? customer : c));
  }, []);

  const deleteCustomer = useCallback(async (id: string): Promise<void> => {
    const customers = await getJson<Customer[]>(K.customers, []);
    const t = customers.find((c) => c.id === id);
    if (t && t.creditBalance > 0) throw new Error("Cannot delete customer with outstanding balance");
    await setJson(K.customers, customers.filter((c) => c.id !== id));
  }, []);

  const recordCreditPayment = useCallback(async (customerId: string, amount: number, note: string): Promise<CreditPayment> => {
    if (amount <= 0) throw new Error("Payment amount must be positive");
    const customers = await getJson<Customer[]>(K.customers, []);
    const t = customers.find((c) => c.id === customerId);
    if (!t) throw new Error("Customer not found");
    const roundedAmount = Math.round(amount * 100) / 100;
    const roundedBalance = Math.round(t.creditBalance * 100) / 100;
    if (roundedAmount > roundedBalance) throw new Error("Payment exceeds outstanding balance");
    const newBalance = Math.round((roundedBalance - roundedAmount) * 100) / 100;
    const payment: CreditPayment = { id: generateId(), customerId, amount: roundedAmount, note, createdAt: Date.now() };
    const existing = await getJson<CreditPayment[]>(K.creditPayments, []);
    await setJson(K.creditPayments, [payment, ...existing]);
    await setJson(K.customers, customers.map((c) =>
      c.id === customerId ? { ...c, creditBalance: newBalance } : c
    ));
    return payment;
  }, []);

  const loadCreditPayments = useCallback(async (customerId: string): Promise<CreditPayment[]> => {
    const all = await getJson<CreditPayment[]>(K.creditPayments, []);
    return all.filter((p) => p.customerId === customerId);
  }, []);

  const updateLoyaltyPoints = useCallback(async (customerId: string, delta: number): Promise<void> => {
    const customers = await getJson<Customer[]>(K.customers, []);
    await setJson(K.customers, customers.map((c) =>
      c.id === customerId ? { ...c, loyaltyPoints: Math.max(0, (c.loyaltyPoints ?? 0) + delta) } : c
    ));
  }, []);

  const loadStaff = useCallback(async (): Promise<Staff[]> => {
    const raw = await AsyncStorage.getItem(K.staff);
    let s: Staff[];
    if (!raw) {
      // Seed default admin (name "Admin", PIN "1234") on first run.
      s = SEED_STAFF.map((x) => ({ ...x, createdAt: Date.now() }));
      await setJson(K.staff, s);
    } else {
      s = JSON.parse(raw) as Staff[];
    }
    return [...s].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const createStaff = useCallback(async (staff: Omit<Staff, "id" | "active" | "createdAt">): Promise<Staff> => {
    const existing = await getJson<Staff[]>(K.staff, []);
    const ns: Staff = { ...staff, id: generateId(), active: true, createdAt: Date.now() };
    await setJson(K.staff, [...existing, ns]);
    return ns;
  }, []);

  const updateStaff = useCallback(async (staff: Staff): Promise<void> => {
    const existing = await getJson<Staff[]>(K.staff, []);
    await setJson(K.staff, existing.map((s) => s.id === staff.id ? staff : s));
  }, []);

  const deleteStaff = useCallback(async (id: string): Promise<void> => {
    const existing = await getJson<Staff[]>(K.staff, []);
    await setJson(K.staff, existing.filter((s) => s.id !== id));
  }, []);

  const authenticateStaff = useCallback(async (pin: string): Promise<Staff | null> => {
    let all = await getJson<Staff[]>(K.staff, []);
    if (all.length === 0) {
      all = SEED_STAFF.map((x) => ({ ...x, createdAt: Date.now() }));
      await setJson(K.staff, all);
    }
    return all.find((s) => s.pin === pin && s.active) ?? null;
  }, []);

  const loadTables = useCallback(async (): Promise<PosTable[]> => {
    const raw = await AsyncStorage.getItem(K.tables);
    let t: PosTable[];
    if (!raw) {
      t = SEED_TABLES.map((x) => ({ ...x, createdAt: Date.now() }));
      await setJson(K.tables, t);
    } else {
      t = JSON.parse(raw) as PosTable[];
    }
    return [...t].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const createTable = useCallback(async (table: Omit<PosTable, "id" | "status" | "createdAt">): Promise<PosTable> => {
    const existing = await getJson<PosTable[]>(K.tables, []);
    const nt: PosTable = { ...table, id: generateId(), status: "available", createdAt: Date.now() };
    await setJson(K.tables, [...existing, nt]);
    return nt;
  }, []);

  const updateTable = useCallback(async (table: PosTable): Promise<void> => {
    const existing = await getJson<PosTable[]>(K.tables, []);
    await setJson(K.tables, existing.map((t) => t.id === table.id ? table : t));
  }, []);

  const deleteTable = useCallback(async (id: string): Promise<void> => {
    const existing = await getJson<PosTable[]>(K.tables, []);
    await setJson(K.tables, existing.filter((t) => t.id !== id));
  }, []);

  const setTableStatus = useCallback(async (id: string, status: PosTable["status"], orderId?: string): Promise<void> => {
    const existing = await getJson<PosTable[]>(K.tables, []);
    await setJson(K.tables, existing.map((t) =>
      t.id === id ? { ...t, status, currentOrderId: orderId } : t
    ));
  }, []);

  const loadTaxGroups = useCallback(async (): Promise<TaxGroup[]> => {
    const raw = await AsyncStorage.getItem(K.taxGroups);
    if (!raw) {
      await setJson(K.taxGroups, SEED_TAX_GROUPS);
      return SEED_TAX_GROUPS;
    }
    return JSON.parse(raw) as TaxGroup[];
  }, []);

  const createTaxGroup = useCallback(async (group: Omit<TaxGroup, "id">): Promise<TaxGroup> => {
    const existing = await getJson<TaxGroup[]>(K.taxGroups, []);
    const ng: TaxGroup = { ...group, id: generateId() };
    await setJson(K.taxGroups, [...existing, ng]);
    return ng;
  }, []);

  const updateTaxGroup = useCallback(async (group: TaxGroup): Promise<void> => {
    const existing = await getJson<TaxGroup[]>(K.taxGroups, []);
    await setJson(K.taxGroups, existing.map((g) => g.id === group.id ? group : g));
  }, []);

  const deleteTaxGroup = useCallback(async (id: string): Promise<void> => {
    const existing = await getJson<TaxGroup[]>(K.taxGroups, []);
    await setJson(K.taxGroups, existing.filter((g) => g.id !== id));
  }, []);

  const loadCategories = useCallback(async (): Promise<Category[]> => {
    const cats = await getCategories();
    return [...cats].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  }, []);

  const createCategory = useCallback(async (category: Omit<Category, "id">): Promise<Category> => {
    const existing = await getCategories();
    const nc: Category = { ...category, id: generateId() };
    await setJson(K.categories, [...existing, nc]);
    return nc;
  }, []);

  const updateCategory = useCallback(async (category: Category): Promise<void> => {
    const existing = await getCategories();
    await setJson(K.categories, existing.map((c) => c.id === category.id ? category : c));
  }, []);

  const deleteCategory = useCallback(async (id: string): Promise<void> => {
    const existing = await getCategories();
    await setJson(K.categories, existing.filter((c) => c.id !== id));
  }, []);

  const loadSplitPayments = useCallback(async (saleId: string): Promise<SplitPaymentEntry[]> => {
    const all = await getJson<any[]>(K.splitPayments, []);
    return all.filter((sp) => sp.saleId === saleId).map((sp) => ({ method: sp.method, amount: sp.amount }));
  }, []);

  const saveZReport = useCallback(async (report: any): Promise<void> => {
    const existing = await getJson<any[]>(K.zReports, []);
    await setJson(K.zReports, [{ ...report, id: generateId() }, ...existing]);
  }, []);

  const loadZReports = useCallback(async (): Promise<any[]> => {
    return getJson<any[]>(K.zReports, []);
  }, []);

  const loadRiders = useCallback(async (): Promise<Rider[]> => {
    const r = await getJson<Rider[]>(K.riders, []);
    return [...r].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const createRider = useCallback(async (rider: Omit<Rider, "id" | "active" | "createdAt">): Promise<Rider> => {
    const existing = await getJson<Rider[]>(K.riders, []);
    const nr: Rider = { ...rider, id: generateId(), active: true, createdAt: Date.now() };
    await setJson(K.riders, [...existing, nr]);
    return nr;
  }, []);

  const updateRider = useCallback(async (rider: Rider): Promise<void> => {
    const existing = await getJson<Rider[]>(K.riders, []);
    await setJson(K.riders, existing.map((r) => r.id === rider.id ? rider : r));
  }, []);

  const deleteRider = useCallback(async (id: string): Promise<void> => {
    const existing = await getJson<Rider[]>(K.riders, []);
    await setJson(K.riders, existing.filter((r) => r.id !== id));
  }, []);

  const saveHeldOrder = useCallback(async (order: Omit<HeldOrder, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<HeldOrder> => {
    const now = Date.now();
    const existing = await getJson<HeldOrder[]>(K.heldOrders, []);
    const id = order.id || generateId();
    const isUpdate = existing.some((h) => h.id === id);

    const heldOrder: HeldOrder = {
      ...order, id,
      createdAt: isUpdate ? (existing.find((h) => h.id === id)?.createdAt ?? now) : now,
      updatedAt: now,
    };

    if (isUpdate) {
      await setJson(K.heldOrders, existing.map((h) => h.id === id ? heldOrder : h));
    } else {
      await setJson(K.heldOrders, [...existing, heldOrder]);
    }

    const tables = await getJson<PosTable[]>(K.tables, []);
    await setJson(K.tables, tables.map((t) =>
      t.id === order.tableId ? { ...t, status: "occupied" as const, currentOrderId: id } : t
    ));

    return heldOrder;
  }, []);

  const loadHeldOrders = useCallback(async (): Promise<HeldOrder[]> => {
    return getJson<HeldOrder[]>(K.heldOrders, []);
  }, []);

  const loadHeldOrderByTable = useCallback(async (tableId: string): Promise<HeldOrder | null> => {
    const orders = await getJson<HeldOrder[]>(K.heldOrders, []);
    return orders.find((h) => h.tableId === tableId) ?? null;
  }, []);

  const deleteHeldOrder = useCallback(async (id: string): Promise<void> => {
    const existing = await getJson<HeldOrder[]>(K.heldOrders, []);
    const order = existing.find((h) => h.id === id);
    await setJson(K.heldOrders, existing.filter((h) => h.id !== id));
    if (order) {
      const tables = await getJson<PosTable[]>(K.tables, []);
      await setJson(K.tables, tables.map((t) =>
        t.id === order.tableId ? { ...t, status: "available" as const, currentOrderId: undefined } : t
      ));
    }
  }, []);

  const loadIngredients = useCallback(async (): Promise<Ingredient[]> => {
    const items = await getJson<Ingredient[]>(K.ingredients, []);
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const createIngredient = useCallback(async (ingredient: Omit<Ingredient, "id" | "createdAt">): Promise<Ingredient> => {
    const existing = await getJson<Ingredient[]>(K.ingredients, []);
    const ni: Ingredient = { ...ingredient, id: generateId(), createdAt: Date.now() };
    await setJson(K.ingredients, [...existing, ni]);
    return ni;
  }, []);

  const updateIngredient = useCallback(async (ingredient: Ingredient): Promise<void> => {
    const existing = await getJson<Ingredient[]>(K.ingredients, []);
    await setJson(K.ingredients, existing.map((i) => i.id === ingredient.id ? ingredient : i));
  }, []);

  const deleteIngredient = useCallback(async (id: string): Promise<void> => {
    const existing = await getJson<Ingredient[]>(K.ingredients, []);
    await setJson(K.ingredients, existing.filter((i) => i.id !== id));
    const recipes = await getJson<RecipeIngredient[]>(K.recipeIngredients, []);
    await setJson(K.recipeIngredients, recipes.filter((r) => r.ingredientId !== id));
  }, []);

  const updateIngredientStock = useCallback(async (ingredientId: string, delta: number): Promise<void> => {
    const existing = await getJson<Ingredient[]>(K.ingredients, []);
    await setJson(K.ingredients, existing.map((i) =>
      i.id === ingredientId ? { ...i, stockQuantity: Math.max(0, i.stockQuantity + delta) } : i
    ));
  }, []);

  const loadRecipeIngredients = useCallback(async (productId: string): Promise<RecipeIngredient[]> => {
    const all = await getJson<RecipeIngredient[]>(K.recipeIngredients, []);
    const ingredients = await getJson<Ingredient[]>(K.ingredients, []);
    return all.filter((r) => r.productId === productId).map((r) => ({
      ...r, ingredientName: ingredients.find((i) => i.id === r.ingredientId)?.name,
    }));
  }, []);

  const saveRecipeIngredients = useCallback(async (productId: string, items: Omit<RecipeIngredient, "id">[]): Promise<void> => {
    const all = await getJson<RecipeIngredient[]>(K.recipeIngredients, []);
    const filtered = all.filter((r) => r.productId !== productId);
    const newItems = items.map((item) => ({ ...item, id: generateId() }));
    await setJson(K.recipeIngredients, [...filtered, ...newItems]);
  }, []);

  const deleteRecipeIngredients = useCallback(async (productId: string): Promise<void> => {
    const all = await getJson<RecipeIngredient[]>(K.recipeIngredients, []);
    await setJson(K.recipeIngredients, all.filter((r) => r.productId !== productId));
  }, []);

  const exportData = useCallback(async (): Promise<BackupData> => {
    const tables: Record<string, unknown[]> = {};
    const meta: Record<string, unknown> = {};
    for (const [name, key] of Object.entries(K)) {
      const raw = await AsyncStorage.getItem(key);
      if (raw == null) { tables[name] = []; continue; }
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) tables[name] = parsed;
        else { meta[name] = parsed; tables[name] = []; }
      } catch {
        meta[name] = raw;
        tables[name] = [];
      }
    }
    return { app: "al-salik-pos", version: 1, exportedAt: Date.now(), tables, meta };
  }, []);

  const importData = useCallback(async (data: BackupData): Promise<void> => {
    if (data.app !== "al-salik-pos") throw new Error("Invalid backup");
    for (const [name, key] of Object.entries(K)) {
      const arr = data.tables?.[name];
      if (Array.isArray(arr)) {
        await AsyncStorage.setItem(key, JSON.stringify(arr));
      }
    }
    if (data.meta) {
      for (const [name, val] of Object.entries(data.meta)) {
        const key = (K as any)[name];
        if (key) await AsyncStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
      }
    }
    // Drop the queue and the tenant-ownership stamp — see DatabaseContext.tsx
    // importData for the rationale. Restored backups are foreign data until
    // the operator explicitly wipes and re-activates.
    await AsyncStorage.setItem(K.syncQueue, JSON.stringify([]));
    try { await clearOwningCompanyId(); } catch {}
  }, []);

  const clearData = useCallback(async (opts: ClearDataOptions): Promise<void> => {
    const wipe = async (k: string) => { await AsyncStorage.setItem(k, JSON.stringify([])); };
    if (opts.sales) {
      await wipe(K.sales);
      await wipe(K.saleItems);
      await wipe(K.splitPayments);
    }
    if (opts.zReports) await wipe(K.zReports);
    if (opts.heldOrders) await wipe(K.heldOrders);
    if (opts.customers) {
      await wipe(K.customers);
      await wipe(K.creditPayments);
    }
    if (opts.products) {
      await wipe(K.products);
      await wipe(K.recipeIngredients);
    }
    if (opts.categories) await wipe(K.categories);
    if (opts.ingredients) {
      await wipe(K.ingredients);
      await wipe(K.recipeIngredients);
    }
    if (opts.taxGroups) await wipe(K.taxGroups);
    if (opts.riders) await wipe(K.riders);
    if (opts.tables) {
      await wipe(K.tables);
      await wipe(K.heldOrders);
    }
    if (opts.sales) {
      // Sales were wiped — drop sale entries from the queue too.
      const queue = await getJson<WebSyncQueueRow[]>(K.syncQueue, []);
      await setJson(K.syncQueue, queue.filter((q) => q.entityType !== "sale"));
    }
    if (opts.resetInvoiceCounter || opts.sales) {
      await AsyncStorage.setItem(K.counter, "1");
    }
  }, []);

  // ---- Phase 3b: outbound sync queue ----

  const enqueueSync = useCallback(async (entityType: SyncEntityType, entityId: string): Promise<void> => {
    await enqueueSyncWeb(entityType, entityId);
  }, []);

  const reconcilePendingSync = useCallback(async (): Promise<number> => {
    const queue = await getJson<WebSyncQueueRow[]>(K.syncQueue, []);
    const tracked = new Set(
      queue.filter((q) => q.entityType === "sale").map((q) => q.entityId)
    );
    const sales = await getJson<Sale[]>(K.sales, []);
    const additions: WebSyncQueueRow[] = [];
    const now = Date.now();
    for (const s of sales) {
      if (!tracked.has(s.id)) {
        additions.push({
          id: generateId(),
          entityType: "sale",
          entityId: s.id,
          enqueuedAt: now,
          attemptCount: 0,
          lastAttemptAt: null,
          lastError: null,
          status: "pending",
        });
      }
    }
    if (additions.length > 0) {
      await setJson(K.syncQueue, [...queue, ...additions]);
    }
    return additions.length;
  }, []);

  const loadSyncBatch = useCallback(async (entityType: SyncEntityType, limit: number): Promise<SyncQueueItem[]> => {
    const queue = await getJson<WebSyncQueueRow[]>(K.syncQueue, []);
    return queue
      .filter((q) => q.entityType === entityType && q.status === "pending")
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      .slice(0, limit)
      .map((q) => ({
        queueId: q.id,
        entityType: q.entityType,
        entityId: q.entityId,
        attemptCount: q.attemptCount,
        lastAttemptAt: q.lastAttemptAt,
      }));
  }, []);

  const markSyncResults = useCallback(async (results: SyncResultUpdate[]): Promise<void> => {
    if (results.length === 0) return;
    const queue = await getJson<WebSyncQueueRow[]>(K.syncQueue, []);
    const now = Date.now();
    const okIds = new Set(results.filter((r) => r.ok).map((r) => r.queueId));
    const failedById = new Map(results.filter((r) => !r.ok).map((r) => [r.queueId, r] as const));
    const next = queue
      .filter((q) => !okIds.has(q.id))
      .map((q) => {
        const fail = failedById.get(q.id);
        if (!fail) return q;
        return {
          ...q,
          attemptCount: q.attemptCount + 1,
          lastAttemptAt: now,
          lastError: fail.error ?? null,
        };
      });
    await setJson(K.syncQueue, next);
  }, []);

  const countPendingSync = useCallback(async (entityType: SyncEntityType): Promise<number> => {
    const queue = await getJson<WebSyncQueueRow[]>(K.syncQueue, []);
    return queue.filter((q) => q.entityType === entityType && q.status === "pending").length;
  }, []);

  return (
    <DatabaseContext.Provider value={{
      loadProducts, createProduct, updateProduct, deleteProduct, updateStock,
      saveSale, loadSales, loadSaleWithItems, loadSaleByInvoiceNumber, loadSalesWithItemsByDateRange, processRefund,
      loadBusinessSettings, saveBusinessSettings,
      loadCustomers, createCustomer, updateCustomer, deleteCustomer,
      recordCreditPayment, loadCreditPayments, updateLoyaltyPoints,
      loadStaff, createStaff, updateStaff, deleteStaff, authenticateStaff,
      loadTables, createTable, updateTable, deleteTable, setTableStatus,
      loadTaxGroups, createTaxGroup, updateTaxGroup, deleteTaxGroup,
      loadCategories, createCategory, updateCategory, deleteCategory,
      loadSplitPayments, saveZReport, loadZReports,
      loadRiders, createRider, updateRider, deleteRider,
      saveHeldOrder, loadHeldOrders, loadHeldOrderByTable, deleteHeldOrder,
      loadIngredients, createIngredient, updateIngredient, deleteIngredient, updateIngredientStock,
      loadRecipeIngredients, saveRecipeIngredients, deleteRecipeIngredients,
      exportData, importData, clearData,
      enqueueSync, reconcilePendingSync, loadSyncBatch, markSyncResults, countPendingSync,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}
