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
import { validateLicense, type ApiError } from "@/lib/saasApi";

interface LicenseContextValue {
  ready: boolean;
  session: LicenseSession | null;
  activate: (licenseKey: string, deviceName?: string) => Promise<void>;
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
        const expMs = Date.parse(stored.tokenExpiresAt);
        if (!Number.isNaN(expMs) && expMs > Date.now()) {
          setSession(stored);
        }
      }
      setReady(true);
    })().catch(() => {
      if (myOp === opSeq.current) setReady(true);
    });
  }, []);

  const activate = useCallback(
    async (licenseKey: string, deviceName?: string) => {
      const myOp = ++opSeq.current;
      const deviceUid = await getOrCreateDeviceUid();
      const res = await validateLicense({
        licenseKey: licenseKey.trim(),
        deviceUid,
        name: deviceName?.trim() || undefined,
      });
      // If a newer op (e.g. deactivate) ran while we were awaiting, drop this
      // result rather than clobbering the newer state.
      if (myOp !== opSeq.current) return;
      const next: LicenseSession = {
        token: res.token,
        tokenExpiresAt: res.tokenExpiresAt,
        company: res.company,
        license: res.license,
        licenseKey: licenseKey.trim().toUpperCase(),
        deviceUid,
      };
      await saveSession(next);
      if (myOp !== opSeq.current) return;
      setSession(next);
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
    const myOp = ++opSeq.current;
    try {
      const res = await validateLicense({
        licenseKey: current.licenseKey,
        deviceUid: current.deviceUid,
      });
      if (myOp !== opSeq.current) return;
      const next: LicenseSession = {
        token: res.token,
        tokenExpiresAt: res.tokenExpiresAt,
        company: res.company,
        license: res.license,
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
