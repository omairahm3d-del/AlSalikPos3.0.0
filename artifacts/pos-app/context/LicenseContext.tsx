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
  ensureSavedLicenseKey,
  getOrCreateDeviceUid,
  loadSavedLicenseKey,
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

/**
 * Why the activation screen is showing.
 * - "expired"   — license window lapsed (may auto-recover if admin extended it)
 * - "revoked"   — license was explicitly revoked by admin
 * - "suspended" — company account suspended
 * - null        — fresh install / manual deactivate (no prior session)
 */
export type ActivationReason = "expired" | "revoked" | "suspended" | null;

interface LicenseContextValue {
  ready: boolean;
  session: LicenseSession | null;
  activationReason: ActivationReason;
  /** The most-recently-used license key, pre-fills the activation form. */
  savedKey: string | null;
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
  const [activationReason, setActivationReason] = useState<ActivationReason>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Monotonically increasing token used to ignore stale async results
  // when activate/refresh/deactivate overlap or race.
  const opSeq = useRef(0);
  const sessionRef = useRef<LicenseSession | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    const myOp = ++opSeq.current;
    (async () => {
      // Mint the device UID up-front so it's available before activation.
      const deviceUid = await getOrCreateDeviceUid();
      const stored = await loadSession();
      if (myOp !== opSeq.current) return;

      if (stored) {
        // Migration: existing users activated before K_SAVED_KEY existed.
        // Write it once so silent re-validation and pre-fill both work.
        if (stored.licenseKey) {
          await ensureSavedLicenseKey(stored.licenseKey);
          if (myOp === opSeq.current) setSavedKey(stored.licenseKey);
        }

        const licenseExpiresMs = stored.license.expiresAt
          ? Date.parse(stored.license.expiresAt)
          : null;
        const licenseExpired =
          licenseExpiresMs !== null &&
          !Number.isNaN(licenseExpiresMs) &&
          licenseExpiresMs <= Date.now();

        if (licenseExpired) {
          // Always clear the stale session first.
          await clearSession();

          // Try silent re-validation — catches the case where the admin
          // extended the license while the device was offline / app was closed.
          const key = await loadSavedLicenseKey();
          if (key && myOp === opSeq.current) {
            try {
              const res = await validateLicense({
                licenseKey: key,
                deviceUid,
                ...(stored.branch ? { branchId: stored.branch.id } : {}),
              });
              if (myOp !== opSeq.current) return;
              // License was successfully extended — restore session transparently.
              if (res.kind !== "needs_branch_selection") {
                const next: LicenseSession = {
                  token: res.token,
                  tokenExpiresAt: res.tokenExpiresAt,
                  company: res.company,
                  license: res.license,
                  branch: res.branch,
                  licenseKey: key,
                  deviceUid,
                  workMode: res.workMode ?? "standard",
                };
                await saveSession(next);
                if (myOp !== opSeq.current) return;
                setSession(next);
                setReady(true);
                return; // ✓ no activation screen needed
              }
            } catch (e) {
              if (myOp !== opSeq.current) return;
              const code = (e as ApiError)?.code;
              setActivationReason(
                code === "license_revoked" ? "revoked" :
                code === "company_suspended" ? "suspended" :
                "expired",
              );
              setSavedKey(key);
            }
          } else if (myOp === opSeq.current) {
            // No saved key — plain expired, no pre-fill.
            setActivationReason("expired");
          }
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

      // Always load the saved key so the form can pre-fill it even on fresh
      // opens where there's no expired session.
      if (myOp === opSeq.current && !session) {
        const key = await loadSavedLicenseKey();
        if (key && myOp === opSeq.current) setSavedKey(key);
      }

      setReady(true);
    })().catch(() => {
      if (myOp === opSeq.current) setReady(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        workMode: res.workMode ?? "standard",
      };
      await saveSession(next);
      if (myOp !== opSeq.current) return { kind: "ok" };
      setActivationReason(null);
      setSession(next);
      return { kind: "ok" };
    },
    [],
  );

  const deactivate = useCallback(async () => {
    opSeq.current++;
    await clearSession();
    setSession(null);
    setActivationReason(null);
  }, []);

  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const isOffline = current.license.licenseType === "offline";
    const myOp = ++opSeq.current;
    try {
      const res = await validateLicense({
        licenseKey: current.licenseKey,
        deviceUid: current.deviceUid,
        ...(current.branch ? { branchId: current.branch.id } : {}),
      });
      if (myOp !== opSeq.current) return;
      if (res.kind === "needs_branch_selection") return;
      const freshWorkMode = res.workMode ?? "standard";
      if (isOffline) {
        // For offline licenses: don't update the token, but DO update workMode
        // so that admin changes to the company's work mode are picked up.
        if (freshWorkMode !== current.workMode) {
          const next: LicenseSession = { ...current, workMode: freshWorkMode };
          await saveSession(next);
          if (myOp !== opSeq.current) return;
          setSession(next);
        }
        return;
      }
      const next: LicenseSession = {
        token: res.token,
        tokenExpiresAt: res.tokenExpiresAt,
        company: res.company,
        license: res.license,
        branch: res.branch,
        licenseKey: current.licenseKey,
        deviceUid: current.deviceUid,
        workMode: freshWorkMode,
      };
      await saveSession(next);
      if (myOp !== opSeq.current) return;
      setSession(next);
    } catch (e) {
      if (myOp !== opSeq.current) return;
      // For offline licenses: silently ignore network errors — the device
      // is allowed to keep running from its locally stored session.
      if (isOffline) return;
      const err = e as ApiError;
      if (
        err?.code === "license_revoked" ||
        err?.code === "license_expired" ||
        err?.code === "license_not_found" ||
        err?.code === "company_suspended"
      ) {
        await clearSession();
        if (myOp === opSeq.current) {
          setActivationReason(
            err.code === "license_revoked" ? "revoked" :
            err.code === "company_suspended" ? "suspended" :
            "expired",
          );
          setSession(null);
        }
      }
    }
  }, []);

  return (
    <LicenseContext.Provider value={{ ready, session, activationReason, savedKey, activate, deactivate, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}
