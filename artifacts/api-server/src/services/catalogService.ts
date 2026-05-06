import { z } from "zod/v4";
import { catalogRepo, type CatalogUpsertResult } from "../repositories/catalogRepo";
import { badRequest } from "../lib/errors";

// Wall-clock ms epochs from the client. Same windowing rules as sales sync —
// reject obvious garbage so the catalog can't be poisoned with year-1970 or
// year-3000 timestamps that would skew LWW forever.
const MIN_EPOCH_MS = Date.parse("2020-01-01T00:00:00Z");
const clientUpdatedAtMs = z
  .number()
  .int()
  .refine((n) => n >= MIN_EPOCH_MS, "updatedAt is too far in the past")
  .refine(
    (n) => n <= Date.now() + 24 * 60 * 60 * 1000,
    "updatedAt is in the future",
  );

const catalogEntrySchema = z.object({
  // The local POS uuid. Bounded so a malicious client can't bloat the
  // unique index with megabyte-sized "client ids".
  id: z.string().min(1).max(128),
  // Full entity, stored verbatim. Capped to ~64 KB after JSON round-trip
  // by Express body limits; we don't re-validate the shape because the
  // POS owns the local schema.
  payload: z.unknown(),
  updatedAt: clientUpdatedAtMs,
  // Tombstone marker. When true, payload is still required (so other
  // devices that haven't yet seen the original can render the deleted
  // entity briefly if they need to, e.g. for receipt history).
  deleted: z.boolean().optional(),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const pushCatalogInputSchema = z
  .object({
    products: z.array(catalogEntrySchema).max(200).optional(),
    categories: z.array(catalogEntrySchema).max(200).optional(),
  })
  .refine(
    (v) => (v.products?.length ?? 0) + (v.categories?.length ?? 0) > 0,
    "at least one of products or categories must be non-empty",
  );

// `since` is an opaque cursor from a previous pull's `cursor`. The current
// format is `"<productServerISO>~<productClientId>|<categoryServerISO>~<categoryClientId>"`.
// Per-stream so pagination cannot outrun an unfinished stream, with a
// (serverUpdatedAt, clientId) tuple inside each stream so rows sharing a
// timestamp aren't skipped when a page boundary splits them.
//
// Backwards-compatible inputs:
//   - missing / "" / "0" / 0       → both streams default to epoch 0, no clientId floor
//   - bare ISO or ms epoch         → applied to BOTH streams as serverUpdatedAt with no clientId floor (legacy single cursor)
//   - "<pISO>|<cISO>"              → legacy per-stream timestamp-only cursor; no clientId floor
//   - "<pISO>~<pId>|<cISO>~<cId>"  → current tuple form
//
// Cursors are URL-encoded by the client when sent as a query string. We
// don't restrict clientId charset on push, so an old client could in
// principle have a clientId containing `~` or `|`. We bound to the first
// `~` per stream to avoid that being a problem.
interface StreamSince {
  since: Date;
  sinceClientId: string;
}

function parseSinceToken(v: string | number | undefined | null): {
  product: StreamSince;
  category: StreamSince;
} {
  const empty: StreamSince = { since: new Date(0), sinceClientId: "" };
  if (v === undefined || v === null || v === "" || v === "0" || v === 0) {
    return { product: empty, category: empty };
  }
  const parseStream = (s: string): StreamSince => {
    if (s === "" || s === "0") return empty;
    // Split on FIRST `~` only — clientId may itself contain `~` (we don't
    // sanitize push). The serverUpdatedAt half is always a well-formed ISO,
    // never contains `~`, so the first occurrence is unambiguous.
    const tildeIdx = s.indexOf("~");
    const tsPart = tildeIdx >= 0 ? s.slice(0, tildeIdx) : s;
    const idPart = tildeIdx >= 0 ? s.slice(tildeIdx + 1) : "";
    const iso = new Date(tsPart);
    if (!Number.isNaN(iso.getTime())) {
      return { since: iso, sinceClientId: idPart };
    }
    const n = Number(tsPart);
    if (Number.isFinite(n)) return { since: new Date(n), sinceClientId: idPart };
    throw badRequest(
      "invalid_since",
      "since must be ISO-8601, ms epoch, or '<pISO>~<pId>|<cISO>~<cId>'",
    );
  };
  if (typeof v === "number") {
    const d = new Date(v);
    return {
      product: { since: d, sinceClientId: "" },
      category: { since: d, sinceClientId: "" },
    };
  }
  if (v.includes("|")) {
    const [p, c] = v.split("|", 2);
    return { product: parseStream(p), category: parseStream(c) };
  }
  const s = parseStream(v);
  return { product: s, category: s };
}

export const pullCatalogQuerySchema = z.object({
  since: z
    .union([z.string(), z.number()])
    .optional()
    .transform(parseSinceToken),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v): number => {
      if (v === undefined) return catalogRepo.PULL_LIMIT_DEFAULT;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) return catalogRepo.PULL_LIMIT_DEFAULT;
      return Math.floor(n);
    }),
});

