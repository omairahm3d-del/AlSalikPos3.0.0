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

/**
 * Back-office managers. A manager logs into the Back Office app with their
 * email + password and a company slug, then picks a branch to operate on.
 *
 * Scope is currently company-wide: a manager can switch between any active
 * branch of their company. Branch-restricted scopes can be added later by
 * extending this table with a `branchIds jsonb` column.
 *
 * Passwords are stored as `scrypt$N$r$p$saltB64$hashB64` strings (see
 * `utils/password.ts`).
 */
export const managersTable = pgTable(
  "saas_managers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("manager"),
    isActive: text("is_active").notNull().default("true"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    emailUnique: uniqueIndex("saas_managers_company_email_unique").on(
      t.companyId,
      t.email,
    ),
    companyIdx: index("saas_managers_company_idx").on(t.companyId),
  }),
);

export const insertManagerSchema = createInsertSchema(managersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});
export type InsertManager = z.infer<typeof insertManagerSchema>;
export type Manager = typeof managersTable.$inferSelect;
