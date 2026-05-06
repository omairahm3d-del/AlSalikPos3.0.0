import { and, asc, eq } from "drizzle-orm";
import {
  saasDb,
  managersTable,
  type Manager,
  type InsertManager,
} from "@workspace/saas-db";

export const managerRepo = {
  async listByCompany(companyId: string): Promise<Manager[]> {
    return saasDb
      .select()
      .from(managersTable)
      .where(eq(managersTable.companyId, companyId))
      .orderBy(asc(managersTable.createdAt));
  },

  async findById(id: string): Promise<Manager | undefined> {
    return saasDb.query.managersTable.findFirst({
      where: eq(managersTable.id, id),
    });
  },

  async findByCompanyAndEmail(
    companyId: string,
    email: string,
  ): Promise<Manager | undefined> {
    return saasDb.query.managersTable.findFirst({
      where: and(
        eq(managersTable.companyId, companyId),
        eq(managersTable.email, email.toLowerCase()),
      ),
    });
  },

  async create(data: InsertManager): Promise<Manager> {
    const [row] = await saasDb.insert(managersTable).values(data).returning();
    if (!row) throw new Error("Failed to insert manager");
    return row;
  },

  async update(
    id: string,
    companyId: string,
    patch: Partial<
      Pick<Manager, "name" | "passwordHash" | "role" | "isActive" | "lastLoginAt">
    >,
  ): Promise<Manager | undefined> {
    const [row] = await saasDb
      .update(managersTable)
      .set(patch)
      .where(
        and(eq(managersTable.id, id), eq(managersTable.companyId, companyId)),
      )
      .returning();
    return row;
  },
};
