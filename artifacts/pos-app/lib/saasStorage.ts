import AsyncStorage from "@react-native-async-storage/async-storage";

const K_DEVICE_UID = "saas.deviceUid";
const K_TOKEN = "saas.token";
const K_TOKEN_EXPIRES = "saas.tokenExpiresAt";
const K_COMPANY = "saas.company";
const K_LICENSE = "saas.license";
const K_LICENSE_KEY = "saas.licenseKey";
/**
 * Identity of the company whose data currently lives in this device's local
 * DB. Stamped the first time we sync (or first reconcile) under a given
 * license. Used to refuse cross-tenant pushes after a license swap or
 * backup-restore: if the current license's company doesn't match this stamp,
 * the sync engine will not auto-push historical sales into the wrong tenant.
 */
const K_OWNING_COMPANY = "saas.owningCompanyId";
/**
 * Pull cursor for the catalog (products + categories). ISO-8601 string of
 * the highest `serverUpdatedAt` we've consumed. The next pull asks for
 * everything strictly greater than this. One key per device because we
 * enforce single-tenant ownership via K_OWNING_COMPANY — the cursor is
 * implicitly scoped to the owner stamp and cleared whenever ownership
 * is cleared (license swap, backup restore).
 */
const K_CATALOG_CURSOR = "saas.catalogCursor";

export async function getOwningCompanyId(): Promise<string | null> {
  return AsyncStorage.getItem(K_OWNING_COMPANY);
}

export async function setOwningCompanyId(id: string): Promise<void> {
  await AsyncStorage.setItem(K_OWNING_COMPANY, id);
}

export async function clearOwningCompanyId(): Promise<void> {
  // Cursor is meaningless without ownership — clear them together so a
  // subsequent activation starts from `since=0` and pulls the full catalog.
  await AsyncStorage.multiRemove([K_OWNING_COMPANY, K_CATALOG_CURSOR]);
}

export async function getCatalogCursor(): Promise<string | null> {
  return AsyncStorage.getItem(K_CATALOG_CURSOR);
}

export async function setCatalogCursor(cursor: string): Promise<void> {
  await AsyncStorage.setItem(K_CATALOG_CURSOR, cursor);
}

export interface StoredCompany {
  id: string;
  name: string;
  slug: string;
}

export interface StoredLicense {
  id: string;
  expiresAt: string | null;
  maxDevices: number;
  /**
   * "online" — sync engine runs normally.
   * "offline" — sync is disabled; expiry is enforced locally from
   * `expiresAt` so the POS keeps working without contacting the server.
   * Defaulted to "online" on read for backward compatibility with sessions
   * persisted before this field existed.
   */
  licenseType: "online" | "offline";
}

export interface LicenseSession {
  token: string;
  tokenExpiresAt: string;
  company: StoredCompany;
  license: StoredLicense;
  licenseKey: string;
  deviceUid: string;
}

/**
 * Generate or read the persistent device identifier. Once minted, this value
 * never changes for this install — the server uses it to deduplicate devices
 * under a license, so every re-validation must send the same UID.
 *
 * Single-flight: concurrent callers all await the same in-flight promise so
 * we never mint two different UUIDs and burn an extra license slot when the
 * second one re-activates.
 */
let deviceUidPromise: Promise<string> | null = null;

export function getOrCreateDeviceUid(): Promise<string> {
  if (deviceUidPromise) return deviceUidPromise;
  deviceUidPromise = (async () => {
    try {
      const existing = await AsyncStorage.getItem(K_DEVICE_UID);
      if (existing && existing.length >= 8) return existing;
      const uid = uuidV4();
      await AsyncStorage.setItem(K_DEVICE_UID, uid);
      return uid;
    } catch (e) {
      // On failure, clear the cached promise so a retry can try again.
      deviceUidPromise = null;
      throw e;
    }
  })();
  return deviceUidPromise;
}

export async function loadSession(): Promise<LicenseSession | null> {
  const [token, exp, companyRaw, licenseRaw, key, deviceUid] = await Promise.all([
    AsyncStorage.getItem(K_TOKEN),
    AsyncStorage.getItem(K_TOKEN_EXPIRES),
    AsyncStorage.getItem(K_COMPANY),
    AsyncStorage.getItem(K_LICENSE),
    AsyncStorage.getItem(K_LICENSE_KEY),
    AsyncStorage.getItem(K_DEVICE_UID),
  ]);
  if (!token || !companyRaw || !licenseRaw || !key || !deviceUid || !exp) {
    return null;
  }
  try {
    // Runtime validation, not just a TS cast — old sessions persisted before
    // `licenseType` existed are tolerated, but malformed shapes (missing id /
    // wrong types) drop the session and force re-activation rather than
    // letting `undefined` reach downstream license/sync logic.
    const raw = JSON.parse(licenseRaw) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r["id"] !== "string") return null;
    if (typeof r["maxDevices"] !== "number" || !Number.isFinite(r["maxDevices"])) {
      return null;
    }
    const expiresAt = r["expiresAt"];
    if (expiresAt !== null && typeof expiresAt !== "string" && expiresAt !== undefined) {
      return null;
    }
    const normalizedLicense: StoredLicense = {
      id: r["id"],
      expiresAt: typeof expiresAt === "string" ? expiresAt : null,
      maxDevices: r["maxDevices"],
      // Default to "online" for sessions persisted before licenseType existed.
      licenseType: r["licenseType"] === "offline" ? "offline" : "online",
    };
    return {
      token,
      tokenExpiresAt: exp,
      company: JSON.parse(companyRaw) as StoredCompany,
      license: normalizedLicense,
      licenseKey: key,
      deviceUid,
    };
  } catch {
    return null;
  }
}

export async function saveSession(s: LicenseSession): Promise<void> {
  await AsyncStorage.multiSet([
    [K_TOKEN, s.token],
    [K_TOKEN_EXPIRES, s.tokenExpiresAt],
    [K_COMPANY, JSON.stringify(s.company)],
    [K_LICENSE, JSON.stringify(s.license)],
    [K_LICENSE_KEY, s.licenseKey],
    [K_DEVICE_UID, s.deviceUid],
  ]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([
    K_TOKEN,
    K_TOKEN_EXPIRES,
    K_COMPANY,
    K_LICENSE,
    K_LICENSE_KEY,
  ]);
  // Intentionally keep K_DEVICE_UID so re-activation reuses the same slot
  // and doesn't burn an extra device against the license's maxDevices.
}

function uuidV4(): string {
  // RFC 4122 v4 using crypto.getRandomValues when available.
  const bytes = new Uint8Array(16);
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push((bytes[i] ?? 0).toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
