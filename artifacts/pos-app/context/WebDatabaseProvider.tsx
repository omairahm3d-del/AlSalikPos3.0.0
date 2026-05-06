import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback } from "react";
import type {
  BackupData, BusinessSettings, CartItem, Category, ClearDataOptions, CreditPayment, Customer,
  Expense, HeldOrder, HeldOrderItem, Ingredient, PosTable, Product,
  RecipeIngredient, Rider, Sale, SaleItem, SplitPaymentEntry,
  Staff, TaxGroup,
} from "@/types";
import { DEFAULT_BUSINESS_SETTINGS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_STAFF, SEED_TABLES, SEED_TAX_GROUPS, SEED_CUSTOMERS, VAT_RATE } from "@/types";
import { computeLineNetVat } from "./CartContext";
import { generateId, generateInvoiceNumber } from "@/lib/database";
import { notifySyncQueueChanged } from "@/lib/syncEvents";
import { clearOwningCompanyId } from "@/lib/saasStorage";
import { DatabaseContext, type CatalogApplyInput, type CatalogEntityType, type CatalogOutboxItem, type CatalogResultUpdate, type SaleOptions, type SyncEntityType, type SyncQueueItem, type SyncResultUpdate } from "./DatabaseCore";

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
  catalogOutbox: "@pos_catalog_outbox",
  expenses: "@pos_expenses",
};

interface WebCatalogOutboxRow {
  id: string;
  entityType: CatalogEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  deleted: boolean;
  /** Wall-clock ms epoch — LWW key sent to server. */
  updatedAt: number;
  enqueuedAt: number;
  attemptCount: number;
  lastAttemptAt: number | null;
  lastError: string | null;
}

/**
 * Build the next catalog outbox state with an UPSERT semantics. Latest
 * snapshot wins per (entity_type, id), matching the native ON CONFLICT DO
 * UPDATE behavior. Rapid edits before a successful push collapse into one
 * pending row instead of piling up.
 *
 * Returns the new outbox array; the caller is responsible for persisting
 * it together with the entity table in a single AsyncStorage.multiSet so
 * the two writes are crash-consistent (a tab-close between them would
 * otherwise leave the entity changed but the outbox unaware, losing the
 * push). Async wrapper because reading the existing queue is async.
 */
