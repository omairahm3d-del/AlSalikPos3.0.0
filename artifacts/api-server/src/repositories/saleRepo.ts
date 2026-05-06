import { and, desc, eq, sql } from "drizzle-orm";
import {
  saasDb,
  salesTable,
  type InsertSale,
  type SalesRow,
} from "@workspace/saas-db";

export interface SaleInsertResult {
  clientSaleId: string;
  status: "inserted" | "duplicate";
  serverId?: string;
}

export const saleRepo = {
  /**
   * Idempotent bulk insert. Each row that conflicts on
   * `(companyId, clientSaleId)` is reported as a duplicate; new rows are
   * reported as inserted with their server-assigned id.
   *
   * The whole batch runs in a single statement so partial failures don't
   * leak — Postgres either commits all non-conflicting rows together or
   * rolls back on a real error.
   */
  async bulkInsert(rows: InsertSale[]): Promise<SaleInsertResult[]> {
    if (rows.length === 0) return [];
    const inserted = await saasDb
      .insert(salesTable)
      .values(rows)
      .onConflictDoNothing({
        target: [salesTable.companyId, salesTable.clientSaleId],
      })
      .returning({
        id: salesTable.id,
        clientSaleId: salesTable.clientSaleId,
      });
    const insertedIds = new Map(inserted.map((r) => [r.clientSaleId, r.id]));
    return rows.map((r) => {
      const serverId = insertedIds.get(r.clientSaleId);
      return serverId
        ? { clientSaleId: r.clientSaleId, status: "inserted", serverId }
        : { clientSaleId: r.clientSaleId, status: "duplicate" };
    });
  },

  async listByCompany(
    companyId: string,
    opts: { limit?: number; afterReceivedAt?: Date } = {},
  ): Promise<SalesRow[]> {
    const limit = Math.min(opts.limit ?? 100, 500);
    return saasDb
      .select()
      .from(salesTable)
      .where(
        opts.afterReceivedAt
          ? and(
              eq(salesTable.companyId, companyId),
              sql`${salesTable.receivedAt} > ${opts.afterReceivedAt}`,
            )
          : eq(salesTable.companyId, companyId),
      )
      .orderBy(desc(salesTable.createdAtClient))
      .limit(limit);
  },

  async countByCompany(companyId: string): Promise<number> {
    const [row] = await saasDb
      .select({ n: sql<number>`count(*)::int` })
      .from(salesTable)
      .where(eq(salesTable.companyId, companyId));
    return row?.n ?? 0;
  },
};
