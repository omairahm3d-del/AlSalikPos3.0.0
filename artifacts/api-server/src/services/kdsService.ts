import { and, eq, ne } from "drizzle-orm";
import { saasDb, heldOrdersTable } from "@workspace/saas-db";
import { z } from "zod/v4";

export const heldOrderItemSchema = z.object({
  id: z.string(),
  heldOrderId: z.string(),
  productId: z.string(),
  productName: z.string(),
  productPrice: z.number(),
  quantity: z.number(),
  colorHex: z.string().optional().default(""),
  category: z.string().optional().default(""),
  taxRate: z.number().optional(),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().optional(),
  discountAmount: z.number().optional(),
  imageUri: z.string().optional(),
});

export const upsertHeldOrderInput = z.object({
  clientId: z.string().min(1).max(128),
  tableName: z.string().min(1).max(200),
  orderType: z.enum(["dine-in", "takeaway", "delivery"]),
  staffName: z.string().max(200).nullish(),
  customerName: z.string().max(200).nullish(),
  kdsStatus: z.enum(["new", "preparing", "ready", "bumped"]).default("new"),
  items: z.array(heldOrderItemSchema),
  clientCreatedAt: z.number(),
});
export type UpsertHeldOrderInput = z.infer<typeof upsertHeldOrderInput>;

export const kdsStatusInput = z.object({
  kdsStatus: z.enum(["new", "preparing", "ready", "bumped"]),
});

export const kdsService = {
  async upsert(
    companyId: string,
    branchId: string | null | undefined,
    deviceId: string,
    input: UpsertHeldOrderInput,
  ) {
    const values = {
      companyId,
      branchId: branchId ?? null,
      deviceId,
      clientId: input.clientId,
      tableName: input.tableName,
      orderType: input.orderType,
      staffName: input.staffName ?? null,
      customerName: input.customerName ?? null,
      kdsStatus: input.kdsStatus,
      items: input.items as unknown as object,
      clientCreatedAt: new Date(input.clientCreatedAt),
    };

    const [row] = await saasDb
      .insert(heldOrdersTable)
      .values(values)
      .onConflictDoUpdate({
        target: [heldOrdersTable.companyId, heldOrdersTable.clientId],
        set: {
          tableName: values.tableName,
          orderType: values.orderType,
          staffName: values.staffName,
          customerName: values.customerName,
          kdsStatus: values.kdsStatus,
          items: values.items,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  },

  async listActive(companyId: string, branchId: string | null | undefined) {
    const conditions = branchId
      ? and(
          eq(heldOrdersTable.companyId, companyId),
          eq(heldOrdersTable.branchId, branchId),
          ne(heldOrdersTable.kdsStatus, "bumped"),
        )
      : and(
          eq(heldOrdersTable.companyId, companyId),
          ne(heldOrdersTable.kdsStatus, "bumped"),
        );

    return saasDb
      .select()
      .from(heldOrdersTable)
      .where(conditions)
      .orderBy(heldOrdersTable.clientCreatedAt);
  },

  async updateStatus(
    companyId: string,
    clientId: string,
    kdsStatus: string,
  ) {
    const [row] = await saasDb
      .update(heldOrdersTable)
      .set({ kdsStatus, updatedAt: new Date() })
      .where(
        and(
          eq(heldOrdersTable.companyId, companyId),
          eq(heldOrdersTable.clientId, clientId),
        ),
      )
      .returning();

    return row ?? null;
  },
};
