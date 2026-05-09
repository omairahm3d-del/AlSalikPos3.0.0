import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";
import { devicesTable } from "./devices";

/**
 * Cloud-side mirror of active held orders (open kitchen tickets) pushed from
 * POS devices.
 *
 * - Idempotent: (companyId, clientId) is unique. Re-pushes are upserts.
 * - kdsStatus transitions: new → preparing → ready → bumped.
 *   Bumped rows are kept for audit; queries filter them out for the live KDS.
 * - items is a jsonb snapshot of HeldOrderItem[] at the time of the last push.
 *   It is replaced wholesale on each upsert so the kitchen always sees the
 *   latest item list (e.g. after the cashier modifies and re-holds an order).
 */
export const heldOrdersTable = pgTable(
  "saas_held_orders",
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
    tableName: text("table_name").notNull(),
    orderType: text("order_type").notNull(),
    staffName: text("staff_name"),
    customerName: text("customer_name"),
    kdsStatus: text("kds_status").notNull().default("new"),
    items: jsonb("items").notNull().default([]),
    clientCreatedAt: timestamp("client_created_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    clientUnique: uniqueIndex("saas_held_orders_company_client_unique").on(
      t.companyId,
      t.clientId,
    ),
    branchStatusIdx: index("saas_held_orders_branch_status_idx").on(
      t.branchId,
      t.kdsStatus,
    ),
    companyStatusIdx: index("saas_held_orders_company_status_idx").on(
      t.companyId,
      t.kdsStatus,
    ),
  }),
);

export type HeldOrderRow = typeof heldOrdersTable.$inferSelect;
