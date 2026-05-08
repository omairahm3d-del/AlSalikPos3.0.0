import { eq, and } from "drizzle-orm";
import { saasDb, licensesTable, type License, type InsertLicense } from "@workspace/saas-db";

export const licenseRepo = {
  async create(data: InsertLicense): Promise<License> {
    const [row] = await saasDb.insert(licensesTable).values(data).returning();
    if (!row) throw new Error("Failed to insert license");
    return row;
  },

  async findByKey(key: string): Promise<License | undefined> {
    return saasDb.query.licensesTable.findFirst({
      where: eq(licensesTable.key, key),
    });
  },

  async findById(id: string): Promise<License | undefined> {
    return saasDb.query.licensesTable.findFirst({
      where: eq(licensesTable.id, id),
    });
  },

  async listByCompany(companyId: string): Promise<License[]> {
    return saasDb
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.companyId, companyId));
  },

  async revoke(id: string, companyId: string): Promise<License | undefined> {
    const [row] = await saasDb
      .update(licensesTable)
      .set({ status: "revoked" })
      .where(and(eq(licensesTable.id, id), eq(licensesTable.companyId, companyId)))
      .returning();
    return row;
  },

  async extend(
    id: string,
    companyId: string,
    expiresAt: Date | null,
  ): Promise<License | undefined> {
    const [row] = await saasDb
      .update(licensesTable)
      .set({ expiresAt })
      .where(and(eq(licensesTable.id, id), eq(licensesTable.companyId, companyId)))
      .returning();
    return row;
  },

  async setMaxDevices(
    id: string,
    companyId: string,
    maxDevices: number,
  ): Promise<License | undefined> {
    const [row] = await saasDb
      .update(licensesTable)
      .set({ maxDevices })
      .where(and(eq(licensesTable.id, id), eq(licensesTable.companyId, companyId)))
      .returning();
    return row;
  },

  async deleteLicense(id: string, companyId: string): Promise<boolean> {
    const result = await saasDb
      .delete(licensesTable)
      .where(and(eq(licensesTable.id, id), eq(licensesTable.companyId, companyId)))
      .returning({ id: licensesTable.id });
    return result.length > 0;
  },
};
