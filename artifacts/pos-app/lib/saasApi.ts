import { Platform } from "react-native";

export interface ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
}

function makeApiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): ApiError {
  const e = new Error(message) as ApiError;
  e.status = status;
  e.code = code;
  e.details = details;
  return e;
}

/**
 * Resolve the API base URL across the various ways the POS is deployed.
 *
 * Priority:
 *  1. `EXPO_PUBLIC_API_BASE` — explicit override (set at build time for the
 *     desktop installer or when the cloud lives on its own domain).
 *  2. Native dev — `EXPO_PUBLIC_DOMAIN` (the Replit dev domain).
 *  3. Web on the Expo dev subdomain — derive the shared-proxy domain from
 *     the current origin. Replit's Expo dev domain looks like
 *     `<id>.expo.pike.replit.dev` and the matching shared proxy domain is
 *     `<id>.pike.replit.dev` (without the `expo.` segment). The api-server
 *     is mounted under `/api` on the shared proxy, so we MUST go through
 *     it; relative URLs from the Expo origin would 404.
 *  4. Web (production / desktop) — empty string. Relative URLs hit the same
 *     origin, which serves the api-server on the same host.
 */
export function getApiBase(): string {
  const explicit = process.env["EXPO_PUBLIC_API_BASE"];
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, "");
  if (Platform.OS !== "web") {
    const domain = process.env["EXPO_PUBLIC_DOMAIN"];
    if (domain) return `https://${domain}`;
    return "";
  }
  // Web: detect the Replit Expo dev subdomain and rewrite to the shared-
  // proxy domain that hosts /api. Use runtime detection (window.location)
  // rather than build-time env so the same web bundle works in dev preview
  // AND in the desktop installer (where it's served from a local origin).
  if (typeof window !== "undefined" && window.location) {
    const host = window.location.hostname;
    // Suffix match (not includes) so unrelated hostnames that happen to
    // contain the substring can't accidentally trigger the rewrite.
    const expoSuffix = ".expo.pike.replit.dev";
    if (host.endsWith(expoSuffix)) {
      const proxyHost = host.slice(0, -expoSuffix.length) + ".pike.replit.dev";
      return `${window.location.protocol}//${proxyHost}`;
    }
  }
  return "";
}

function devicePlatform(): string {
  switch (Platform.OS) {
    case "ios":
    case "android":
    case "web":
      return Platform.OS;
    case "windows":
    case "macos":
      return Platform.OS;
    default:
      return "unknown";
  }
}

export interface ValidatedBranch {
  id: string;
  name: string;
  address: string | null;
}

/**
 * Discriminated union returned by `/api/license/validate`. When the company
 * has more than one active branch and the client didn't pre-select one, the
 * server returns `kind: "needs_branch_selection"` with the picker payload —
 * the client prompts the user, then re-submits with `branchId`.
 */
export type ValidateLicenseResponse =
  | {
      kind: "ok";
      token: string;
      tokenExpiresAt: string;
      company: { id: string; name: string; slug: string };
      license: {
        id: string;
        expiresAt: string | null;
        maxDevices: number;
        licenseType: "online" | "offline";
      };
      device: {
        id: string;
        deviceUid: string;
        name: string | null;
        platform: string;
      };
      branch: ValidatedBranch;
      /** Business type configured by the admin. Defaults to "standard". */
      workMode: "standard" | "saloon" | "laundry" | "retail";
    }
  | {
      kind: "needs_branch_selection";
      company: { id: string; name: string; slug: string };
      branches: ValidatedBranch[];
    };

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return makeApiError(res.status, "network_error", `HTTP ${res.status}`);
  }
  const err = (body as { error?: { code?: string; message?: string; details?: unknown } })
    ?.error;
  return makeApiError(
    res.status,
    err?.code ?? "unknown_error",
    err?.message ?? `HTTP ${res.status}`,
    err?.details,
  );
}

export async function validateLicense(input: {
  licenseKey: string;
  deviceUid: string;
  name?: string;
  /** Optional: pre-select a branch (skips the picker round-trip). */
  branchId?: string;
}): Promise<ValidateLicenseResponse> {
  const url = `${getApiBase()}/api/license/validate`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey: input.licenseKey,
        deviceUid: input.deviceUid,
        name: input.name,
        platform: devicePlatform(),
        ...(input.branchId ? { branchId: input.branchId } : {}),
      }),
    });
  } catch (e) {
    throw makeApiError(
      0,
      "network_unreachable",
      e instanceof Error ? e.message : "Network unreachable",
    );
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ValidateLicenseResponse;
}

export async function authedFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${getApiBase()}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}
