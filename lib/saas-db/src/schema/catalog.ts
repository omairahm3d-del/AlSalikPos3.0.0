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
import { devicesTable } from "./devices";

/**
 * Cloud-side mirror of POS catalog (products + categories + customers).
 *
 * NOTE: customers ride the same `/api/sync/catalog/*` endpoints as a third
 * stream — the wire path is named "catalog" for historical reasons (it
 * launched with just products + categories) but the sync semantics are
 * identical so we reuse the same table shape, repo, and engine machinery
 * rather than spinning up a parallel `/api/sync/customers/*` endpoint.
 *
 * Sync model:
 * - Each row keyed by `(companyId, clientId)` where `clientId` is the local
 *   POS uuid. UNIQUE so push retries are no-ops.
 * - `clientUpdatedAt` is the wall-clock from the device that last wrote;
 *   used for last-write-wins conflict resolution at push time.
 * - `serverUpdatedAt` is the cloud's notion of "when did this row change";
 *   bumped on every accepted write. Devices use it as their pull cursor.
 * - `deletedAt` is a tombstone — kept (not removed) so other devices can
 *   pull the delete on their next tick. We never hard-delete catalog rows.
 * - `payload` holds the full client entity verbatim so the local schema can
 *   evolve without forcing a server migration.
 */

export const productsTable = pgTable(
  "saas_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    payload: jsonb("payload").notNull(),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
    serverUpdatedAt: timestamp("server_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lastWriterDeviceId: uuid("last_writer_device_id").references(
      () => devicesTable.id,
      { onDelete: "set null" },
    ),
  },
  (t) => ({
    clientUnique: uniqueIndex("saas_products_company_client_unique").on(
      t.companyId,
      t.clientId,
    ),
    cursorIdx: index("saas_products_company_server_updated_idx").on(
      t.companyId,
      t.serverUpdatedAt,
    ),
  }),
);

export const categoriesTable = pgTable(
  "saas_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    payload: jsonb("payload").notNull(),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
    serverUpdatedAt: timestamp("server_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lastWriterDeviceId: uuid("last_writer_device_id").references(
      () => devicesTable.id,
      { onDelete: "set null" },
    ),
  },
  (t) => ({
    clientUnique: uniqueIndex("saas_categories_company_client_unique").on(
      t.companyId,
      t.clientId,
    ),
    cursorIdx: index("saas_categories_company_server_updated_idx").on(
      t.companyId,
      t.serverUpdatedAt,
    ),
  }),
);

export const customersTable = pgTable(
  "saas_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    payload: jsonb("payload").notNull(),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
    serverUpdatedAt: timestamp("server_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lastWriterDeviceId: uuid("last_writer_device_id").references(
      () => devicesTable.id,
      { onDelete: "set null" },
    ),
  },
  (t) => ({
    clientUnique: uniqueIndex("saas_customers_company_client_unique").on(
      t.companyId,
      t.clientId,
    ),
    cursorIdx: index("saas_customers_company_server_updated_idx").on(
      t.companyId,
      t.serverUpdatedAt,
    ),
  }),
);

export type ProductRow = typeof productsTable.$inferSelect;
export type CategoryRow = typeof categoriesTable.$inferSelect;
export type CustomerRow = typeof customersTable.$inferSelect;
