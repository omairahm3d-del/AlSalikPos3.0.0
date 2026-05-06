import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { devicesTable } from "./devices";

/**
 * Cloud-side mirror of POS sales pushed from devices.
 *
 * - Append-only: a sale is the closed-out receipt; refunds are separate rows
 *   (`isRefund=true`, `originalClientSaleId` set).
 * - Idempotent: `(companyId, clientSaleId)` is unique. Re-pushes from the same
 *   device (offline retry, sync rescue) become no-ops.
 * - Denormalized payload: the full client-side `Sale` (incl. items + splits)
 *   lives in `payload` so we can evolve the local schema without forcing a
 *   server migration on every change. Top-level columns are extracted only
 *   for indexing / quick reporting.
 */
export const salesTable = pgTable(
  "saas_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devicesTable.id, { onDelete: "restrict" }),
    clientSaleId: text("client_sale_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    createdAtClient: timestamp("created_at_client", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    total: numeric("total", { precision: 14, scale: 4 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 4 }).notNull(),
    paymentMethod: text("payment_method").notNull(),
    isRefund: boolean("is_refund").notNull().default(false),
    originalClientSaleId: text("original_client_sale_id"),
    staffId: text("staff_id"),
    customerId: text("customer_id"),
    payload: jsonb("payload").notNull(),
  },
  (table) => ({
    clientUnique: uniqueIndex("saas_sales_company_client_unique").on(
      table.companyId,
      table.clientSaleId,
    ),
    companyCreatedIdx: index("saas_sales_company_created_idx").on(
      table.companyId,
      table.createdAtClient,
    ),
    deviceIdx: index("saas_sales_device_idx").on(table.deviceId),
  }),
);

export const insertSaleSchema = createInsertSchema(salesTable).omit({
  id: true,
  receivedAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type SalesRow = typeof salesTable.$inferSelect;
