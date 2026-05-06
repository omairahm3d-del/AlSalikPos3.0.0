import { and, desc, eq, gte, lte } from "drizzle-orm";
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
