/**
 * Tiny module-level pub/sub so any code path that enqueues work for the
 * cloud (sales, refunds, catalog edits) can poke the SyncContext to drain
 * immediately instead of waiting up to 30s for the next idle poll.
 *
 * No external deps so it works identically in native, web, and Electron
 * (where AppState 'change' events don't fire reliably and setTimeout is
 * throttled in unfocused windows).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onSyncQueueChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifySyncQueueChanged(): void {
  // Snapshot to tolerate listeners unsubscribing during emit.
  for (const cb of Array.from(listeners)) {
    try { cb(); } catch { /* listener errors must not break others */ }
  }
}
