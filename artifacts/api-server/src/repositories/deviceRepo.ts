import { eq, and, sql } from "drizzle-orm";
import { saasDb, devicesTable, type Device, type InsertDevice } from "@workspace/saas-db";

export const deviceRepo = {
  async findByLicenseAndUid(
    licenseId: string,
    deviceUid: string,
  ): Promise<Device | undefined> {
    return saasDb.query.devicesTable.findFirst({
      where: and(
        eq(devicesTable.licenseId, licenseId),
        eq(devicesTable.deviceUid, deviceUid),
      ),
    });
  },

  async countByLicense(licenseId: string): Promise<number> {
    const [row] = await saasDb
      .select({ count: sql<number>`count(*)::int` })
      .from(devicesTable)
      .where(eq(devicesTable.licenseId, licenseId));
    return row?.count ?? 0;
  },

  async upsert(data: InsertDevice): Promise<Device> {
    const existing = await this.findByLicenseAndUid(
      data.licenseId,
      data.deviceUid,
    );
    if (existing) {
      const [row] = await saasDb
        .update(devicesTable)
        .set({
          name: data.name ?? existing.name,
          platform: data.platform ?? existing.platform,
          appVersion: data.appVersion ?? existing.appVersion,
          lastSeenAt: new Date(),
        })
        .where(eq(devicesTable.id, existing.id))
        .returning();
      if (!row) throw new Error("Failed to update device");
      return row;
    }
    const [row] = await saasDb
      .insert(devicesTable)
      .values({ ...data, lastSeenAt: new Date() })
      .returning();
    if (!row) throw new Error("Failed to insert device");
    return row;
  },

  async listByCompany(companyId: string): Promise<Device[]> {
    return saasDb
      .select()
      .from(devicesTable)
      .where(eq(devicesTable.companyId, companyId));
  },

  async deleteDevice(id: string, companyId: string): Promise<boolean> {
    const result = await saasDb
      .delete(devicesTable)
      .where(and(eq(devicesTable.id, id), eq(devicesTable.companyId, companyId)))
      .returning({ id: devicesTable.id });
    return result.length > 0;
  },
};
