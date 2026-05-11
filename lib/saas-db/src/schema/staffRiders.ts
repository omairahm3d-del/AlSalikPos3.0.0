import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";

/**
 * Cloud-side mirror of staff members, synced from any device in the company.
 *
 * - Idempotent: (companyId, clientId) is unique.
 * - Scoped to the company (not per-branch) so drivers and cashiers are
 *   visible across all branches.
 */
export const saasStaffTable = pgTable(
  "saas_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("cashier"),
    pin: text("pin").notNull(),
    active: boolean("active").notNull().default(true),
    isDeleted: boolean("is_deleted").notNull().default(false),
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
    clientUnique: uniqueIndex("saas_staff_company_client_unique").on(
      t.companyId,
      t.clientId,
    ),
    companyActiveIdx: index("saas_staff_company_active_idx").on(
      t.companyId,
      t.active,
    ),
  }),
);

/**
 * Cloud-side mirror of delivery riders/drivers, synced from any device.
 */
export const saasRidersTable = pgTable(
  "saas_riders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "restrict",
    }),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    vehicleInfo: text("vehicle_info").notNull().default(""),
    active: boolean("active").notNull().default(true),
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    isDeleted: boolean("is_deleted").notNull().default(false),
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
    clientUnique: uniqueIndex("saas_riders_company_client_unique").on(
      t.companyId,
      t.clientId,
    ),
    companyActiveIdx: index("saas_riders_company_active_idx").on(
      t.companyId,
      t.active,
    ),
  }),
);

export type SaasStaffRow = typeof saasStaffTable.$inferSelect;
export type SaasRiderRow = typeof saasRidersTable.$inferSelect;
