import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clearSession,
  getOrCreateDeviceUid,
  loadSession,
  saveSession,
  type LicenseSession,
} from "@/lib/saasStorage";
import {
  validateLicense,
  type ApiError,
  type ValidatedBranch,
} from "@/lib/saasApi";

/**
 * Result of an `activate()` call. When the company has multiple active
 * branches and the caller didn't pre-pick one, the API short-circuits with
 * a picker payload — the UI must render a branch chooser, then call
 * `activate(licenseKey, deviceName, branchId)` with the selection.
 */
export type ActivateResult =
  | { kind: "ok" }
  | { kind: "needs_branch_selection"; branches: ValidatedBranch[] };

interface LicenseContextValue {
  ready: boolean;
  session: LicenseSession | null;
  activate: (
    licenseKey: string,
    deviceName?: string,
    branchId?: string,
  ) => Promise<ActivateResult>;
  deactivate: () => Promise<void>;
  /** Re-validate against the server (used on resume / once per day). */
  refresh: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<LicenseSession | null>(null);

  // Monotonically increasing token used to ignore stale async results
  // when activate/refresh/deactivate overlap or race.
  const opSeq = useRef(0);
  const sessionRef = useRef<LicenseSession | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    const myOp = ++opSeq.current;
    (async () => {
      // Mint the device UID up-front so it's available before activation.
      await getOrCreateDeviceUid();
      const stored = await loadSession();
      if (myOp !== opSeq.current) return;
      if (stored) {
        // Local license-window check (works offline). If the cloud-issued
        // expiresAt has passed, the device must re-activate regardless of
        // license type.
        const licenseExpiresMs = stored.license.expiresAt
          ? Date.parse(stored.license.expiresAt)
          : null;
        const licenseExpired =
          licenseExpiresMs !== null &&
          !Number.isNaN(licenseExpiresMs) &&
          licenseExpiresMs <= Date.now();
        if (licenseExpired) {
          await clearSession();
        } else if (stored.license.licenseType === "offline") {
          // Offline licenses don't depend on the JWT being fresh — the device
          // is allowed to keep running purely from local state.
          setSession(stored);
        } else {
          const expMs = Date.parse(stored.tokenExpiresAt);
          if (!Number.isNaN(expMs) && expMs > Date.now()) {
            setSession(stored);
          }
        }
      }
      setReady(true);
    })().catch(() => {
      if (myOp === opSeq.current) setReady(true);
    });
  }, []);

  const activate = useCallback(
    async (
      licenseKey: string,
      deviceName?: string,
      branchId?: string,
    ): Promise<ActivateResult> => {
      const myOp = ++opSeq.current;
      const deviceUid = await getOrCreateDeviceUid();
      const res = await validateLicense({
        licenseKey: licenseKey.trim(),
        deviceUid,
        name: deviceName?.trim() || undefined,
        branchId,
      });
      // If a newer op (e.g. deactivate) ran while we were awaiting, drop this
      // result rather than clobbering the newer state.
      if (myOp !== opSeq.current) return { kind: "ok" };
      if (res.kind === "needs_branch_selection") {
        return {
          kind: "needs_branch_selection",
          branches: res.branches,
        };
      }
      const next: LicenseSession = {
        token: res.token,
        tokenExpiresAt: res.tokenExpiresAt,
        company: res.company,
        license: res.license,
        branch: res.branch,
        licenseKey: licenseKey.trim().toUpperCase(),
        deviceUid,
      };
      await saveSession(next);
      if (myOp !== opSeq.current) return { kind: "ok" };
      setSession(next);
      return { kind: "ok" };
    },
    [],
  );

  const deactivate = useCallback(async () => {
    opSeq.current++;
    await clearSession();
    setSession(null);
  }, []);

  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    // Offline licenses never re-validate against the server: their whole
    // point is to keep working without a network. The license-window check
    // already ran on mount from persisted state.
    if (current.license.licenseType === "offline") return;
    const myOp = ++opSeq.current;
    try {
      const res = await validateLicense({
        licenseKey: current.licenseKey,
        deviceUid: current.deviceUid,
        // Pin to the device's current branch on refresh — otherwise a
        // multi-branch company would re-trigger the picker every renewal.
        ...(current.branch ? { branchId: current.branch.id } : {}),
      });
      if (myOp !== opSeq.current) return;
      // Refresh against an unbound legacy session that hits a multi-branch
      // company would short-circuit to picker — we keep the existing
      // session in that case and let the next manual re-activate handle it.
      if (res.kind === "needs_branch_selection") return;
      const next: LicenseSession = {
        token: res.token,
        tokenExpiresAt: res.tokenExpiresAt,
        company: res.company,
        license: res.license,
        branch: res.branch,
        licenseKey: current.licenseKey,
        deviceUid: current.deviceUid,
      };
      await saveSession(next);
      if (myOp !== opSeq.current) return;
      setSession(next);
    } catch (e) {
      if (myOp !== opSeq.current) return;
      const err = e as ApiError;
      // Hard-revoke states: drop the session and force re-activation.
      if (
        err?.code === "license_revoked" ||
        err?.code === "license_expired" ||
        err?.code === "license_not_found" ||
        err?.code === "company_suspended"
      ) {
        await clearSession();
        if (myOp === opSeq.current) setSession(null);
      }
      // For network errors, keep the existing session — POS must keep working
      // offline once activated, until the JWT itself expires.
    }
  }, []);

  return (
    <LicenseContext.Provider value={{ ready, session, activate, deactivate, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}
