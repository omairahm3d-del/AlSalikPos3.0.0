import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";

/**
 * Prepaid package definitions (saloon mode).
 * A package bundles N sessions at a fixed price. Customers purchase one and
 * redeem sessions against eligible services. Packages are scoped to a company
 * and optionally to a specific branch (null = company-wide).
 */
export const packagesTable = pgTable(
  "saas_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Number of sessions included in the package. */
    totalSessions: integer("total_sessions").notNull().default(1),
    /** Total package price in AED (all sessions bundled). */
    price: real("price").notNull().default(0),
    /**
     * JSON array of product client-IDs that can be redeemed with this package.
     * NULL means the package applies to every service.
     */
    applicableServiceIds: text("applicable_service_ids"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    companyIdx: index("saas_packages_company_idx").on(t.companyId),
    branchIdx: index("saas_packages_branch_idx").on(t.branchId),
  }),
);

export const insertPackageSchema = createInsertSchema(packagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;

/**
 * Customer-owned instances of a PrepaidPackage.
 * Created when a customer purchases a package at the POS.
 * `usedSessions` increments each time a session is redeemed at checkout.
 */
export const customerPackagesTable = pgTable(
  "saas_customer_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "restrict",
    }),
    packageId: uuid("package_id").references(() => packagesTable.id, {
      onDelete: "restrict",
    }),
    /** Client-side ID of the customer (matches catalog customers.clientId). */
    customerClientId: text("customer_client_id").notNull(),
    customerName: text("customer_name").notNull().default(""),
    packageName: text("package_name").notNull().default(""),
    totalSessions: integer("total_sessions").notNull().default(1),
    usedSessions: integer("used_sessions").notNull().default(0),
    /** Client-side sale ID of the purchase transaction (nullable for manual entries). */
    purchaseSaleClientId: text("purchase_sale_client_id"),
    /** Optional expiry date. NULL = never expires. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    companyIdx: index("saas_customer_packages_company_idx").on(t.companyId),
    customerIdx: index("saas_customer_packages_customer_idx").on(
      t.customerClientId,
    ),
    packageIdx: index("saas_customer_packages_package_idx").on(t.packageId),
  }),
);

export const insertCustomerPackageSchema = createInsertSchema(
  customerPackagesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomerPackage = z.infer<typeof insertCustomerPackageSchema>;
export type CustomerPackageRow = typeof customerPackagesTable.$inferSelect;
