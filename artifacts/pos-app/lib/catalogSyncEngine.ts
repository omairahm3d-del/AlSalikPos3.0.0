import type {
  CatalogApplyInput,
  CatalogOutboxItem,
  CatalogResultUpdate,
  DatabaseContextValue,
} from "@/context/DatabaseCore";
import { authedFetch } from "@/lib/saasApi";
import { getCatalogCursor, setCatalogCursor } from "@/lib/saasStorage";

const PUSH_BATCH = 100;
const PULL_LIMIT = 500;

function backoffMs(attemptCount: number): number {
  const seconds = Math.min(300, Math.pow(2, attemptCount) * 5);
  return seconds * 1000;
}

interface PushResponseRow {
  clientId: string;
  status: "applied" | "stale" | "duplicate";
  serverUpdatedAt?: string;
}
interface PushResponse {
  products: PushResponseRow[];
  categories: PushResponseRow[];
}

interface PullResponseRow {
  clientId: string;
  payload: unknown;
  clientUpdatedAt: string;
  serverUpdatedAt: string;
  deletedAt: string | null;
}
interface PullResponse {
  products: PullResponseRow[];
  categories: PullResponseRow[];
  cursor: string;
  hasMore: boolean;
}

export interface CatalogSyncResult {
  /** Items the engine attempted to push or apply this run. */
  attempted: number;
  /** Items confirmed in the cloud or applied locally. */
  succeeded: number;
  /** True if there is more pending push work after this run. */
  hasMore: boolean;
  /**
   * True iff there was push work past its backoff window OR a pull cycle
   * actually returned more rows. Drives the active vs idle cadence.
   */
  hadReadyItems: boolean;
  /** JWT rejected — caller should refresh the license. */
  unauthorized: boolean;
  error?: string;
}

/**
 * Run one push+pull cycle for the catalog. Push first so our local edits
 * race ahead of any remote drift; then pull so we converge with whatever
 * else other devices have written.
 */
