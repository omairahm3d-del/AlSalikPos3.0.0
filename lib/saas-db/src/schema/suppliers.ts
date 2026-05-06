import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";

/**
 * Supplier directory. Suppliers are owned by a company and optionally scoped
 * to one branch (nullable `branchId` => company-wide / shared across branches,
 * which mirrors how legacy catalog rows are treated).
 *
 * Names are unique within (company, branch) — a company-wide supplier and a
 * branch-scoped supplier may share a name.
 */
export const suppliersTable = pgTable(
  "saas_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
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
    nameUnique: uniqueIndex("saas_suppliers_company_branch_name_unique").on(
      t.companyId,
      t.branchId,
      t.name,
    ),
    companyIdx: index("saas_suppliers_company_idx").on(t.companyId),
    branchIdx: index("saas_suppliers_branch_idx").on(t.branchId),
  }),
);

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;
