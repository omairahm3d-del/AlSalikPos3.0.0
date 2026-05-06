import { and, asc, eq, isNull, or } from "drizzle-orm";
import {
  saasDb,
  suppliersTable,
  type Supplier,
  type InsertSupplier,
} from "@workspace/saas-db";

/**
 * Branch scoping rule for suppliers (and other branch-scoped catalog tables):
 * a supplier with `branchId = NULL` is a company-wide supplier visible from
 * every branch, while a supplier with a specific `branchId` is private to
 * that branch. Reads include both; writes default to branch-private unless
 * the caller explicitly creates a company-wide supplier.
 */
function branchVisible(branchId: string) {
  return or(eq(suppliersTable.branchId, branchId), isNull(suppliersTable.branchId));
}

export const supplierRepo = {
  async listForBranch(companyId: string, branchId: string): Promise<Supplier[]> {
    return saasDb
      .select()
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.companyId, companyId),
          eq(suppliersTable.isActive, true),
          branchVisible(branchId),
        ),
      )
      .orderBy(asc(suppliersTable.name));
  },

  async findById(id: string): Promise<Supplier | undefined> {
    return saasDb.query.suppliersTable.findFirst({
      where: eq(suppliersTable.id, id),
    });
  },

  async create(data: InsertSupplier): Promise<Supplier> {
    const [row] = await saasDb.insert(suppliersTable).values(data).returning();
    if (!row) throw new Error("Failed to insert supplier");
    return row;
  },

  async update(
    id: string,
    companyId: string,
    patch: Partial<
      Pick<
        Supplier,
        | "name"
        | "phone"
        | "email"
        | "address"
        | "paymentTerms"
        | "notes"
        | "isActive"
        | "branchId"
      >
    >,
  ): Promise<Supplier | undefined> {
    const [row] = await saasDb
      .update(suppliersTable)
      .set(patch)
      .where(
        and(
          eq(suppliersTable.id, id),
          eq(suppliersTable.companyId, companyId),
        ),
      )
      .returning();
    return row;
  },
};
