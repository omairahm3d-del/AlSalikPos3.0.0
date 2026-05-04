import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback } from "react";
import type {
  BusinessSettings, CartItem, Category, CreditPayment, Customer,
  PosTable, Product, Sale, SaleItem, SplitPaymentEntry,
  Staff, TaxGroup,
} from "@/types";
import { DEFAULT_BUSINESS_SETTINGS, SEED_CATEGORIES, SEED_PRODUCTS, VAT_RATE } from "@/types";
import { generateId, generateInvoiceNumber } from "@/lib/database";
import { DatabaseContext, type SaleOptions } from "./DatabaseCore";

const K = {
  products: "@pos_products", sales: "@pos_sales", saleItems: "@pos_sale_items",
  settings: "@pos_settings", counter: "@pos_invoice_counter",
  customers: "@pos_customers", creditPayments: "@pos_credit_payments",
  staff: "@pos_staff", tables: "@pos_tables", taxGroups: "@pos_tax_groups",
  splitPayments: "@pos_split_payments", zReports: "@pos_z_reports",
  categories: "@pos_categories",
};

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
    const { paymentMethod, customerId, customerName, staffId, staffName, tableId, tableName, discountType, discountValue, discountAmount: orderDiscount, loyaltyPointsRedeemed, splitPayments } = options;
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
      customerId, customerName, staffId, staffName, tableId, tableName,
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
    const c = await getJson<Customer[]>(K.customers, []);
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
    if (amount > t.creditBalance) throw new Error("Payment exceeds outstanding balance");
    const payment: CreditPayment = { id: generateId(), customerId, amount, note, createdAt: Date.now() };
    const existing = await getJson<CreditPayment[]>(K.creditPayments, []);
    await setJson(K.creditPayments, [payment, ...existing]);
    await setJson(K.customers, customers.map((c) =>
      c.id === customerId ? { ...c, creditBalance: c.creditBalance - amount } : c
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
    const s = await getJson<Staff[]>(K.staff, []);
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
    const all = await getJson<Staff[]>(K.staff, []);
    return all.find((s) => s.pin === pin && s.active) ?? null;
  }, []);

  const loadTables = useCallback(async (): Promise<PosTable[]> => {
    const t = await getJson<PosTable[]>(K.tables, []);
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
    const groups = await getJson<TaxGroup[]>(K.taxGroups, [{ id: "tg_default", name: "Standard VAT (5%)", rate: 0.05 }]);
    return groups;
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

  return (
    <DatabaseContext.Provider value={{
      loadProducts, createProduct, updateProduct, deleteProduct, updateStock,
      saveSale, loadSales, loadSaleWithItems, loadSalesWithItemsByDateRange, processRefund,
      loadBusinessSettings, saveBusinessSettings,
      loadCustomers, createCustomer, updateCustomer, deleteCustomer,
      recordCreditPayment, loadCreditPayments, updateLoyaltyPoints,
      loadStaff, createStaff, updateStaff, deleteStaff, authenticateStaff,
      loadTables, createTable, updateTable, deleteTable, setTableStatus,
      loadTaxGroups, createTaxGroup, updateTaxGroup, deleteTaxGroup,
      loadCategories, createCategory, updateCategory, deleteCategory,
      loadSplitPayments, saveZReport, loadZReports,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}