export async function catalogSyncOnce(
  db: DatabaseContextValue,
  token: string,
): Promise<CatalogSyncResult> {
  let attempted = 0;
  let succeeded = 0;
  let hadReadyItems = false;
  let lastError: string | undefined;

  // ---- Push ----
  const batch = await db.loadCatalogBatch(PUSH_BATCH);
  const now = Date.now();
  const ready = batch.filter((item) => {
    if (item.lastAttemptAt === null) return true;
    return now - item.lastAttemptAt >= backoffMs(item.attemptCount);
  });

  if (ready.length > 0) {
    hadReadyItems = true;
    attempted += ready.length;
    const products = ready
      .filter((r) => r.entityType === "product")
      .map(toPushEntry);
    const categories = ready
      .filter((r) => r.entityType === "category")
      .map(toPushEntry);

    const updates: CatalogResultUpdate[] = [];
    let pushUnauthorized = false;

    let res: Response;
    try {
      res = await authedFetch("/api/sync/catalog/push", token, {
        method: "POST",
        body: JSON.stringify({ products, categories }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network unreachable";
      for (const r of ready) updates.push({ outboxId: r.outboxId, attemptedUpdatedAt: r.updatedAt, ok: false, error: msg });
      await db.markCatalogResults(updates);
      return {
        attempted,
        succeeded,
        hasMore: (await db.countPendingCatalog()) > 0,
        hadReadyItems,
        unauthorized: false,
        error: msg,
      };
    }

    if (res.status === 401 || res.status === 403) {
      // Don't bump attempts — the token is the problem, not the data.
      return {
        attempted,
        succeeded,
        hasMore: (await db.countPendingCatalog()) > 0,
        hadReadyItems,
        unauthorized: true,
        error: `auth ${res.status}`,
      };
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        msg = body?.error?.message ?? msg;
      } catch { /* ignore */ }
      for (const r of ready) updates.push({ outboxId: r.outboxId, attemptedUpdatedAt: r.updatedAt, ok: false, error: msg });
      await db.markCatalogResults(updates);
      lastError = msg;
    } else {
      const json = (await res.json()) as PushResponse;
      const verdict = new Map<string, PushResponseRow>();
      for (const r of json.products) verdict.set(`product:${r.clientId}`, r);
      for (const r of json.categories) verdict.set(`category:${r.clientId}`, r);
      for (const r of ready) {
        const v = verdict.get(`${r.entityType}:${r.entityId}`);
        if (v) {
          // applied = our write took. stale = our payload wasn't newer
          // than what's already in cloud, but the row is there. Both mean
          // "the cloud is up to date for this entity from our POV", so we
          // can drop the outbox row in either case — but only if the user
          // hasn't edited it again in the meantime (markCatalogResults
          // checks attemptedUpdatedAt vs current row's updated_at).
          updates.push({ outboxId: r.outboxId, attemptedUpdatedAt: r.updatedAt, ok: true });
          succeeded++;
        } else {
          updates.push({ outboxId: r.outboxId, attemptedUpdatedAt: r.updatedAt, ok: false, error: "no verdict from server" });
        }
      }
      await db.markCatalogResults(updates);
    }
    if (pushUnauthorized) {
      return {
        attempted, succeeded,
        hasMore: (await db.countPendingCatalog()) > 0,
        hadReadyItems, unauthorized: true,
      };
    }
  }

  // ---- Pull ----
  // Always attempt a pull; cheap when the cursor is current (server returns
  // empty arrays). Stop after one page per tick to keep memory bounded —
  // hasMore signals the loop to come back sooner.
  const cursor = (await getCatalogCursor()) ?? "0";
  let pull: PullResponse | null = null;
  try {
    const url = `/api/sync/catalog/pull?since=${encodeURIComponent(cursor)}&limit=${PULL_LIMIT}`;
    const pullRes = await authedFetch(url, token, { method: "GET" });
    if (pullRes.status === 401 || pullRes.status === 403) {
      return {
        attempted, succeeded,
        hasMore: (await db.countPendingCatalog()) > 0,
        hadReadyItems, unauthorized: true,
        error: `auth ${pullRes.status}`,
      };
    }
    if (pullRes.ok) {
      pull = (await pullRes.json()) as PullResponse;
    } else {
      let msg = `HTTP ${pullRes.status}`;
      try {
        const body = await pullRes.json();
        msg = body?.error?.message ?? msg;
      } catch { /* ignore */ }
      lastError = lastError ?? msg;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network unreachable";
    lastError = lastError ?? msg;
  }

  if (pull) {
    const apply: CatalogApplyInput = {
      products: pull.products.map(toApplyEntry),
      categories: pull.categories.map(toApplyEntry),
    };
    if ((apply.products?.length ?? 0) + (apply.categories?.length ?? 0) > 0) {
      await db.applyRemoteCatalog(apply);
      hadReadyItems = true;
      // Don't double-count succeeded; pulls aren't push successes. But it's
      // fair to surface the volume so the status pill doesn't look stuck.
      succeeded += (apply.products?.length ?? 0) + (apply.categories?.length ?? 0);
    }
    if (pull.cursor && pull.cursor !== cursor) {
      await setCatalogCursor(pull.cursor);
    }
    if (pull.hasMore) hadReadyItems = true;
  }

  const remaining = await db.countPendingCatalog();
  return {
    attempted,
    succeeded,
    hasMore: remaining > 0 || (pull?.hasMore ?? false),
    hadReadyItems,
    unauthorized: false,
    error: lastError,
  };
}

function toPushEntry(item: CatalogOutboxItem) {
  return {
    id: item.entityId,
    payload: item.payload,
    updatedAt: item.updatedAt,
    deleted: item.deleted,
  };
}

function toApplyEntry(row: PullResponseRow) {
  const updatedAt = Date.parse(row.clientUpdatedAt);
  return {
    id: row.clientId,
    payload: row.payload,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    deleted: row.deletedAt !== null,
  };
}
