import { and, eq } from "drizzle-orm";
import { saasDb, saasStaffTable, saasRidersTable } from "@workspace/saas-db";
import { z } from "zod/v4";

export const upsertStaffInput = z.object({
  clientId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  role: z.enum(["admin", "manager", "cashier", "driver"]).default("cashier"),
  pin: z.string().min(1).max(20),
  active: z.boolean().default(true),
  isDeleted: z.boolean().default(false),
  clientCreatedAt: z.number(),
});
export type UpsertStaffInput = z.infer<typeof upsertStaffInput>;

export const upsertRiderInput = z.object({
  clientId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).default(""),
  vehicleInfo: z.string().max(200).default(""),
  active: z.boolean().default(true),
  commissionPct: z.number().default(0),
  isDeleted: z.boolean().default(false),
  clientCreatedAt: z.number(),
});
export type UpsertRiderInput = z.infer<typeof upsertRiderInput>;

export const staffRiderService = {
  async upsertStaff(companyId: string, input: UpsertStaffInput) {
    const values = {
      companyId,
      clientId: input.clientId,
      name: input.name,
      role: input.role,
      pin: input.pin,
      active: input.active,
      isDeleted: input.isDeleted,
      clientCreatedAt: input.clientCreatedAt,
    };

    const [row] = await saasDb
      .insert(saasStaffTable)
      .values(values)
      .onConflictDoUpdate({
        target: [saasStaffTable.companyId, saasStaffTable.clientId],
        set: {
          name: values.name,
          role: values.role,
          pin: values.pin,
          active: values.active,
          isDeleted: values.isDeleted,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  },

  async listStaff(companyId: string) {
    return saasDb
      .select()
      .from(saasStaffTable)
      .where(
        and(
          eq(saasStaffTable.companyId, companyId),
          eq(saasStaffTable.isDeleted, false),
        ),
      );
  },

  async upsertRider(
    companyId: string,
    branchId: string | null | undefined,
    input: UpsertRiderInput,
  ) {
    const values = {
      companyId,
      branchId: branchId ?? null,
      clientId: input.clientId,
      name: input.name,
      phone: input.phone,
      vehicleInfo: input.vehicleInfo,
      active: input.active,
      commissionPct: String(input.commissionPct),
      isDeleted: input.isDeleted,
      clientCreatedAt: input.clientCreatedAt,
    };

    const [row] = await saasDb
      .insert(saasRidersTable)
      .values(values)
      .onConflictDoUpdate({
        target: [saasRidersTable.companyId, saasRidersTable.clientId],
        set: {
          name: values.name,
          phone: values.phone,
          vehicleInfo: values.vehicleInfo,
          active: values.active,
          commissionPct: values.commissionPct,
          isDeleted: values.isDeleted,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  },

  async listRiders(companyId: string, branchId: string | null | undefined) {
    const conditions = branchId
      ? and(
          eq(saasRidersTable.companyId, companyId),
          eq(saasRidersTable.branchId, branchId),
          eq(saasRidersTable.isDeleted, false),
        )
      : and(
          eq(saasRidersTable.companyId, companyId),
          eq(saasRidersTable.isDeleted, false),
        );

    return saasDb.select().from(saasRidersTable).where(conditions);
  },
};