async function buildOutboxUpsert(
  entityType: CatalogEntityType,
  entityId: string,
  payload: unknown,
  deleted: boolean,
  updatedAt: number,
): Promise<WebCatalogOutboxRow[]> {
  const queue = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
  const idx = queue.findIndex((q) => q.entityType === entityType && q.entityId === entityId);
  const row: WebCatalogOutboxRow = {
    id: idx >= 0 ? queue[idx].id : generateId(),
    entityType,
    entityId,
    payload: (payload && typeof payload === "object")
      ? payload as Record<string, unknown>
      : { id: entityId },
    deleted,
    updatedAt,
    enqueuedAt: Date.now(),
    // Reset attempts so a fresh edit starts retrying immediately rather than
    // inheriting backoff from a stale push that the user just superseded.
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  const next = queue.slice();
  if (idx >= 0) next[idx] = row; else next.push(row);
  return next;
}

/**
 * Persist an entity table + outbox in one AsyncStorage call. multiSet
 * isn't transactional across keys on every backend, but it batches the
 * writes so the gap between them is dramatically smaller than two awaited
 * setItem calls — close enough to crash-consistent for the JSON web path.
 */
async function writeEntityAndOutbox(
  entityKey: string,
  entityValue: unknown,
  outbox: WebCatalogOutboxRow[],
): Promise<void> {
  await AsyncStorage.multiSet([
    [entityKey, JSON.stringify(entityValue)],
    [K.catalogOutbox, JSON.stringify(outbox)],
  ]);
  // Catalog edit queued — wake the SyncContext loop immediately.
  notifySyncQueueChanged();
}

/**
 * Single-writer async mutex for catalog state. AsyncStorage on web is
 * backed by JSON blobs read-modify-written across multiple keys, so two
 * concurrent operations (e.g. a local edit landing while applyRemoteCatalog
 * is mid-tick) can interleave at every `await` boundary and clobber each
 * other's snapshot. JS is single-threaded but `await` is not — we need an
 * explicit serialization point. Native uses SQLite's withExclusiveTransaction
 * for the same purpose.
 *
 * Wraps every mutation that touches @pos_products / @pos_categories /
 * @pos_catalog_outbox: create/update/delete (per entity), applyRemoteCatalog,
 * and markCatalogResults. Read-only paths (loadProducts, etc.) intentionally
 * stay outside the lock so the UI never blocks waiting on a sync tick.
 */
let catalogMutexTail: Promise<unknown> = Promise.resolve();
function runCatalogExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = catalogMutexTail.then(fn, fn);
  // Swallow rejections on the chain so one failure doesn't poison the lock.
  catalogMutexTail = next.catch(() => undefined);
  return next;
}

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
  if (queue.some((q) => q.entityType === entityType && q.entityId === entityId)) {
    // Already queued — still notify so a stuck scheduler kicks.
    notifySyncQueueChanged();
    return;
  }
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
  notifySyncQueueChanged();
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
    return runCatalogExclusive(async () => {
      const products = await getProducts();
      const updatedAt = Date.now();
      const np: Product = { ...product, id: generateId(), updatedAt };
      const outbox = await buildOutboxUpsert("product", np.id, np, false, updatedAt);
      await writeEntityAndOutbox(K.products, [...products, np], outbox);
      return np;
    });
  }, []);

  const updateProduct = useCallback(async (product: Product): Promise<void> => {
    return runCatalogExclusive(async () => {
      const products = await getProducts();
      const updatedAt = Date.now();
      const next: Product = { ...product, updatedAt };
      const outbox = await buildOutboxUpsert("product", product.id, next, false, updatedAt);
      await writeEntityAndOutbox(K.products, products.map((p) => p.id === product.id ? next : p), outbox);
    });
  }, []);

  const deleteProduct = useCallback(async (id: string): Promise<void> => {
    return runCatalogExclusive(async () => {
      const products = await getProducts();
      const updatedAt = Date.now();
      const outbox = await buildOutboxUpsert("product", id, { id }, true, updatedAt);
      await writeEntityAndOutbox(K.products, products.filter((p) => p.id !== id), outbox);
    });
  }, []);

  const updateStock = useCallback(async (productId: string, delta: number): Promise<void> => {
    // Take the catalog mutex even though stock changes don't enqueue a
    // catalog push themselves — they still rewrite @pos_products and would
    // otherwise race with applyRemoteCatalog/createProduct/etc.
    return runCatalogExclusive(async () => {
      const products = await getProducts();
      await setJson(K.products, products.map((p) => {
        if (p.id !== productId) return p;
        // First receive (stockTracked=false): SET quantity to delta instead of
        // adding to the default 999 fallback. Subsequent receives accumulate.
        const base = p.stockTracked ? (p.stockQuantity ?? 0) : 0;
        return { ...p, stockQuantity: Math.max(0, base + delta), stockTracked: true };
      }));
    });
  }, []);

  const saveSale = useCallback(async (items: CartItem[], options: SaleOptions): Promise<Sale> => {
    const { paymentMethod, orderType, customerId, customerName, staffId, staffName, tableId, tableName, riderId, riderName, discountType, discountValue, discountAmount: orderDiscount, loyaltyPointsRedeemed, splitPayments } = options;
    if (paymentMethod === "Credit" && !customerId) throw new Error("Credit sales require a customer");

    // Per-line totals respect per-product `vatInclusive` and any zero
    // taxRate (e.g. when business `vatEnabled=false`). Order-level
    // discount is applied as a uniform ratio so VAT scales with it.
    const lineCalcs = items.map(computeLineNetVat);
    let netSum = 0;
    let vatSum = 0;
    let grossSum = 0;
    for (const c of lineCalcs) { netSum += c.net; vatSum += c.vat; grossSum += c.gross; }
    const orderDiscAmt = orderDiscount ?? 0;
    const grossAfterOrderDisc = Math.max(0, grossSum - orderDiscAmt);
    const ratio = grossSum > 0 ? grossAfterOrderDisc / grossSum : 0;
    const subtotal = netSum * ratio;
    const vatAmount = vatSum * ratio;
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

    // Stock decrement on sale: only reduce products that already have a
    // tracked (non-null) stockQuantity. Untracked products (null) are left
    // alone — they will start tracking once stock is received via Receive Stock.
    await runCatalogExclusive(async () => {
      const products = await getProducts();
      await setJson(K.products, products.map((p) => {
        const cartItem = items.find((i) => i.product.id === p.id);
        if (cartItem && p.stockTracked) {
          return { ...p, stockQuantity: Math.max(0, (p.stockQuantity ?? 0) - cartItem.quantity) };
        }
        return p;
      }));
    });

    // Phase 3d: any sales-driven customer mutation needs to ride catalog
    // sync. Wrap the whole customer block in `runCatalogExclusive` so the
    // read-modify-write is consistent with applyRemoteCatalog and the
    // outbox snapshot we enqueue, and so credit + loyalty fold into a
    // single write+outbox round-trip per sale.
    const customerTouched =
      !!customerId &&
      (paymentMethod === "Credit" || pointsEarned > 0 || (loyaltyPointsRedeemed ?? 0) > 0);
    if (customerTouched) {
      await runCatalogExclusive(async () => {
        const customers = await getJson<Customer[]>(K.customers, []);
        const target = customers.find((c) => c.id === customerId);
        if (paymentMethod === "Credit" && !target) throw new Error("Customer not found");
        if (!target) return;
        const newCreditBalance =
          paymentMethod === "Credit" ? target.creditBalance + total : target.creditBalance;
        let pts = target.loyaltyPoints ?? 0;
        if (pointsEarned > 0) pts += pointsEarned;
        if ((loyaltyPointsRedeemed ?? 0) > 0) pts -= (loyaltyPointsRedeemed ?? 0);
        const updatedAt = createdAt;
        const updatedCustomer: Customer = {
          ...target,
          creditBalance: newCreditBalance,
          loyaltyPoints: Math.max(0, pts),
          updatedAt,
        };
        const next = customers.map((c) => (c.id === customerId ? updatedCustomer : c));
        const outbox = await buildOutboxUpsert("customer", customerId!, updatedCustomer, false, updatedAt);
        await writeEntityAndOutbox(K.customers, next, outbox);
      });
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

    // Stock restock on refund: serialize with catalog ops to avoid races.
    await runCatalogExclusive(async () => {
      const products = await getProducts();
      await setJson(K.products, products.map((p) => {
        const item = origItems.find((i) => i.productId === p.id);
        if (item) return { ...p, stockQuantity: (p.stockQuantity ?? 0) + item.quantity };
        return p;
      }));
    });

    // Phase 3d: refund-driven customer mutations (credit reversal,
    // loyalty clawback) ride catalog sync via outbox snapshot. Same
    // mutex pattern as saveSale.
    const refundCustomerTouched =
      !!orig.customerId &&
      (orig.paymentMethod === "Credit" || (orig.loyaltyPointsEarned ?? 0) > 0);
    if (refundCustomerTouched) {
      await runCatalogExclusive(async () => {
        const customers = await getJson<Customer[]>(K.customers, []);
        const target = customers.find((c) => c.id === orig.customerId);
        if (!target) return;
        const newCreditBalance =
          orig.paymentMethod === "Credit"
            ? target.creditBalance - orig.total
            : target.creditBalance;
        const newLoyaltyPoints =
          (orig.loyaltyPointsEarned ?? 0) > 0
            ? Math.max(0, (target.loyaltyPoints ?? 0) - (orig.loyaltyPointsEarned ?? 0))
            : (target.loyaltyPoints ?? 0);
        const updatedAt = createdAt;
        const updatedCustomer: Customer = {
          ...target,
          creditBalance: newCreditBalance,
          loyaltyPoints: newLoyaltyPoints,
          updatedAt,
        };
        const next = customers.map((c) => (c.id === orig.customerId ? updatedCustomer : c));
        const outbox = await buildOutboxUpsert("customer", orig.customerId!, updatedCustomer, false, updatedAt);
        await writeEntityAndOutbox(K.customers, next, outbox);
      });
    }

    await enqueueSyncWeb("sale", refundId);
    return refund;
  }, []);

  const loadBusinessSettings = useCallback(async (): Promise<BusinessSettings> => {
    const raw = await AsyncStorage.getItem(K.settings);
    if (!raw) return { ...DEFAULT_BUSINESS_SETTINGS, registerOpen: true };
    const stored = JSON.parse(raw) as BusinessSettings;
    // Back-compat: if registerOpen was never persisted, default to true
    // so existing users aren't suddenly locked out after an upgrade.
    if (stored.registerOpen === undefined) stored.registerOpen = true;
    return { ...DEFAULT_BUSINESS_SETTINGS, ...stored };
  }, []);

  const loadExpenses = useCallback(async (fromMs?: number, toMs?: number): Promise<Expense[]> => {
    const all = await getJson<Expense[]>(K.expenses, []);
    if (fromMs == null || toMs == null) return [...all].sort((a, b) => b.createdAt - a.createdAt);
    return all
      .filter((e) => e.createdAt >= fromMs && e.createdAt < toMs)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, []);

  const createExpense = useCallback(async (expense: Omit<Expense, "id" | "createdAt"> & { createdAt?: number }): Promise<Expense> => {
    const all = await getJson<Expense[]>(K.expenses, []);
    const row: Expense = {
      id: generateId(),
      amount: expense.amount,
      note: expense.note ?? "",
      staffId: expense.staffId,
      staffName: expense.staffName,
      createdAt: expense.createdAt ?? Date.now(),
    };
    await setJson(K.expenses, [row, ...all]);
    return row;
  }, []);

  const deleteExpense = useCallback(async (id: string): Promise<void> => {
    const all = await getJson<Expense[]>(K.expenses, []);
    await setJson(K.expenses, all.filter((e) => e.id !== id));
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
    return runCatalogExclusive(async () => {
      const customers = await getJson<Customer[]>(K.customers, []);
      const updatedAt = Date.now();
      const nc: Customer = { ...customer, id: generateId(), creditBalance: 0, loyaltyPoints: 0, createdAt: updatedAt, updatedAt };
      const outbox = await buildOutboxUpsert("customer", nc.id, nc, false, updatedAt);
      await writeEntityAndOutbox(K.customers, [...customers, nc], outbox);
      return nc;
    });
  }, []);

  const updateCustomer = useCallback(async (customer: Customer): Promise<void> => {
    return runCatalogExclusive(async () => {
      const customers = await getJson<Customer[]>(K.customers, []);
      const updatedAt = Date.now();
      const next: Customer = { ...customer, updatedAt };
      const outbox = await buildOutboxUpsert("customer", customer.id, next, false, updatedAt);
      await writeEntityAndOutbox(K.customers, customers.map((c) => c.id === customer.id ? next : c), outbox);
    });
  }, []);

  const deleteCustomer = useCallback(async (id: string): Promise<void> => {
    return runCatalogExclusive(async () => {
      const customers = await getJson<Customer[]>(K.customers, []);
      const t = customers.find((c) => c.id === id);
      if (t && t.creditBalance > 0) throw new Error("Cannot delete customer with outstanding balance");
      const updatedAt = Date.now();
      const outbox = await buildOutboxUpsert("customer", id, { id }, true, updatedAt);
      await writeEntityAndOutbox(K.customers, customers.filter((c) => c.id !== id), outbox);
    });
  }, []);

  const recordCreditPayment = useCallback(async (customerId: string, amount: number, note: string): Promise<CreditPayment> => {
    if (amount <= 0) throw new Error("Payment amount must be positive");
    return runCatalogExclusive(async () => {
      const customers = await getJson<Customer[]>(K.customers, []);
      const t = customers.find((c) => c.id === customerId);
      if (!t) throw new Error("Customer not found");
      const roundedAmount = Math.round(amount * 100) / 100;
      const roundedBalance = Math.round(t.creditBalance * 100) / 100;
      if (roundedAmount > roundedBalance) throw new Error("Payment exceeds outstanding balance");
      const newBalance = Math.round((roundedBalance - roundedAmount) * 100) / 100;
      const updatedAt = Date.now();
      const payment: CreditPayment = { id: generateId(), customerId, amount: roundedAmount, note, createdAt: updatedAt };
      const existing = await getJson<CreditPayment[]>(K.creditPayments, []);
      // Credit payment ledger isn't in the catalog outbox — only the
      // customer snapshot needs to sync (creditBalance is part of the LWW
      // payload, see replit.md "Catalog stock is full LWW (v1)" caveat
      // which applies the same way to credit balance).
      await setJson(K.creditPayments, [payment, ...existing]);
      const nextCustomers = customers.map((c) =>
        c.id === customerId ? { ...c, creditBalance: newBalance, updatedAt } : c
      );
      const updatedCustomer = nextCustomers.find((c) => c.id === customerId)!;
      const outbox = await buildOutboxUpsert("customer", customerId, updatedCustomer, false, updatedAt);
      await writeEntityAndOutbox(K.customers, nextCustomers, outbox);
      return payment;
    });
  }, []);

  const loadCreditPayments = useCallback(async (customerId: string): Promise<CreditPayment[]> => {
    const all = await getJson<CreditPayment[]>(K.creditPayments, []);
    return all.filter((p) => p.customerId === customerId);
  }, []);

  const updateLoyaltyPoints = useCallback(async (customerId: string, delta: number): Promise<void> => {
    return runCatalogExclusive(async () => {
      const customers = await getJson<Customer[]>(K.customers, []);
      const updatedAt = Date.now();
      const nextCustomers = customers.map((c) =>
        c.id === customerId ? { ...c, loyaltyPoints: Math.max(0, (c.loyaltyPoints ?? 0) + delta), updatedAt } : c
      );
      const updatedCustomer = nextCustomers.find((c) => c.id === customerId);
      if (!updatedCustomer) {
        await setJson(K.customers, nextCustomers);
        return;
      }
      const outbox = await buildOutboxUpsert("customer", customerId, updatedCustomer, false, updatedAt);
      await writeEntityAndOutbox(K.customers, nextCustomers, outbox);
    });
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
    return runCatalogExclusive(async () => {
      const existing = await getCategories();
      const updatedAt = Date.now();
      const nc: Category = { ...category, id: generateId(), updatedAt };
      const outbox = await buildOutboxUpsert("category", nc.id, nc, false, updatedAt);
      await writeEntityAndOutbox(K.categories, [...existing, nc], outbox);
      return nc;
    });
  }, []);

  const updateCategory = useCallback(async (category: Category): Promise<void> => {
    return runCatalogExclusive(async () => {
      const existing = await getCategories();
      const updatedAt = Date.now();
      const next: Category = { ...category, updatedAt };
      const outbox = await buildOutboxUpsert("category", category.id, next, false, updatedAt);
      await writeEntityAndOutbox(K.categories, existing.map((c) => c.id === category.id ? next : c), outbox);
    });
  }, []);

  const deleteCategory = useCallback(async (id: string): Promise<void> => {
    return runCatalogExclusive(async () => {
      const existing = await getCategories();
      const updatedAt = Date.now();
      const outbox = await buildOutboxUpsert("category", id, { id }, true, updatedAt);
      await writeEntityAndOutbox(K.categories, existing.filter((c) => c.id !== id), outbox);
    });
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
    // Drop the queue, catalog outbox, and tenant-ownership stamp — see
    // DatabaseContext.tsx importData for the rationale. Restored backups
    // are foreign data until the operator explicitly wipes and re-activates.
    // clearOwningCompanyId() also clears the catalog pull cursor.
    await AsyncStorage.setItem(K.syncQueue, JSON.stringify([]));
    await AsyncStorage.setItem(K.catalogOutbox, JSON.stringify([]));
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
      // Phase 3d: drop pending customer pushes alongside the rows themselves
      // so the cloud doesn't see ghost edits/tombstones for rows the user
      // explicitly cleared. Mirrors the native clearData behavior.
      const outbox = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
      await setJson(K.catalogOutbox, outbox.filter((o) => o.entityType !== "customer"));
    }
    if (opts.products) {
      await wipe(K.products);
      await wipe(K.recipeIngredients);
      // Drop pending product pushes alongside the rows themselves.
      const outbox = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
      await setJson(K.catalogOutbox, outbox.filter((o) => o.entityType !== "product"));
    }
    if (opts.categories) {
      await wipe(K.categories);
      const outbox = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
      await setJson(K.catalogOutbox, outbox.filter((o) => o.entityType !== "category"));
    }
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

  // ---- Phase 3c: catalog outbox + remote apply ----

  const loadCatalogBatch = useCallback(async (limit: number): Promise<CatalogOutboxItem[]> => {
    const queue = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
    return [...queue]
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      .slice(0, limit)
      .map((q) => ({
        outboxId: q.id,
        entityType: q.entityType,
        entityId: q.entityId,
        payload: q.payload,
        deleted: q.deleted,
        updatedAt: q.updatedAt,
        attemptCount: q.attemptCount,
        lastAttemptAt: q.lastAttemptAt,
      }));
  }, []);

  const markCatalogResults = useCallback(async (results: CatalogResultUpdate[]): Promise<void> => {
    if (results.length === 0) return;
    return runCatalogExclusive(async () => {
      const queue = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
      const now = Date.now();
      // Match by (id + attemptedUpdatedAt) so a row that was re-edited
      // during the push (UPSERT keeps id, bumps updatedAt) is left alone —
      // protects against ACK races losing newer pending edits.
      const okKeys = new Set(
        results.filter((r) => r.ok).map((r) => `${r.outboxId}:${r.attemptedUpdatedAt}`)
      );
      const failedByKey = new Map(
        results.filter((r) => !r.ok).map((r) => [`${r.outboxId}:${r.attemptedUpdatedAt}`, r] as const)
      );
      const next = queue
        .filter((q) => !okKeys.has(`${q.id}:${q.updatedAt}`))
        .map((q) => {
          const fail = failedByKey.get(`${q.id}:${q.updatedAt}`);
          if (!fail) return q;
          return {
            ...q,
            attemptCount: q.attemptCount + 1,
            lastAttemptAt: now,
            lastError: fail.error ?? null,
          };
        });
      await setJson(K.catalogOutbox, next);
    });
  }, []);

  const countPendingCatalog = useCallback(async (): Promise<number> => {
    const queue = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
    return queue.length;
  }, []);

  const applyRemoteCatalog = useCallback(async (input: CatalogApplyInput): Promise<void> => {
    const incomingProducts = input.products ?? [];
    const incomingCategories = input.categories ?? [];
    const incomingCustomers = input.customers ?? [];
    if (incomingProducts.length === 0 && incomingCategories.length === 0 && incomingCustomers.length === 0) return;
    // Take the catalog mutex for the whole apply pass so the outbox snapshot
    // we use for the LWW skip-check is consistent with the entity tables we
    // then read+rewrite. Without this, a local edit completing mid-pass
    // could write a newer outbox row while we're applying stale remote rows
    // on top of stale entity snapshots.
    return runCatalogExclusive(async () => {
    // Index pending outbox entries so a pulled row never clobbers a local
    // unpushed edit — including local *deletes* where the entity table no
    // longer has a row to compare against.
    const outbox = await getJson<WebCatalogOutboxRow[]>(K.catalogOutbox, []);
    const pendingUpdatedAt = new Map<string, number>();
    for (const o of outbox) pendingUpdatedAt.set(`${o.entityType}:${o.entityId}`, o.updatedAt);

    if (incomingProducts.length > 0) {
      const local = await getProducts();
      const byId = new Map(local.map((p) => [p.id, p] as const));
      for (const e of incomingProducts) {
        const pending = pendingUpdatedAt.get(`product:${e.id}`);
        if (pending !== undefined && pending >= e.updatedAt) continue;
        const existing = byId.get(e.id);
        // LWW: only overwrite if the remote write is strictly newer than
        // what we have locally. Treat a missing local updatedAt as 0 so any
        // real cloud edit wins over seed rows.
        const localUpdatedAt = existing?.updatedAt ?? 0;
        if (existing && localUpdatedAt >= e.updatedAt) continue;
        if (e.deleted) {
          byId.delete(e.id);
          continue;
        }
        // Full replace, matching native's INSERT OR REPLACE: the incoming
        // payload IS the authoritative state. Merging with `existing` would
        // resurrect locally-cleared fields. Cast through unknown so TS
        // accepts a server-provided shape that may be missing optional
        // fields — we trust the server-applied row.
        const p = e.payload as Partial<Product>;
        byId.set(e.id, { ...(p as unknown as Product), id: e.id, updatedAt: e.updatedAt });
      }
      await setJson(K.products, Array.from(byId.values()));
    }

    if (incomingCategories.length > 0) {
      const local = await getCategories();
      const byId = new Map(local.map((c) => [c.id, c] as const));
      for (const e of incomingCategories) {
        const pending = pendingUpdatedAt.get(`category:${e.id}`);
        if (pending !== undefined && pending >= e.updatedAt) continue;
        const existing = byId.get(e.id);
        const localUpdatedAt = existing?.updatedAt ?? 0;
        if (existing && localUpdatedAt >= e.updatedAt) continue;
        if (e.deleted) {
          byId.delete(e.id);
          continue;
        }
        const c = e.payload as Partial<Category>;
        byId.set(e.id, { ...(c as unknown as Category), id: e.id, updatedAt: e.updatedAt });
      }
      await setJson(K.categories, Array.from(byId.values()));
    }

    if (incomingCustomers.length > 0) {
      const local = await getJson<Customer[]>(K.customers, []);
      const byId = new Map(local.map((c) => [c.id, c] as const));
      for (const e of incomingCustomers) {
        const pending = pendingUpdatedAt.get(`customer:${e.id}`);
        if (pending !== undefined && pending >= e.updatedAt) continue;
        const existing = byId.get(e.id);
        const localUpdatedAt = existing?.updatedAt ?? 0;
        if (existing && localUpdatedAt >= e.updatedAt) continue;
        if (e.deleted) {
          byId.delete(e.id);
          continue;
        }
        // Full replace (matches native INSERT OR REPLACE). Don't merge with
        // `existing` — the cloud payload IS the authoritative state, and
        // merging would resurrect locally-cleared optional fields.
        const cu = e.payload as Partial<Customer>;
        byId.set(e.id, {
          id: e.id,
          name: cu.name ?? "",
          phone: cu.phone ?? "",
          email: cu.email ?? "",
          company: cu.company ?? "",
          creditBalance: typeof cu.creditBalance === "number" ? cu.creditBalance : 0,
          loyaltyPoints: typeof cu.loyaltyPoints === "number" ? cu.loyaltyPoints : 0,
          // Keep existing local createdAt if present (don't lose first-seen
          // time on a remote-driven update); fall back to the remote value
          // for new rows.
          createdAt: existing?.createdAt ?? (typeof cu.createdAt === "number" ? cu.createdAt : e.updatedAt),
          updatedAt: e.updatedAt,
        });
      }
      await setJson(K.customers, Array.from(byId.values()));
    }
    });
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
      loadExpenses, createExpense, deleteExpense,
      enqueueSync, reconcilePendingSync, loadSyncBatch, markSyncResults, countPendingSync,
      loadCatalogBatch, markCatalogResults, countPendingCatalog, applyRemoteCatalog,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}
