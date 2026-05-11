import { and, desc, eq } from "drizzle-orm";
import { saasDb, laundryOrdersTable } from "@workspace/saas-db";
import { z } from "zod/v4";

const laundryItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string(),
  productName: z.string(),
  productPrice: z.number(),
  quantity: z.number(),
  lineTotal: z.number(),
  notes: z.string().nullable().nullish(),
});

export const upsertLaundryOrderInput = z.object({
  clientId: z.string().min(1).max(128),
  ticketNumber: z.string().min(1).max(30),
  customerId: z.string().nullish(),
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().max(50).nullish(),
  orderType: z.enum(["drop-off", "express"]),
  status: z.enum(["received", "ready", "collected"]).default("received"),
  promisedAt: z.number(),
  notes: z.string().nullish(),
  subtotal: z.number(),
  vatAmount: z.number(),
  total: z.number(),
  saleId: z.string().nullish(),
  paidAt: z.number().nullish(),
  paymentMethod: z.string().nullish(),
  staffId: z.string().nullish(),
  staffName: z.string().nullish(),
  riderId: z.string().nullish(),
  riderName: z.string().nullish(),
  items: z.array(laundryItemSchema),
  clientCreatedAt: z.number(),
});
export type UpsertLaundryOrderInput = z.infer<typeof upsertLaundryOrderInput>;

export const updateLaundryStatusInput = z.object({
  status: z.enum(["received", "ready", "collected"]),
  saleId: z.string().nullish(),
  paidAt: z.number().nullish(),
  paymentMethod: z.string().nullish(),
});
export type UpdateLaundryStatusInput = z.infer<typeof updateLaundryStatusInput>;

export const laundryService = {
  async upsert(
    companyId: string,
    branchId: string | null | undefined,
    deviceId: string,
    input: UpsertLaundryOrderInput,
  ) {
    const values = {
      companyId,
      branchId: branchId ?? null,
      deviceId,
      clientId: input.clientId,
      ticketNumber: input.ticketNumber,
      customerId: input.customerId ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      orderType: input.orderType,
      status: input.status,
      promisedAt: input.promisedAt,
      notes: input.notes ?? null,
      subtotal: String(input.subtotal),
      vatAmount: String(input.vatAmount),
      total: String(input.total),
      saleId: input.saleId ?? null,
      paidAt: input.paidAt ?? null,
      paymentMethod: input.paymentMethod ?? null,
      staffId: input.staffId ?? null,
      staffName: input.staffName ?? null,
      riderId: input.riderId ?? null,
      riderName: input.riderName ?? null,
      items: input.items as unknown as object,
      clientCreatedAt: input.clientCreatedAt,
    };

    const [row] = await saasDb
      .insert(laundryOrdersTable)
      .values(values)
      .onConflictDoUpdate({
        target: [laundryOrdersTable.companyId, laundryOrdersTable.clientId],
        set: {
          ticketNumber: values.ticketNumber,
          customerId: values.customerId,
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          orderType: values.orderType,
          status: values.status,
          promisedAt: values.promisedAt,
          notes: values.notes,
          subtotal: values.subtotal,
          vatAmount: values.vatAmount,
          total: values.total,
          saleId: values.saleId,
          paidAt: values.paidAt,
          paymentMethod: values.paymentMethod,
          staffId: values.staffId,
          staffName: values.staffName,
          riderId: values.riderId,
          riderName: values.riderName,
          items: values.items,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  },

  async updateStatus(
    companyId: string,
    clientId: string,
    input: UpdateLaundryStatusInput,
  ) {
    const set: Record<string, unknown> = {
      status: input.status,
      updatedAt: new Date(),
    };
    if (input.saleId !== undefined) set.saleId = input.saleId ?? null;
    if (input.paidAt !== undefined) set.paidAt = input.paidAt ?? null;
    if (input.paymentMethod !== undefined)
      set.paymentMethod = input.paymentMethod ?? null;

    const [row] = await saasDb
      .update(laundryOrdersTable)
      .set(set)
      .where(
        and(
          eq(laundryOrdersTable.companyId, companyId),
          eq(laundryOrdersTable.clientId, clientId),
        ),
      )
      .returning();

    return row ?? null;
  },

  async list(companyId: string, branchId: string | null | undefined) {
    const conditions = branchId
      ? and(
          eq(laundryOrdersTable.companyId, companyId),
          eq(laundryOrdersTable.branchId, branchId),
        )
      : eq(laundryOrdersTable.companyId, companyId);

    return saasDb
      .select()
      .from(laundryOrdersTable)
      .where(conditions)
      .orderBy(desc(laundryOrdersTable.clientCreatedAt))
      .limit(500);
  },
};
