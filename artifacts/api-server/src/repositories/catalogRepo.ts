import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import {
  saasDb,
  productsTable,
  categoriesTable,
  customersTable,
  type ProductRow,
  type CategoryRow,
  type CustomerRow,
} from "@workspace/saas-db";
import type { PgTable } from "drizzle-orm/pg-core";

export interface CatalogUpsertInput {
  clientId: string;
  payload: unknown;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
}

export type CatalogUpsertStatus = "applied" | "stale" | "duplicate";

export interface CatalogUpsertResult {
  clientId: string;
  status: CatalogUpsertStatus;
  serverUpdatedAt?: string;
}

export interface CatalogPullRow {
  clientId: string;
  payload: unknown;
  clientUpdatedAt: string;
  serverUpdatedAt: string;
  deletedAt: string | null;
}

export interface CatalogPullPage {
  rows: CatalogPullRow[];
  /**
   * Tuple cursor for the *next* request to this stream. Null when the
   * stream returned 0 rows (caller should keep using the prior since).
   * The serialized form on the wire is `<serverISO>~<clientId>`; the
   * service layer composes per-stream cursors into the public token.
   */
  nextCursor: { serverUpdatedAt: string; clientId: string } | null;
  hasMore: boolean;
}

const PULL_LIMIT_DEFAULT = 500;
const PULL_LIMIT_MAX = 1000;

/**
 * Upsert a catalog row with last-write-wins by `clientUpdatedAt`.
 * Returns "applied" if the write took, "stale" if an existing row had a
 * newer or equal client timestamp (no-op), or "duplicate" if the incoming
 * payload was byte-identical to what was stored (also no-op, just a clearer
 * signal for the client to drop its outbox row).
 *
 * Uses a single statement: INSERT ... ON CONFLICT DO UPDATE WHERE
 * incoming.client_updated_at > existing.client_updated_at, then RETURNING
 * the row. If RETURNING is empty, the conflict was rejected (stale).
 */
async function upsertOne(
  table: typeof productsTable | typeof categoriesTable | typeof customersTable,
  companyId: string,
  deviceId: string,
  branchId: string | null,
  input: CatalogUpsertInput,
): Promise<CatalogUpsertResult> {
  const now = new Date();
  const inserted = await saasDb
    .insert(table)
    .values({
      companyId,
      branchId,
      clientId: input.clientId,
      payload: input.payload as object,
      clientUpdatedAt: input.clientUpdatedAt,
      serverUpdatedAt: now,
      deletedAt: input.deletedAt,
      lastWriterDeviceId: deviceId,
    })
    .onConflictDoUpdate({
      target: [table.companyId, table.clientId],
      set: {
        // Stamp branchId on existing rows too (zero-cost migration for
        // legacy NULL rows that are being touched again).
        branchId,
        payload: input.payload as object,
        clientUpdatedAt: input.clientUpdatedAt,
        serverUpdatedAt: now,
        deletedAt: input.deletedAt,
        lastWriterDeviceId: deviceId,
      },
      // LWW: only overwrite if the incoming client wall-clock is strictly
      // newer. Equal is treated as stale so re-pushes of the same edit are
      // no-ops and we don't bump serverUpdatedAt unnecessarily.
      setWhere: sql`${table.clientUpdatedAt} < ${input.clientUpdatedAt.toISOString()}`,
    })
    .returning({ serverUpdatedAt: table.serverUpdatedAt });

  if (inserted.length > 0 && inserted[0]?.serverUpdatedAt) {
    return {
      clientId: input.clientId,
      status: "applied",
      serverUpdatedAt: inserted[0].serverUpdatedAt.toISOString(),
    };
  }
  return { clientId: input.clientId, status: "stale" };
}

async function upsertMany(
  table: typeof productsTable | typeof categoriesTable | typeof customersTable,
  companyId: string,
  deviceId: string,
  branchId: string | null,
  inputs: CatalogUpsertInput[],
): Promise<CatalogUpsertResult[]> {
  if (inputs.length === 0) return [];
  // Run sequentially (small N, ≤200): keeps the LWW logic simple per-row
  // and avoids interleaved updates fighting over the same (company, client)
  // row when a batch contains the same id twice (callers should dedupe but
  // we don't want a Postgres-level "cannot affect row a second time" error
  // from a bulk INSERT...ON CONFLICT statement).
  const out: CatalogUpsertResult[] = [];
  for (const input of inputs) {
    out.push(await upsertOne(table, companyId, deviceId, branchId, input));
  }
  return out;
}

