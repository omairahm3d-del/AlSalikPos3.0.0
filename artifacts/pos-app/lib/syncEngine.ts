import type { DatabaseContextValue, SyncResultUpdate } from "@/context/DatabaseCore";
import { authedFetch } from "@/lib/saasApi";

const BATCH_SIZE = 50;

/**
 * Exponential backoff in ms for retrying a failed sync attempt.
 * Cap at 5 minutes so we never wait too long after transient outages.
 */
function backoffMs(attemptCount: number): number {
  const seconds = Math.min(300, Math.pow(2, attemptCount) * 5);
  return seconds * 1000;
}

export interface PushSalesResponse {
  inserted: number;
  duplicates: number;
  results: Array<{ clientSaleId: string; status: "inserted" | "duplicate"; serverId?: string }>;
}

export interface SyncOnceResult {
  attempted: number;
  succeeded: number;
  failed: number;
  /** True if there is more pending work after this run. */
  hasMore: boolean;
  /**
   * True iff this run actually had work it could try (something past its
   * backoff window). When false, the queue may still have rows — they're just
   * all in backoff — and the caller should use the idle cadence to wake up
   * and re-check, not the active one.
   */
  hadReadyItems: boolean;
  /** Set when the JWT was rejected — caller should re-validate the license. */
  unauthorized: boolean;
  error?: string;
}

/**
 * Run one drain pass against the sync queue.
 *
 * Loads a batch of pending sales, hydrates each from the local DB, posts them
 * to `/api/sync/sales`, then marks each item ok/failed based on per-row
 * results. Server-confirmed duplicates count as success — they prove the row
 * is already in the cloud and the queue can drop it.
 */
export async function syncOnce(
  db: DatabaseContextValue,
  token: string,
): Promise<SyncOnceResult> {
  const batch = await db.loadSyncBatch("sale", BATCH_SIZE);
  const now = Date.now();
  // Skip items that are still in their backoff window.
  const ready = batch.filter((item) => {
    if (item.lastAttemptAt === null) return true;
    return now - item.lastAttemptAt >= backoffMs(item.attemptCount);
  });

  if (ready.length === 0) {
    const remaining = await db.countPendingSync("sale");
    return {
      attempted: 0, succeeded: 0, failed: 0,
      hasMore: remaining > 0, hadReadyItems: false, unauthorized: false,
    };
  }

  // Hydrate each queued sale id with its full payload (items + splits).
  const sales: Array<{ queueId: string; payload: Record<string, unknown> }> = [];
  const updates: SyncResultUpdate[] = [];
  for (const item of ready) {
    const sale = await db.loadSaleWithItems(item.entityId);
    if (!sale) {
      // Source row is gone — drop the queue entry so we don't retry forever.
      updates.push({ queueId: item.queueId, ok: true });
      continue;
    }
    const splits = await db.loadSplitPayments(item.entityId);
    sales.push({
      queueId: item.queueId,
      payload: { ...sale, splitPayments: splits },
    });
  }

  if (sales.length === 0) {
    if (updates.length > 0) await db.markSyncResults(updates);
    const remaining = await db.countPendingSync("sale");
    return {
      attempted: ready.length,
      succeeded: updates.length,
      failed: 0,
      hasMore: remaining > 0,
      hadReadyItems: true,
      unauthorized: false,
    };
  }

  let res: Response;
  try {
    res = await authedFetch("/api/sync/sales", token, {
      method: "POST",
      body: JSON.stringify({ sales: sales.map((s) => s.payload) }),
    });
  } catch (e) {
    // Network failure — mark everything in this batch as failed and let the
    // backoff window govern the retry.
    const msg = e instanceof Error ? e.message : "network unreachable";
    for (const s of sales) updates.push({ queueId: s.queueId, ok: false, error: msg });
    await db.markSyncResults(updates);
    const remaining = await db.countPendingSync("sale");
    return {
      attempted: ready.length,
      succeeded: 0,
      failed: sales.length,
      hasMore: remaining > 0,
      hadReadyItems: true,
      unauthorized: false,
      error: msg,
    };
  }

  if (res.status === 401 || res.status === 403) {
    // Don't bump attempt counts for an auth failure — the data is fine, the
    // token isn't. Caller is expected to refresh the license.
    const remaining = await db.countPendingSync("sale");
    return {
      attempted: ready.length,
      succeeded: 0,
      failed: 0,
      hasMore: remaining > 0,
      hadReadyItems: true,
      unauthorized: true,
      error: `auth ${res.status}`,
    };
  }

  if (!res.ok) {
    // Server-side validation or 5xx. Mark this batch failed; it'll retry.
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? msg;
    } catch {
      // ignore
    }
    for (const s of sales) updates.push({ queueId: s.queueId, ok: false, error: msg });
    await db.markSyncResults(updates);
    const remaining = await db.countPendingSync("sale");
    return {
      attempted: ready.length,
      succeeded: 0,
      failed: sales.length,
      hasMore: remaining > 0,
      hadReadyItems: true,
      unauthorized: false,
      error: msg,
    };
  }

  // 2xx: per-row verdicts. Inserted and duplicate both mean "in the cloud".
  const json = (await res.json()) as PushSalesResponse;
  const verdictByClientId = new Map(json.results.map((r) => [r.clientSaleId, r]));
  let succeeded = 0;
  for (const s of sales) {
    const sale = s.payload as { id: string };
    const verdict = verdictByClientId.get(sale.id);
    if (verdict) {
      updates.push({ queueId: s.queueId, ok: true });
      succeeded++;
    } else {
      // Server didn't return a verdict for this id — treat as failed so we retry.
      updates.push({ queueId: s.queueId, ok: false, error: "no verdict from server" });
    }
  }
  await db.markSyncResults(updates);
  const remaining = await db.countPendingSync("sale");
  return {
    attempted: ready.length,
    succeeded,
    failed: sales.length - succeeded,
    hasMore: remaining > 0,
    hadReadyItems: true,
    unauthorized: false,
  };
}
