import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  numeric,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";
import { devicesTable } from "./devices";

/**
 * Cloud-side mirror of laundry tickets created on any POS device.
 *
 * - Idempotent: (companyId, clientId) is unique. Re-pushes are upserts.
 * - items is a jsonb snapshot of LaundryOrderItem[] replaced wholesale on
 *   each upsert.
 * - All devices in a branch poll this table on the Laundry tab so the
 *   cashier's computer and the driver's tablet always see the same tickets.
 */
export const laundryOrdersTable = pgTable(
  "saas_laundry_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "restrict",
    }),
    deviceId: uuid("device_id").references(() => devicesTable.id, {
      onDelete: "set null",
    }),
    clientId: text("client_id").notNull(),
    ticketNumber: text("ticket_number").notNull(),
    customerId: text("customer_id"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    orderType: text("order_type").notNull().default("drop-off"),
    status: text("status").notNull().default("received"),
    promisedAt: bigint("promised_at", { mode: "number" }).notNull(),
    notes: text("notes"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    saleId: text("sale_id"),
    paidAt: bigint("paid_at", { mode: "number" }),
    paymentMethod: text("payment_method"),
    staffId: text("staff_id"),
    staffName: text("staff_name"),
    items: jsonb("items").notNull().default([]),
    clientCreatedAt: bigint("client_created_at", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientUnique: uniqueIndex("saas_laundry_orders_company_client_unique").on(
      t.companyId,
      t.clientId,
    ),
    branchStatusIdx: index("saas_laundry_orders_branch_status_idx").on(
      t.branchId,
      t.status,
    ),
    companyStatusIdx: index("saas_laundry_orders_company_status_idx").on(
      t.companyId,
      t.status,
    ),
  }),
);

export type LaundryOrderRow = typeof laundryOrdersTable.$inferSelect;