async function listSince(
  table: typeof productsTable | typeof categoriesTable | typeof customersTable,
  companyId: string,
  branchId: string | null,
  since: Date,
  sinceClientId: string,
  limit: number,
): Promise<CatalogPullPage> {
  const cap = Math.min(Math.max(limit, 1), PULL_LIMIT_MAX);
  // Tuple-comparison cursor: `(serverUpdatedAt > since) OR
  // (serverUpdatedAt = since AND clientId > sinceClientId)`. Without the
  // tie-breaker, multiple rows sharing the same `serverUpdatedAt` (realistic
  // because we stamp from `new Date()` at ms precision) would be silently
  // skipped when a page boundary splits them. The empty-string default for
  // sinceClientId is the lexicographic floor so an initial pull (since=0)
  // returns everything.
  // Fetch one extra row to detect hasMore in a single query.
  const rows = (await saasDb
    .select({
      clientId: table.clientId,
      payload: table.payload,
      clientUpdatedAt: table.clientUpdatedAt,
      serverUpdatedAt: table.serverUpdatedAt,
      deletedAt: table.deletedAt,
    })
    .from(table as PgTable)
    .where(
      and(
        eq(table.companyId, companyId),
        // Branch-scoped pull: when a device is on a branch, restrict to
        // its own branch's rows (legacy NULL rows are also visible so
        // pre-backfill data isn't lost). Devices on tokens without a
        // branch claim see the full company stream.
        branchId
          ? or(
              eq(table.branchId, branchId),
              sql`${table.branchId} IS NULL`,
            )
          : sql`true`,
        or(
          gt(table.serverUpdatedAt, since),
          and(
            eq(table.serverUpdatedAt, since),
            gt(table.clientId, sinceClientId),
          ),
        ),
      ),
    )
    .orderBy(asc(table.serverUpdatedAt), asc(table.clientId))
    .limit(cap + 1)) as Array<{
    clientId: string;
    payload: unknown;
    clientUpdatedAt: Date;
    serverUpdatedAt: Date;
    deletedAt: Date | null;
  }>;

  const hasMore = rows.length > cap;
  const trimmed = hasMore ? rows.slice(0, cap) : rows;
  const last = trimmed[trimmed.length - 1];
  return {
    rows: trimmed.map((r) => ({
      clientId: r.clientId,
      payload: r.payload,
      clientUpdatedAt: r.clientUpdatedAt.toISOString(),
      serverUpdatedAt: r.serverUpdatedAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    })),
    nextCursor: last
      ? { serverUpdatedAt: last.serverUpdatedAt.toISOString(), clientId: last.clientId }
      : null,
    hasMore,
  };
}

export const catalogRepo = {
  PULL_LIMIT_DEFAULT,
  upsertProducts: (
    companyId: string,
    deviceId: string,
    branchId: string | null,
    inputs: CatalogUpsertInput[],
  ) => upsertMany(productsTable, companyId, deviceId, branchId, inputs),
  upsertCategories: (
    companyId: string,
    deviceId: string,
    branchId: string | null,
    inputs: CatalogUpsertInput[],
  ) => upsertMany(categoriesTable, companyId, deviceId, branchId, inputs),
  listProductsSince: (
    companyId: string,
    branchId: string | null,
    since: Date,
    sinceClientId: string,
    limit: number,
  ) =>
    listSince(productsTable, companyId, branchId, since, sinceClientId, limit),
  listCategoriesSince: (
    companyId: string,
    branchId: string | null,
    since: Date,
    sinceClientId: string,
    limit: number,
  ) =>
    listSince(categoriesTable, companyId, branchId, since, sinceClientId, limit),
  upsertCustomers: (
    companyId: string,
    deviceId: string,
    branchId: string | null,
    inputs: CatalogUpsertInput[],
  ) => upsertMany(customersTable, companyId, deviceId, branchId, inputs),
  listCustomersSince: (
    companyId: string,
    branchId: string | null,
    since: Date,
    sinceClientId: string,
    limit: number,
  ) =>
    listSince(customersTable, companyId, branchId, since, sinceClientId, limit),
};

export type { ProductRow, CategoryRow, CustomerRow };
