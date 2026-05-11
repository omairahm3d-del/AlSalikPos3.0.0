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
      const baseMsg = body?.error?.message ?? msg;
      // Surface field-level Zod issues (details array) so the sync queue
      // shows exactly which field failed instead of the generic "Invalid
      // request body" string — critical for diagnosing legacy-data problems.
      const details = body?.error?.details;
      if (Array.isArray(details) && details.length > 0) {
        const fieldSummary = details
          .slice(0, 3)
          .map((d: { path?: unknown[]; message?: string }) => {
            const path = Array.isArray(d.path) ? d.path.join(".") : "?";
            return `${path}: ${d.message ?? "invalid"}`;
          })
          .join("; ");
        msg = `${baseMsg} — ${fieldSummary}`;
      } else {
        msg = baseMsg;
      }
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

export interface PurchaseSyncResult {
  attempted: number;
  succeeded: number;
  failed: number;
  hasMore: boolean;
  hadReadyItems: boolean;
  unauthorized: boolean;
  error?: string;
}

/**
 * Run one drain pass for local purchases (Receive Stock entries).
 *
 * Each pending purchase is POSTed to `/api/pos/purchases` individually using
 * the local purchase ID as idempotencyKey — the server returns the existing
 * record when the key is already known, so retries are always safe.
 *
 * Skipped entirely when the device is not bound to a branch (`branchId` null)
 * because the server endpoint rejects unbound devices.
 */
export async function syncPurchasesOnce(
  db: DatabaseContextValue,
  token: string,
  branchId: string | null,
): Promise<PurchaseSyncResult> {
  if (!branchId) {
    return {
      attempted: 0, succeeded: 0, failed: 0,
      hasMore: false, hadReadyItems: false, unauthorized: false,
    };
  }

  const batch = await db.loadSyncBatch("purchase", BATCH_SIZE);
  const now = Date.now();
  const ready = batch.filter((item) => {
    if (item.lastAttemptAt === null) return true;
    return now - item.lastAttemptAt >= backoffMs(item.attemptCount);
  });

  if (ready.length === 0) {
    const remaining = await db.countPendingSync("purchase");
    return {
      attempted: 0, succeeded: 0, failed: 0,
      hasMore: remaining > 0, hadReadyItems: false, unauthorized: false,
    };
  }

  const updates: SyncResultUpdate[] = [];
  let succeeded = 0;
  let unauthorized = false;
  let lastError: string | undefined;

  for (const item of ready) {
    const local = await db.getLocalPurchase(item.entityId);
    if (!local) {
      updates.push({ queueId: item.queueId, ok: true });
      succeeded++;
      continue;
    }
    const { purchase, items } = local;
    const body = {
      branchId,
      supplierName: purchase.supplierName,
      referenceNumber: purchase.referenceNumber ?? null,
      receivedAt: new Date(purchase.receivedAt).toISOString(),
      notes: purchase.notes ?? null,
      items: items.map((l) => ({
        productClientId: l.productClientId,
        productName: l.productName,
        sku: l.sku ?? null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        vatAmount: l.vatAmount,
      })),
      idempotencyKey: purchase.id,
    };

    let res: Response;
    try {
      res = await authedFetch("/api/pos/purchases", token, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network unreachable";
      updates.push({ queueId: item.queueId, ok: false, error: msg });
      lastError = msg;
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      unauthorized = true;
      break;
    }

    if (res.ok) {
      updates.push({ queueId: item.queueId, ok: true });
      succeeded++;
    } else {
      let msg = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        msg = errBody?.error?.message ?? msg;
      } catch { /* ignore */ }
      updates.push({ queueId: item.queueId, ok: false, error: msg });
      lastError = msg;
    }
  }

  if (updates.length > 0) await db.markSyncResults(updates);
  const remaining = await db.countPendingSync("purchase");
  return {
    attempted: ready.length,
    succeeded,
    failed: ready.length - succeeded - (unauthorized ? 1 : 0),
    hasMore: remaining > 0,
    hadReadyItems: true,
    unauthorized,
    error: lastError,
  };
}
