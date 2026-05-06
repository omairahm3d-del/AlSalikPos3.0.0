import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.SAAS_DATABASE_URL) {
  throw new Error(
    "SAAS_DATABASE_URL must be set. Provide your separate cloud Postgres connection string.",
  );
}

export const saasPool = new Pool({
  connectionString: process.env.SAAS_DATABASE_URL,
});
export const saasDb = drizzle(saasPool, { schema });

export * from "./schema";
