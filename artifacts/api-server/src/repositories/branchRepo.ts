import { and, asc, eq } from "drizzle-orm";
import {
  saasDb,
  branchesTable,
  type Branch,
  type InsertBranch,
} from "@workspace/saas-db";

export const branchRepo = {
  async listByCompany(companyId: string): Promise<Branch[]> {
    return saasDb
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.companyId, companyId))
      .orderBy(asc(branchesTable.createdAt));
  },

  async listActiveByCompany(companyId: string): Promise<Branch[]> {
    return saasDb
      .select()
      .from(branchesTable)
      .where(
        and(
          eq(branchesTable.companyId, companyId),
          eq(branchesTable.isActive, true),
        ),
      )
      .orderBy(asc(branchesTable.createdAt));
  },

  async findById(id: string): Promise<Branch | undefined> {
    return saasDb.query.branchesTable.findFirst({
      where: eq(branchesTable.id, id),
    });
  },

  async findDefault(companyId: string): Promise<Branch | undefined> {
    return saasDb.query.branchesTable.findFirst({
      where: and(
        eq(branchesTable.companyId, companyId),
        eq(branchesTable.isDefault, true),
      ),
    });
  },

  async create(data: InsertBranch): Promise<Branch> {
    const [row] = await saasDb.insert(branchesTable).values(data).returning();
    if (!row) throw new Error("Failed to insert branch");
    return row;
  },

  async update(
    id: string,
    companyId: string,
    patch: Partial<Pick<Branch, "name" | "address" | "isActive" | "isDefault">>,
  ): Promise<Branch | undefined> {
    const [row] = await saasDb
      .update(branchesTable)
      .set(patch)
      .where(
        and(eq(branchesTable.id, id), eq(branchesTable.companyId, companyId)),
      )
      .returning();
    return row;
  },
};
