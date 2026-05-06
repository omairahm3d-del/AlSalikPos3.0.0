/**
 * One-shot backfill: ensure every company has a default "Main" branch and
 * stamp legacy catalog/sales/devices rows (branch_id IS NULL) with that
 * branch's id. Safe to re-run — only touches NULL branch_ids.
 *
 * Run with: pnpm --filter @workspace/scripts run backfill:branches
 */
import { sql } from "drizzle-orm";
import {
  saasDb,
  companiesTable,
  branchesTable,
  productsTable,
  categoriesTable,
  customersTable,
  salesTable,
  devicesTable,
} from "@workspace/saas-db";

async function main() {
  const companies = await saasDb.select().from(companiesTable);
  console.log(`Found ${companies.length} companies`);

  for (const company of companies) {
    const existing = await saasDb
      .select()
      .from(branchesTable)
      .where(sql`${branchesTable.companyId} = ${company.id}`);

    let defaultBranch = existing.find((b) => b.isDefault) ?? existing[0];
    if (!defaultBranch) {
      const [created] = await saasDb
        .insert(branchesTable)
        .values({
          companyId: company.id,
          name: "Main",
          address: null,
          isDefault: true,
          isActive: true,
        })
        .returning();
      defaultBranch = created;
      console.log(`  ${company.slug}: created default branch ${created?.id}`);
    } else if (!defaultBranch.isDefault) {
      await saasDb
        .update(branchesTable)
        .set({ isDefault: true })
        .where(sql`${branchesTable.id} = ${defaultBranch.id}`);
    }

    if (!defaultBranch) continue;
    const branchId = defaultBranch.id;

    // Stamp NULL branch_id rows on every per-tenant table.
    const stamp = async (tableName: string, table: any) => {
      const result = await saasDb
        .update(table)
        .set({ branchId })
        .where(
          sql`${table.companyId} = ${company.id} AND ${table.branchId} IS NULL`,
        );
      console.log(
        `  ${company.slug}.${tableName}: backfilled (rowCount may be in pg internals)`,
      );
      return result;
    };
    await stamp("products", productsTable);
    await stamp("categories", categoriesTable);
    await stamp("customers", customersTable);
    await stamp("sales", salesTable);
    await stamp("devices", devicesTable);
  }

  console.log("Backfill complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
