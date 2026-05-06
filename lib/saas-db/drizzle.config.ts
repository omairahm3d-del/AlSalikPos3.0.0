import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.SAAS_DATABASE_URL) {
  throw new Error(
    "SAAS_DATABASE_URL must be set for the SaaS multi-tenant database.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.SAAS_DATABASE_URL,
  },
});
