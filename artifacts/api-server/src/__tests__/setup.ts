// Silence pino during tests. Must be set before any module imports the
// logger (which lazily reads LOG_LEVEL at construction time).
process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";

if (!process.env.SAAS_DATABASE_URL) {
  throw new Error(
    "SAAS_DATABASE_URL must be set to run integration tests (use the same dev DB; tests isolate by company).",
  );
}
if (!process.env.SAAS_JWT_SECRET) {
  throw new Error("SAAS_JWT_SECRET must be set to run integration tests.");
}
if (!process.env.SAAS_ADMIN_API_KEY) {
  throw new Error("SAAS_ADMIN_API_KEY must be set to run integration tests.");
}

// Defense-in-depth: refuse to run against a database whose URL hints at
// production. Tests create and delete companies; running against prod would
// cascade-delete real tenant data. The check is intentionally simple and
// false-positive-friendly — rename the test DB if it triggers spuriously.
const dbUrl = process.env.SAAS_DATABASE_URL ?? "";
if (/prod|production|live/i.test(dbUrl)) {
  throw new Error(
    "Refusing to run tests: SAAS_DATABASE_URL appears to point at a production database.",
  );
}

import { afterAll } from "vitest";
import { saasPool } from "@workspace/saas-db";

afterAll(async () => {
  // Close the shared pg pool so vitest can exit cleanly.
  await saasPool.end();
});
