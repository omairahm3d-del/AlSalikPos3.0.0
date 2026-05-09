import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("saas_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  /**
   * Business type / UI mode for the POS client.
   * - "standard" (default) — restaurant layout: Products, Tables, KOT, Dine-in/Takeaway/Delivery.
   * - "saloon" — beauty/saloon layout: Services, Chairs/Stations, per-line
   *   stylist assignment, Appointments tab, no physical stock on services.
   * - "laundry" — laundry/dry-cleaning layout: Services, Drop-off/Express order types,
   *   per-item laundry instructions, no tables, no KOT.
   * - "retail" — retail shop layout: Products, barcode-first selling, no tables, no KOT.
   */
  workMode: text("work_mode").notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
