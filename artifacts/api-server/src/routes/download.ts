import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SIDECAR = "http://127.0.0.1:1106";
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

const INSTALLER_GCS = "public/releases/AlSalikPOS-Setup-2.0.0.exe";
const INSTALLER_32_GCS = "public/releases/AlSalikPOS-Setup-2.0.0-32bit.exe";
const APK_GCS = "public/releases/AlSalikPOS.apk";
const INSTALLER_NAME = "Al Salik POS Setup 2.0.0.exe";
const INSTALLER_32_NAME = "Al Salik POS Setup 2.0.0 (32-bit).exe";
const APK_NAME = "Al Salik POS.apk";

async function getAccessToken(): Promise<string> {
  const resp = await fetch(`${SIDECAR}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: "https://storage.googleapis.com/",
      scopes: ["https://www.googleapis.com/auth/devstorage.read_only"],
    }),
  });
  if (resp.ok) {
    const data = (await resp.json()) as { access_token?: string; token?: string };
    const tok = data.access_token ?? data.token;
    if (tok) return tok;
  }
  const resp2 = await fetch(`${SIDECAR}/credential`);
  const cred = (await resp2.json()) as { access_token?: string };
  if (cred.access_token) return cred.access_token;
  throw new Error("Could not obtain access token from sidecar");
}

function gcsDownloadUrl(gcsPath: string, token: string, filename: string): string {
  const encoded = encodeURIComponent(gcsPath);
  const name = encodeURIComponent(filename);
  return (
    `https://storage.googleapis.com/storage/v1/b/${BUCKET_ID}/o/${encoded}` +
    `?alt=media&access_token=${token}&response-content-disposition=attachment%3B%20filename%3D%22${name}%22`
  );
}

router.get("/download/installer", async (req, res) => {
  if (!BUCKET_ID) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }
  try {
    const token = await getAccessToken();
    const url = gcsDownloadUrl(INSTALLER_GCS, token, INSTALLER_NAME);
    res.redirect(302, url);
  } catch (err) {
    req.log.error({ err }, "Failed to get GCS token for installer");
    res.status(502).json({ error: "Could not generate download link" });
  }
});

router.get("/download/installer-32", async (req, res) => {
  if (!BUCKET_ID) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }
  try {
    const token = await getAccessToken();
    const url = gcsDownloadUrl(INSTALLER_32_GCS, token, INSTALLER_32_NAME);
    res.redirect(302, url);
  } catch (err) {
    req.log.error({ err }, "Failed to get GCS token for 32-bit installer");
    res.status(502).json({ error: "Could not generate download link" });
  }
});

router.get("/download/apk", async (req, res) => {
  if (!BUCKET_ID) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }
  try {
    const token = await getAccessToken();
    const url = gcsDownloadUrl(APK_GCS, token, APK_NAME);
    res.redirect(302, url);
  } catch (err) {
    req.log.error({ err }, "Failed to get GCS token for APK");
    res.status(502).json({ error: "Could not generate download link" });
  }
});

// Simple semver greater-than for X.Y.Z strings (no pre-release tags needed).
function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

/**
 * GET /api/desktop/update-check?currentVersion=1.0.0&arch=64
 *
 * Returns { available: false } when no update is published.
 * Returns { available: true, version, url64, url32, notes } when
 * DESKTOP_LATEST_VERSION env var is set to a version > currentVersion.
 *
 * The operator sets DESKTOP_LATEST_VERSION (e.g. "1.1.0") and optionally
 * DESKTOP_UPDATE_NOTES on the API server after uploading new installers to GCS.
 */
router.get("/desktop/update-check", (req, res) => {
  const currentVersion = String(req.query.currentVersion || "0.0.0");
  const latestVersion = process.env.DESKTOP_LATEST_VERSION || "";

  if (!latestVersion || !semverGt(latestVersion, currentVersion)) {
    res.json({ available: false });
    return;
  }

  res.json({
    available: true,
    version: latestVersion,
    url64: "/api/download/installer",
    url32: "/api/download/installer-32",
    notes: process.env.DESKTOP_UPDATE_NOTES || "",
  });
});

router.get("/download/info", (_req, res) => {
  res.json({
    available: !!BUCKET_ID,
    windows64: {
      available: !!BUCKET_ID,
      filename: INSTALLER_NAME,
      sizeBytes: 122379841,
      sizeMB: 117,
      platform: "Windows 10 / 11 (64-bit)",
      downloadUrl: "/api/download/installer",
    },
    windows32: {
      available: !!BUCKET_ID,
      filename: INSTALLER_32_NAME,
      sizeBytes: 98653786,
      sizeMB: 94,
      platform: "Windows 7 SP1+ / 10 / 11 (32-bit)",
      downloadUrl: "/api/download/installer-32",
    },
    android: {
      available: !!BUCKET_ID,
      filename: APK_NAME,
      sizeBytes: 131280471,
      sizeMB: 125,
      downloadUrl: "/api/download/apk",
    },
  });
});

export default router;
