import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const licensesTable = pgTable(
  "saas_licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    maxDevices: integer("max_devices").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    /**
     * "online" — device must reach the cloud for activation AND keeps a
     * push/pull sync channel open while running.
     * "offline" — device activates online once to fetch the JWT and license
     * window, then runs against local storage only. The POS refuses to
     * sync sales/catalog under an offline license; expiry is enforced
     * locally from the persisted `expiresAt`.
     */
    licenseType: text("license_type").notNull().default("online"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    companyIdx: index("saas_licenses_company_idx").on(table.companyId),
  }),
);

export const insertLicenseSchema = createInsertSchema(licensesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type License = typeof licensesTable.$inferSelect;
