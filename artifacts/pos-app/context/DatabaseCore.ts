import { createContext, useContext } from "react";
import type {
  BackupData, BusinessSettings, CartItem, Category, ClearDataOptions, CreditPayment, Customer,
  Expense, HeldOrder, Ingredient, OrderType, PosTable, Product,
  RecipeIngredient, Rider, Sale, SaleItem, SplitPaymentEntry,
  Staff, TaxGroup,
} from "@/types";

/** Phase 3b: outbound sync queue entry visible to the sync engine. */
export type SyncEntityType = "sale";

export interface SyncQueueItem {
  queueId: string;
  entityType: SyncEntityType;
  entityId: string;
  attemptCount: number;
  lastAttemptAt: number | null;
}

export interface SyncResultUpdate {
  queueId: string;
  ok: boolean;
  error?: string;
}

/**
 * Phase 3c: catalog outbox. Stores latest snapshot per entity (products and
 * categories), so re-edits collapse into a single pending push instead of
 * piling up. Payload + deleted flag are captured at enqueue time so deletes
 * survive the source row going away.
 *
 * Phase 3d: extended with `customer` as a third stream — same outbox table,
 * same engine, same wire endpoint (`/api/sync/catalog/*`). The "catalog"
 * naming is historical; treat customers as a peer.
 */
export type CatalogEntityType = "product" | "category" | "customer";

export interface CatalogOutboxItem {
  outboxId: string;
  entityType: CatalogEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  deleted: boolean;
  /** Wall-clock ms epoch used by the server for last-write-wins. */
  updatedAt: number;
  attemptCount: number;
  lastAttemptAt: number | null;
}

export interface CatalogResultUpdate {
  outboxId: string;
  /**
   * The `updatedAt` of the outbox row that was actually pushed. The
   * markCatalogResults implementations only delete a row when this still
   * matches the current outbox row's updated_at — protecting against the
   * ACK race where the user edits the same entity again while the previous
   * push is in flight (the upserted row keeps its `id` but bumps
   * `updated_at`, so a stale ok-verdict for the older payload would
   * otherwise drop the newer pending edit).
   */
  attemptedUpdatedAt: number;
  ok: boolean;
  error?: string;
}

export interface CatalogApplyEntry {
  id: string;
  payload: unknown;
  /** Remote wall-clock ms epoch. Local row only overwritten if newer. */
  updatedAt: number;
  deleted: boolean;
}

export interface CatalogApplyInput {
  products?: CatalogApplyEntry[];
  categories?: CatalogApplyEntry[];
  customers?: CatalogApplyEntry[];
}

export interface SaleOptions {
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
  loyaltyPointsRedeemed?: number;
  splitPayments?: SplitPaymentEntry[];
}

export interface DatabaseContextValue {
  loadProducts: () => Promise<Product[]>;
  createProduct: (product: Omit<Product, "id">) => Promise<Product>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateStock: (productId: string, delta: number) => Promise<void>;

  saveSale: (items: CartItem[], options: SaleOptions) => Promise<Sale>;
  loadSales: () => Promise<Sale[]>;
  loadSaleWithItems: (saleId: string) => Promise<Sale | null>;
  loadSaleByInvoiceNumber: (invoiceNumber: string) => Promise<Sale | null>;
  loadSalesWithItemsByDateRange: (startMs: number, endMs: number) => Promise<{ sales: Sale[]; items: SaleItem[] }>;
  processRefund: (originalSaleId: string, staffId?: string, staffName?: string) => Promise<Sale>;

  loadBusinessSettings: () => Promise<BusinessSettings>;
  saveBusinessSettings: (settings: BusinessSettings) => Promise<void>;

  loadCustomers: () => Promise<Customer[]>;
  createCustomer: (customer: Omit<Customer, "id" | "creditBalance" | "loyaltyPoints" | "createdAt">) => Promise<Customer>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  recordCreditPayment: (customerId: string, amount: number, note: string) => Promise<CreditPayment>;
  loadCreditPayments: (customerId: string) => Promise<CreditPayment[]>;
  updateLoyaltyPoints: (customerId: string, delta: number) => Promise<void>;

  loadStaff: () => Promise<Staff[]>;
  createStaff: (staff: Omit<Staff, "id" | "active" | "createdAt">) => Promise<Staff>;
  updateStaff: (staff: Staff) => Promise<void>;
  deleteStaff: (id: string) => Promise<void>;
  authenticateStaff: (pin: string) => Promise<Staff | null>;

