import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";

/**
 * Single source of truth for stock-on-hand: every change to a product's
 * stock at a branch is one row here. Current stock = SUM(delta) per
 * (companyId, branchId, productClientId).
 *
 * Movement kinds:
 *   - "purchase"   — created when a Goods Received note is saved (delta > 0)
 *   - "sale"       — created server-side when a sale is pushed (delta < 0,
 *                    or > 0 if isRefund); idempotent via the unique key.
 *   - "adjustment" — manager-/staff-driven manual change (any sign)
 *
 * Idempotency: `(companyId, kind, refId, productClientId)` is unique. So
 * re-pushing the same sale or saving the same purchase twice cannot double
 * the stock impact. `refId` for adjustments is the adjustment's own uuid.
 */
export const stockMovementsTable = pgTable(
  "saas_stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branchesTable.id, { onDelete: "restrict" }),
    productClientId: text("product_client_id").notNull(),
    productName: text("product_name").notNull(),
    sku: text("sku"),
    delta: numeric("delta", { precision: 14, scale: 4 }).notNull(),
    kind: text("kind").notNull(), // 'purchase' | 'sale' | 'adjustment'
    refId: text("ref_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    refUnique: uniqueIndex(
      "saas_stock_movements_company_kind_ref_product_unique",
    ).on(t.companyId, t.kind, t.refId, t.productClientId),
    branchProductIdx: index("saas_stock_movements_branch_product_idx").on(
      t.branchId,
      t.productClientId,
    ),
    companyCreatedIdx: index("saas_stock_movements_company_created_idx").on(
      t.companyId,
      t.createdAt,
    ),
  }),
);

export const insertStockMovementSchema = createInsertSchema(
  stockMovementsTable,
).omit({ id: true, createdAt: true });
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
