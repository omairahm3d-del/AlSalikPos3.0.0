import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import {
  saasDb,
  purchasesTable,
  purchaseItemsTable,
  stockMovementsTable,
  type InsertPurchase,
  type InsertPurchaseItem,
  type Purchase,
  type PurchaseItem,
} from "@workspace/saas-db";

/**
 * Persists a Goods Received note: the purchase header, its line items, and
 * one positive stock movement per line — all inside a single transaction so
 * we never end up with stock changes for a purchase that failed to save (or
 * vice-versa).
 *
 * The unique key on stock_movements is `(companyId, kind, refId, productClientId)`
 * with `refId = purchase.id`, so re-saving (e.g. retry on a flaky network)
 * cannot double the stock impact for the same line.
 */
export const purchaseRepo = {
  async createWithItems(
    header: InsertPurchase,
    items: Omit<InsertPurchaseItem, "purchaseId">[],
  ): Promise<{ purchase: Purchase; items: PurchaseItem[] }> {
    return saasDb.transaction(async (tx) => {
      const [purchase] = await tx
        .insert(purchasesTable)
        .values(header)
        .returning();
      if (!purchase) throw new Error("Failed to insert purchase header");

      const itemRows: PurchaseItem[] = items.length
        ? await tx
            .insert(purchaseItemsTable)
            .values(items.map((it) => ({ ...it, purchaseId: purchase.id })))
            .returning()
        : [];

      if (itemRows.length > 0) {
        await tx.insert(stockMovementsTable).values(
          itemRows.map((it) => ({
            companyId: purchase.companyId,
            branchId: purchase.branchId,
            productClientId: it.productClientId,
            productName: it.productName,
            sku: it.sku,
            delta: String(it.quantity),
            kind: "purchase",
            refId: purchase.id,
            reason: null,
          })),
        );
      }

      return { purchase, items: itemRows };
    });
  },

  async listByBranch(
    companyId: string,
    branchId: string,
    opts: { from?: Date; to?: Date; limit?: number } = {},
  ): Promise<Purchase[]> {
    const conds = [
      eq(purchasesTable.companyId, companyId),
      eq(purchasesTable.branchId, branchId),
    ];
    if (opts.from) conds.push(gte(purchasesTable.receivedAt, opts.from));
    if (opts.to) conds.push(lte(purchasesTable.receivedAt, opts.to));
    return saasDb
      .select()
      .from(purchasesTable)
      .where(and(...conds))
      .orderBy(desc(purchasesTable.receivedAt))
      .limit(Math.min(opts.limit ?? 100, 500));
  },

  async itemsForPurchase(purchaseId: string): Promise<PurchaseItem[]> {
    return saasDb
      .select()
      .from(purchaseItemsTable)
      .where(eq(purchaseItemsTable.purchaseId, purchaseId));
  },

  async findById(id: string): Promise<Purchase | undefined> {
    return saasDb.query.purchasesTable.findFirst({
      where: eq(purchasesTable.id, id),
    });
  },

  async listForSupplier(
    companyId: string,
    supplierId: string,
    opts: { branchId?: string; from?: Date; to?: Date; limit?: number } = {},
  ): Promise<Purchase[]> {
    const conds = [
      eq(purchasesTable.companyId, companyId),
      eq(purchasesTable.supplierId, supplierId),
    ];
    if (opts.branchId) conds.push(eq(purchasesTable.branchId, opts.branchId));
    if (opts.from) conds.push(gte(purchasesTable.receivedAt, opts.from));
    if (opts.to) conds.push(lte(purchasesTable.receivedAt, opts.to));
    return saasDb
      .select()
      .from(purchasesTable)
      .where(and(...conds))
      .orderBy(desc(purchasesTable.receivedAt))
      .limit(Math.min(opts.limit ?? 1000, 5000));
  },

  /**
   * Per-supplier activity at one branch — last-receipt date and rolling
   * window totals — fetched in a single grouped query so the suppliers
   * list doesn't N+1. `since` controls the window for the totals/counts;
   * the lastReceivedAt aggregate covers all-time.
   *
   * Only purchases with a non-null `supplierId` are considered (free-text
   * supplier names from the Receive Stock form aren't tied to a row).
   */
  async activitySummaryByBranch(
    companyId: string,
    branchId: string,
    since: Date,
  ): Promise<
    Array<{
      supplierId: string;
      lastReceivedAt: string | null;
      windowTotal: string;
      windowCount: number;
    }>
  > {
    const rows = await saasDb
      .select({
        supplierId: purchasesTable.supplierId,
        lastReceivedAt: sql<string | null>`max(${purchasesTable.receivedAt})`,
        windowTotal: sql<string>`coalesce(sum(case when ${purchasesTable.receivedAt} >= ${since} then ${purchasesTable.total} else 0 end), 0)`,
        windowCount: sql<number>`coalesce(sum(case when ${purchasesTable.receivedAt} >= ${since} then 1 else 0 end), 0)::int`,
      })
      .from(purchasesTable)
      .where(
        and(
          eq(purchasesTable.companyId, companyId),
          eq(purchasesTable.branchId, branchId),
          isNotNull(purchasesTable.supplierId),
        ),
      )
      .groupBy(purchasesTable.supplierId);
    return rows.map((r) => ({
      supplierId: r.supplierId as string,
      lastReceivedAt: r.lastReceivedAt
        ? new Date(r.lastReceivedAt).toISOString()
        : null,
      windowTotal: String(r.windowTotal ?? "0"),
      windowCount: Number(r.windowCount ?? 0),
    }));
  },

  async findByIdempotencyKey(
    companyId: string,
    idempotencyKey: string,
  ): Promise<Purchase | undefined> {
    return saasDb.query.purchasesTable.findFirst({
      where: and(
        eq(purchasesTable.companyId, companyId),
        eq(purchasesTable.idempotencyKey, idempotencyKey),
      ),
    });
  },
};
