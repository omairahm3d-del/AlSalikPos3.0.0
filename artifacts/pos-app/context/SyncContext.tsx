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
import {
  getOwningCompanyId,
  setOwningCompanyId,
} from "@/lib/saasStorage";

/** Poll cadence when the queue is empty or fully in backoff. */
const IDLE_INTERVAL_MS = 30_000;
/** Poll cadence when the queue had ready work this tick. */
const ACTIVE_INTERVAL_MS = 5_000;

interface SyncContextValue {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** Force a sync attempt right now. */
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase();
  const { session, refresh } = useLicense();

  const [pendingCount, setPendingCount] = useState(0);
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
      const c = await db.countPendingSync("sale");
      setPendingCount(c);
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
      const result = await syncOnce(db, token);
      // Re-check tenant in case session changed during the await.
      if (verifiedCompanyIdRef.current !== sessionCompanyIdRef.current) {
        return null;
      }
      if (result.unauthorized) {
        setLastError("authorization expired");
        // Fire-and-forget; the license layer either re-mints or drops session.
        refresh().catch(() => {});
      } else if (result.error) {
        setLastError(result.error);
      } else if (result.attempted > 0) {
        setLastError(null);
        setLastSyncedAt(Date.now());
      }
      await refreshCount();
      // Active cadence only when there's work that's actually past its
      // backoff window. Otherwise idle so we're not waking up every 5s just
      // to look at backoffed rows.
      if (!result.hasMore) return IDLE_INTERVAL_MS;
      return result.hadReadyItems ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
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

  return (
    <SyncContext.Provider
      value={{ pendingCount, isSyncing, lastSyncedAt, lastError, syncNow }}
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
