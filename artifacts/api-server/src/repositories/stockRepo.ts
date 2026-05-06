import { and, desc, eq, sql } from "drizzle-orm";
import {
  saasDb,
  stockMovementsTable,
  type InsertStockMovement,
  type StockMovement,
} from "@workspace/saas-db";

export interface StockOnHandRow {
  productClientId: string;
  productName: string;
  sku: string | null;
  onHand: string; // numeric returned as text
}

export const stockRepo = {
  /**
   * Inserts a batch of stock movements idempotently — anything that conflicts
   * on `(companyId, kind, refId, productClientId)` is silently dropped (the
   * caller is re-inserting the same logical movement, e.g. a re-pushed sale
   * or a retried purchase save). Returns the actually-inserted rows so callers
   * can tell new movements from no-ops.
   */
  async insertMany(rows: InsertStockMovement[]): Promise<StockMovement[]> {
    if (rows.length === 0) return [];
    return saasDb
      .insert(stockMovementsTable)
      .values(rows)
      .onConflictDoNothing({
        target: [
          stockMovementsTable.companyId,
          stockMovementsTable.kind,
          stockMovementsTable.refId,
          stockMovementsTable.productClientId,
        ],
      })
      .returning();
  },

  /**
   * Stock-on-hand per product for a given branch. Computed by SUM(delta)
   * grouped by product. Includes products that net to zero so the UI can
   * surface them, and excludes products with no movements at all (those
   * have never been purchased or sold from this branch).
   */
  async onHandForBranch(
    companyId: string,
    branchId: string,
  ): Promise<StockOnHandRow[]> {
    const rows = await saasDb
      .select({
        productClientId: stockMovementsTable.productClientId,
        productName: sql<string>`max(${stockMovementsTable.productName})`,
        sku: sql<string | null>`max(${stockMovementsTable.sku})`,
        onHand: sql<string>`coalesce(sum(${stockMovementsTable.delta}), 0)::text`,
      })
      .from(stockMovementsTable)
      .where(
        and(
          eq(stockMovementsTable.companyId, companyId),
          eq(stockMovementsTable.branchId, branchId),
        ),
      )
      .groupBy(stockMovementsTable.productClientId);
    return rows;
  },

  async movementsForBranch(
    companyId: string,
    branchId: string,
    opts: { productClientId?: string; limit?: number } = {},
  ): Promise<StockMovement[]> {
    const conds = [
      eq(stockMovementsTable.companyId, companyId),
      eq(stockMovementsTable.branchId, branchId),
    ];
    if (opts.productClientId) {
      conds.push(eq(stockMovementsTable.productClientId, opts.productClientId));
    }
    return saasDb
      .select()
      .from(stockMovementsTable)
      .where(and(...conds))
      .orderBy(desc(stockMovementsTable.createdAt))
      .limit(Math.min(opts.limit ?? 200, 500));
  },
};