function dedupe(entries: CatalogEntry[]): CatalogEntry[] {
  // If the same id appears twice in one batch, keep the one with the latest
  // updatedAt. Avoids the Postgres "cannot affect row a second time" error
  // and guarantees deterministic ordering.
  const map = new Map<string, CatalogEntry>();
  for (const e of entries) {
    const existing = map.get(e.id);
    if (!existing || e.updatedAt > existing.updatedAt) {
      map.set(e.id, e);
    }
  }
  return Array.from(map.values());
}

export interface PushCatalogContext {
  companyId: string;
  deviceId: string;
}

export interface PushCatalogResult {
  products: CatalogUpsertResult[];
  categories: CatalogUpsertResult[];
}

function toUpsertInputs(entries: CatalogEntry[]) {
  return entries.map((e) => ({
    clientId: e.id,
    payload: e.payload,
    clientUpdatedAt: new Date(e.updatedAt),
    deletedAt: e.deleted ? new Date(e.updatedAt) : null,
  }));
}

export const catalogService = {
  async push(
    input: z.infer<typeof pushCatalogInputSchema>,
    ctx: PushCatalogContext,
  ): Promise<PushCatalogResult> {
    const products = dedupe(input.products ?? []);
    const categories = dedupe(input.categories ?? []);
    const [productResults, categoryResults] = await Promise.all([
      catalogRepo.upsertProducts(
        ctx.companyId,
        ctx.deviceId,
        toUpsertInputs(products),
      ),
      catalogRepo.upsertCategories(
        ctx.companyId,
        ctx.deviceId,
        toUpsertInputs(categories),
      ),
    ]);
    return { products: productResults, categories: categoryResults };
  },

  async pull(
    query: z.infer<typeof pullCatalogQuerySchema>,
    ctx: { companyId: string },
  ) {
    const { product: pSince, category: cSince } = query.since;
    const [productsPage, categoriesPage] = await Promise.all([
      catalogRepo.listProductsSince(
        ctx.companyId,
        pSince.since,
        pSince.sinceClientId,
        query.limit,
      ),
      catalogRepo.listCategoriesSince(
        ctx.companyId,
        cSince.since,
        cSince.sinceClientId,
        query.limit,
      ),
    ]);
    // Per-stream tuple cursor: each stream advances independently as
    // (serverUpdatedAt, clientId). If a stream returned no rows, its
    // cursor echoes the requested since so the next pull asks for the
    // same window again (cheap empty round-trip, safe convergence).
    const encodeStream = (page: typeof productsPage, fallback: StreamSince) => {
      if (page.nextCursor) {
        return `${page.nextCursor.serverUpdatedAt}~${page.nextCursor.clientId}`;
      }
      return `${fallback.since.toISOString()}~${fallback.sinceClientId}`;
    };
    return {
      products: productsPage.rows,
      categories: categoriesPage.rows,
      cursor: `${encodeStream(productsPage, pSince)}|${encodeStream(
        categoriesPage,
        cSince,
      )}`,
      hasMore: productsPage.hasMore || categoriesPage.hasMore,
    };
  },
};
