import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SIDECAR = "http://127.0.0.1:1106";
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

const INSTALLER_GCS = "downloads/AlSalikPOS-Setup-1.0.0.exe";
const INSTALLER_32_GCS = "downloads/AlSalikPOS-Setup-1.0.0-32bit.exe";
const APK_GCS = "downloads/AlSalikPOS.apk";
const INSTALLER_NAME = "Al Salik POS Setup 1.0.0.exe";
const INSTALLER_32_NAME = "Al Salik POS Setup 1.0.0 (32-bit).exe";
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

router.get("/download/info", (_req, res) => {
  res.json({
    available: !!BUCKET_ID,
    windows64: {
      available: !!BUCKET_ID,
      filename: INSTALLER_NAME,
      sizeBytes: 121785308,
      sizeMB: 116,
      platform: "Windows 10 / 11 (64-bit)",
      downloadUrl: "/api/download/installer",
    },
    windows32: {
      available: !!BUCKET_ID,
      filename: INSTALLER_32_NAME,
      sizeBytes: 97886681,
      sizeMB: 93,
      platform: "Windows 7 SP1+ / 10 / 11 (32-bit)",
      downloadUrl: "/api/download/installer-32",
    },
    android: {
      available: !!BUCKET_ID,
      filename: APK_NAME,
      sizeBytes: 126302922,
      sizeMB: 120,
      downloadUrl: "/api/download/apk",
    },
  });
});

export default router;