  loadTables: () => Promise<PosTable[]>;
  createTable: (table: Omit<PosTable, "id" | "status" | "createdAt">) => Promise<PosTable>;
  updateTable: (table: PosTable) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  setTableStatus: (id: string, status: PosTable["status"], orderId?: string) => Promise<void>;

  loadTaxGroups: () => Promise<TaxGroup[]>;
  createTaxGroup: (group: Omit<TaxGroup, "id">) => Promise<TaxGroup>;
  updateTaxGroup: (group: TaxGroup) => Promise<void>;
  deleteTaxGroup: (id: string) => Promise<void>;

  loadCategories: () => Promise<Category[]>;
  createCategory: (category: Omit<Category, "id">) => Promise<Category>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  loadSplitPayments: (saleId: string) => Promise<SplitPaymentEntry[]>;
  saveZReport: (report: any) => Promise<void>;
  loadZReports: () => Promise<any[]>;

  loadRiders: () => Promise<Rider[]>;
  createRider: (rider: Omit<Rider, "id" | "active" | "createdAt">) => Promise<Rider>;
  updateRider: (rider: Rider) => Promise<void>;
  deleteRider: (id: string) => Promise<void>;

  saveHeldOrder: (order: Omit<HeldOrder, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<HeldOrder>;
  loadHeldOrders: () => Promise<HeldOrder[]>;
  loadHeldOrderByTable: (tableId: string) => Promise<HeldOrder | null>;
  deleteHeldOrder: (id: string) => Promise<void>;

  loadIngredients: () => Promise<Ingredient[]>;
  createIngredient: (ingredient: Omit<Ingredient, "id" | "createdAt">) => Promise<Ingredient>;
  updateIngredient: (ingredient: Ingredient) => Promise<void>;
  deleteIngredient: (id: string) => Promise<void>;
  updateIngredientStock: (ingredientId: string, delta: number) => Promise<void>;

  loadRecipeIngredients: (productId: string) => Promise<RecipeIngredient[]>;
  saveRecipeIngredients: (productId: string, items: Omit<RecipeIngredient, "id">[]) => Promise<void>;
  deleteRecipeIngredients: (productId: string) => Promise<void>;

  exportData: () => Promise<BackupData>;
  importData: (data: BackupData) => Promise<void>;
  clearData: (opts: ClearDataOptions) => Promise<void>;

  // ---- Cash-out / petty-cash ledger ----
  /** Load expenses, optionally restricted to a [from, to) ms window. */
  loadExpenses: (fromMs?: number, toMs?: number) => Promise<Expense[]>;
  /** Insert a new expense; returns the persisted row including generated id. */
  createExpense: (expense: Omit<Expense, "id" | "createdAt"> & { createdAt?: number }) => Promise<Expense>;
  /** Hard-delete a single expense row. */
  deleteExpense: (id: string) => Promise<void>;

  // ---- Phase 3b: outbound sync queue ----
  /** Mark an entity as needing to be pushed to the cloud. Idempotent. */
  enqueueSync: (entityType: SyncEntityType, entityId: string) => Promise<void>;
  /** Backfill the queue with any existing entities not yet tracked. */
  reconcilePendingSync: () => Promise<number>;
  /** Load up to `limit` pending items (caller filters out backoff). */
  loadSyncBatch: (entityType: SyncEntityType, limit: number) => Promise<SyncQueueItem[]>;
  /** Apply ok/failed verdicts to queued items. */
  markSyncResults: (results: SyncResultUpdate[]) => Promise<void>;
  /** How many pending items remain (for status UI). */
  countPendingSync: (entityType: SyncEntityType) => Promise<number>;

  // ---- Phase 3c: catalog outbox + remote apply ----
  /** Load up to `limit` pending catalog snapshots (caller filters backoff). */
  loadCatalogBatch: (limit: number) => Promise<CatalogOutboxItem[]>;
  /** Apply ok/failed verdicts to outbox rows; ok deletes them. */
  markCatalogResults: (results: CatalogResultUpdate[]) => Promise<void>;
  /** How many catalog pushes are pending (for status UI). */
  countPendingCatalog: () => Promise<number>;
  /**
   * Apply remote catalog rows pulled from the cloud. Skips entries where
   * the local row is newer (LWW). Tombstones delete the local row when
   * older than the tombstone. Does NOT enqueue — these writes originate
   * from the cloud so they shouldn't bounce back.
   */
  applyRemoteCatalog: (input: CatalogApplyInput) => Promise<void>;
}

export const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error("useDatabase must be used within a DatabaseProvider");
  return ctx;
}
