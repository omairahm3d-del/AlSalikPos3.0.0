import { eq } from "drizzle-orm";
import { saasDb, companiesTable, type Company, type InsertCompany } from "@workspace/saas-db";

export const companyRepo = {
  async create(data: InsertCompany): Promise<Company> {
    const [row] = await saasDb.insert(companiesTable).values(data).returning();
    if (!row) throw new Error("Failed to insert company");
    return row;
  },

  async findById(id: string): Promise<Company | undefined> {
    return saasDb.query.companiesTable.findFirst({
      where: eq(companiesTable.id, id),
    });
  },

  async findBySlug(slug: string): Promise<Company | undefined> {
    return saasDb.query.companiesTable.findFirst({
      where: eq(companiesTable.slug, slug),
    });
  },

  async list(): Promise<Company[]> {
    return saasDb.select().from(companiesTable);
  },

  async update(
    id: string,
    data: Partial<Pick<Company, "workMode">>,
  ): Promise<Company | undefined> {
    const [row] = await saasDb
      .update(companiesTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companiesTable.id, id))
      .returning();
    return row;
  },
};
