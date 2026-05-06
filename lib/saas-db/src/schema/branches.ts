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

/**
 * A physical branch / outlet of a company. Each branch fully isolates its
 * own products, stock, sales, staff, and customers (devices are tied to a
 * single branch on activation; sync queries are scoped by `branchId`).
 *
 * Backward compatibility: catalog/sales/devices rows from before this table
 * existed have a NULL `branch_id`. The backfill script (see
 * `scripts/src/backfillBranches.ts`) creates one default "Main" branch per
 * company and stamps every legacy row with that branch's id.
 */
export const branchesTable = pgTable(
  "saas_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    isDefault: boolean("is_default").notNull().default(false),
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
    nameUnique: uniqueIndex("saas_branches_company_name_unique").on(
      t.companyId,
      t.name,
    ),
    companyIdx: index("saas_branches_company_idx").on(t.companyId),
  }),
);

export const insertBranchSchema = createInsertSchema(branchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type Branch = typeof branchesTable.$inferSelect;
