import { useEffect, useState } from "react";
import type { BranchSummary } from "./api";

const KEY = "alsalik.bo.session.v1";

export interface ManagerSession {
  token: string;
  expiresAt: string;
  manager: { id: string; email: string; name: string; role: string };
  company: { id: string; name: string; slug: string };
  branches: BranchSummary[];
  branchId: string | null;
}

export function loadSession(): ManagerSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ManagerSession;
    if (new Date(s.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: ManagerSession): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function useSession() {
  const [session, setSession] = useState<ManagerSession | null>(() =>
    loadSession(),
  );
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setSession(loadSession());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return {
    session,
    setSession: (s: ManagerSession | null) => {
      if (s) saveSession(s);
      else clearSession();
      setSession(s);
    },
  };
}
