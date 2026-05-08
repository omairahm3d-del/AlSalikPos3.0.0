import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { ManagerSession } from "@/lib/session";

interface Props {
  onLoggedIn: (s: ManagerSession) => void;
}

export default function LoginPage({ onLoggedIn }: Props) {
  const [companySlug, setCompanySlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.login({ companySlug, email, password });
      onLoggedIn({
        token: r.token,
        expiresAt: r.tokenExpiresAt,
        manager: r.manager,
        company: r.company,
        branches: r.branches,
        branchId: r.branches[0]?.id ?? null,
        workMode: r.company.workMode ?? "standard",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Al Salik Back Office
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manager sign in</p>
        </div>
        <label className="block text-sm">
          <span className="text-gray-700">Company slug</span>
          <input
            type="text"
            autoComplete="organization"
            required
            value={companySlug}
            onChange={(e) => setCompanySlug(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="e.g. alsalik-demo"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </label>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-gray-900 text-white text-sm font-medium rounded px-3 py-2 hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-gray-500 text-center">
          Manager accounts are created by an admin in the admin console.
        </p>
      </form>
    </div>
  );
}
