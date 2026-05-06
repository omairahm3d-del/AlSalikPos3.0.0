import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  index,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { branchesTable } from "./branches";
import { suppliersTable } from "./suppliers";

/**
 * Goods Received note — one per delivery from a supplier into a branch.
 * Each `purchasesTable` row is a closed receipt: saving it commits the
 * line-level stock movements (see `stock_movements`) and is not editable
 * after the fact (mirrors how `sales` are append-only).
 *
 * Cost is recorded per line; this schema does NOT update product cost
 * (per the user's "no weighted-average cost" preference) — it's purely
 * an audit + stock + VAT-on-purchases ledger.
 */
export const purchasesTable = pgTable(
  "saas_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branchesTable.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id").references(() => suppliersTable.id, {
      onDelete: "restrict",
    }),
    supplierName: text("supplier_name").notNull(),
    referenceNumber: text("reference_number"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    createdByManagerId: uuid("created_by_manager_id"),
    /**
     * Optional client-supplied idempotency key. When the client retries a
     * "Receive Stock" save (flaky network, double-click, etc.) the server
     * detects an existing purchase with the same key and returns it instead
     * of creating a duplicate header + duplicate stock movements.
     */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    branchReceivedIdx: index("saas_purchases_branch_received_idx").on(
      t.branchId,
      t.receivedAt,
    ),
    companyReceivedIdx: index("saas_purchases_company_received_idx").on(
      t.companyId,
      t.receivedAt,
    ),
    supplierIdx: index("saas_purchases_supplier_idx").on(t.supplierId),
    idempotencyIdx: uniqueIndex("saas_purchases_company_idempotency_idx").on(
      t.companyId,
      t.idempotencyKey,
    ),
  }),
);

export const purchaseItemsTable = pgTable(
  "saas_purchase_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchasesTable.id, { onDelete: "cascade" }),
    // The product is referenced by its client-side id so this works even for
    // products that haven't been pushed to the cloud yet (matches how sales
    // line items reference products).
    productClientId: text("product_client_id").notNull(),
    productName: text("product_name").notNull(),
    sku: text("sku"),
    // Stored as integer of "minor units" of the product — for now units are
    // whole-number quantities (POS doesn't sell fractional quantities).
    quantity: integer("quantity").notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    lineTotal: numeric("line_total", { precision: 14, scale: 4 }).notNull(),
  },
  (t) => ({
    purchaseIdx: index("saas_purchase_items_purchase_idx").on(t.purchaseId),
    productIdx: index("saas_purchase_items_product_idx").on(t.productClientId),
  }),
);

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;

export const insertPurchaseItemSchema = createInsertSchema(
  purchaseItemsTable,
).omit({ id: true });
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;
