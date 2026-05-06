import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useDatabase } from "@/context/DatabaseCore";
import { useLicense } from "@/context/LicenseContext";
import { syncOnce } from "@/lib/syncEngine";
import { catalogSyncOnce } from "@/lib/catalogSyncEngine";
import {
  getOwningCompanyId,
  setOwningCompanyId,
} from "@/lib/saasStorage";

/** Poll cadence when the queue is empty or fully in backoff. */
const IDLE_INTERVAL_MS = 30_000;
/** Poll cadence when the queue had ready work this tick. */
const ACTIVE_INTERVAL_MS = 5_000;

interface SyncContextValue {
  /** Pending sales pushes. */
  pendingCount: number;
  /** Pending catalog (product/category) pushes. */
  pendingCatalogCount: number;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** Force a sync attempt right now. */
  syncNow: () => Promise<void>;
  /**
   * Stamp existing local data as belonging to the currently-activated
   * license's company and resume sync. Only succeeds when the owner stamp
   * is genuinely unset — this never overwrites an existing stamp, so it
   * cannot be used to push one tenant's data into another.
   */
  adoptLocalDataForCurrentLicense: () => Promise<{ ok: boolean; error?: string }>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase();
  const { session, refresh } = useLicense();

  const [pendingCount, setPendingCount] = useState(0);
  const [pendingCatalogCount, setPendingCatalogCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs for the single-owner scheduler and to avoid stale-token writes.
  const inFlightRef = useRef(false);
  const sessionTokenRef = useRef<string | null>(null);
  sessionTokenRef.current = session?.token ?? null;
  const sessionCompanyIdRef = useRef<string | null>(null);
  sessionCompanyIdRef.current = session?.company?.id ?? null;
  /**
   * The company id we have *verified* the local data belongs to. Drains only
   * proceed when this matches the current session's company. Storing the id
   * (not a boolean) closes the timing window where a session swap could
   * inherit a stale "safe" flag from the prior session.
   */
  const verifiedCompanyIdRef = useRef<string | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const [sales, catalog] = await Promise.all([
        db.countPendingSync("sale"),
        db.countPendingCatalog(),
      ]);
      setPendingCount(sales);
      setPendingCatalogCount(catalog);
    } catch {
      // ignore — DB may be transitioning
    }
  }, [db]);

  /**
   * Run one drain pass. Returns the recommended delay until the next tick.
   * Returns null when the loop should stop (no session, blocked by tenant
   * mismatch).
   */
  const drain = useCallback(async (): Promise<number | null> => {
    const token = sessionTokenRef.current;
    const currentCompanyId = sessionCompanyIdRef.current;
    if (!token || !currentCompanyId) return null;
    // Hard tenant guard at the moment of push: refuse unless we've verified
    // the local data belongs to *this* session's company. Closes any race
    // between session change and the async safety check.
    if (verifiedCompanyIdRef.current !== currentCompanyId) return null;
    if (inFlightRef.current) return ACTIVE_INTERVAL_MS;
    inFlightRef.current = true;
    setIsSyncing(true);
    try {
      // Sales first (revenue data has higher business priority), then catalog.
      // Both share the same tenant guard so a session change between them
      // simply aborts before the second call lands.
      const salesResult = await syncOnce(db, token);
      // Re-check tenant in case session changed during the await.
      if (verifiedCompanyIdRef.current !== sessionCompanyIdRef.current) {
        return null;
      }
      if (salesResult.unauthorized) {
        setLastError("authorization expired");
        // Fire-and-forget; the license layer either re-mints or drops session.
        refresh().catch(() => {});
        await refreshCount();
        // Don't run catalog with a known-bad token; come back after refresh.
        return ACTIVE_INTERVAL_MS;
      }

      const catalogResult = await catalogSyncOnce(db, token);
      if (verifiedCompanyIdRef.current !== sessionCompanyIdRef.current) {
        return null;
      }
      if (catalogResult.unauthorized) {
        setLastError("authorization expired");
        refresh().catch(() => {});
        await refreshCount();
        return ACTIVE_INTERVAL_MS;
      }

      const error = salesResult.error ?? catalogResult.error ?? null;
      if (error) {
        setLastError(error);
      } else if (salesResult.attempted > 0 || catalogResult.attempted > 0 || catalogResult.succeeded > 0) {
        // succeeded counts pulled rows too, so a successful pull also
        // bumps lastSyncedAt even when we had nothing to push.
        setLastError(null);
        setLastSyncedAt(Date.now());
      }
      await refreshCount();

      // Active cadence if either stream has more work past its backoff window.
      const hasMore = salesResult.hasMore || catalogResult.hasMore;
      const hadReadyItems = salesResult.hadReadyItems || catalogResult.hadReadyItems;
      if (!hasMore) return IDLE_INTERVAL_MS;
      return hadReadyItems ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "sync failed");
      return IDLE_INTERVAL_MS;
    } finally {
      inFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [db, refresh, refreshCount]);

  // Single-owner scheduler. One outstanding timer at a time, always cleared
  // before being replaced. AppState 'active' just kicks the schedule forward;
  // it never spawns its own ticking branch.
  useEffect(() => {
    // ALWAYS reset verification on session change, *before* any await. This
    // prevents a brief window where the previous session's "safe" stamp
    // could let a drain push under the new token.
    verifiedCompanyIdRef.current = null;

    if (!session) return;
    const currentCompanyId = session.company.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      timer = setTimeout(runTick, delay);
    };

    const runTick = async () => {
      if (cancelled) return;
      timer = null;
      const delay = await drain();
      if (cancelled || delay === null) return;
      schedule(delay);
    };

    (async () => {
      // ---- Tenant safety check ----
      // Reconcile is the dangerous operation: it can sweep every existing
      // sale into the queue. The policy:
      //   * owner stamped == current company  -> safe; reconcile + drain.
      //   * owner stamped != current company  -> license swap; refuse.
      //   * owner unset                       -> first sync ever, BUT only
      //     safe if local data is actually empty. If sales already exist
      //     (e.g. operator restored a backup before activating), refuse and
      //     require an explicit wipe — otherwise we'd push someone else's
      //     sales into the new tenant.
      try {
        const owner = await getOwningCompanyId();
        if (cancelled) return;
        if (owner === currentCompanyId) {
          await db.reconcilePendingSync();
          if (cancelled) return;
          verifiedCompanyIdRef.current = currentCompanyId;
        } else if (owner && owner !== currentCompanyId) {
          setLastError(
            "Local data belongs to a different company. Sync paused to avoid pushing it to the wrong tenant.",
          );
        } else {
          // owner is unset — either a true fresh install or a restored
          // backup whose ownership stamp didn't survive. Distinguish by
          // looking at whether any sales already exist locally.
          const existingSales = await db.loadSales();
          if (cancelled) return;
          if (existingSales.length === 0) {
            await setOwningCompanyId(currentCompanyId);
            await db.reconcilePendingSync();
            if (cancelled) return;
            verifiedCompanyIdRef.current = currentCompanyId;
          } else {
            setLastError(
              "Existing local sales have no tenant stamp. Sync paused — clear local data or contact support before pushing.",
            );
          }
        }
      } catch (e) {
        // Don't fall back to "safe" on error — leave verifiedCompanyIdRef
        // null and surface the failure. The drain guard will keep us
        // grounded until the next session change retries.
        setLastError(e instanceof Error ? e.message : "tenant check failed");
      }
      if (cancelled) return;
      await refreshCount();
      schedule(0);
    })();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !cancelled) schedule(0);
    });

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      sub.remove();
    };
  }, [session, db, drain, refreshCount]);

  const syncNow = useCallback(async () => {
    await drain();
  }, [drain]);

  const adoptLocalDataForCurrentLicense = useCallback(async () => {
    const currentCompanyId = sessionCompanyIdRef.current;
    if (!currentCompanyId) return { ok: false, error: "No active license session." };
    try {
      // Re-check ownership at the moment of action. We refuse to overwrite
      // an existing stamp — that's the whole point of the safety check.
      const owner = await getOwningCompanyId();
      if (owner && owner !== currentCompanyId) {
        return {
          ok: false,
          error: "Local data already belongs to a different company. Cannot adopt.",
        };
      }
      if (!owner) {
        await setOwningCompanyId(currentCompanyId);
      }
      await db.reconcilePendingSync();
      verifiedCompanyIdRef.current = currentCompanyId;
      setLastError(null);
      await refreshCount();
      // Kick off a sync immediately.
      drain().catch(() => {});
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "adopt failed" };
    }
  }, [db, drain, refreshCount]);

  return (
    <SyncContext.Provider
      value={{
        pendingCount,
        pendingCatalogCount,
        isSyncing,
        lastSyncedAt,
        lastError,
        syncNow,
        adoptLocalDataForCurrentLicense,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within a SyncProvider");
  return ctx;
}
