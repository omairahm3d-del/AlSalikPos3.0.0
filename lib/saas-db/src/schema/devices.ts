import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { licensesTable } from "./licenses";
import { branchesTable } from "./branches";

export const devicesTable = pgTable(
  "saas_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licensesTable.id, { onDelete: "cascade" }),
    /**
     * Branch this device is bound to. Null only for legacy rows from before
     * branches existed (the backfill stamps a default branch); after
     * activation a device is tied to one branch and cannot move without
     * re-activation.
     */
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "restrict",
    }),
    deviceUid: text("device_uid").notNull(),
    name: text("name"),
    platform: text("platform").notNull().default("unknown"),
    appVersion: text("app_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    licenseDeviceUnique: uniqueIndex("saas_devices_license_uid_unique").on(
      table.licenseId,
      table.deviceUid,
    ),
    companyIdx: index("saas_devices_company_idx").on(table.companyId),
  }),
);

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
