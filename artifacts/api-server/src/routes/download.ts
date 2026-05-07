import { Router, type IRouter } from "express";
import { Storage } from "@google-cloud/storage";

const router: IRouter = Router();

const SIDECAR = "http://127.0.0.1:1106";

const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

const INSTALLER_GCS = "downloads/AlSalikPOS-Setup-1.0.0.exe";
const APK_GCS = "downloads/AlSalikPOS.apk";
const INSTALLER_NAME = "Al Salik POS Setup 1.0.0.exe";
const APK_NAME = "Al Salik POS.apk";

async function streamFromGcs(
  req: any,
  res: any,
  gcsPath: string,
  filename: string,
) {
  if (!BUCKET_ID) {
    req.log.error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
    res.status(503).json({ error: "Storage not configured" });
    return;
  }
  const file = gcs.bucket(BUCKET_ID).file(gcsPath);
  let metadata: any;
  try {
    [metadata] = await file.getMetadata();
  } catch (err: any) {
    if (err?.code === 404) {
      res.status(404).json({ error: "File not found" });
    } else {
      req.log.error({ err }, "GCS metadata error");
      res.status(502).json({ error: "Storage error" });
    }
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  if (metadata.size) {
    res.setHeader("Content-Length", metadata.size);
  }
  res.setHeader("Cache-Control", "no-cache");

  const stream = file.createReadStream();
  stream.on("error", (err) => {
    req.log.error({ err }, "GCS stream error");
    if (!res.headersSent) res.status(502).end();
  });
  stream.pipe(res);
}

router.get("/download/installer", (req, res) => {
  streamFromGcs(req, res, INSTALLER_GCS, INSTALLER_NAME);
});

router.get("/download/apk", (req, res) => {
  streamFromGcs(req, res, APK_GCS, APK_NAME);
});

router.get("/download/info", async (_req, res) => {
  const result: Record<string, any> = {};
  if (BUCKET_ID) {
    try {
      const [imeta] = await gcs
        .bucket(BUCKET_ID)
        .file(INSTALLER_GCS)
        .getMetadata();
      result.windows = {
        available: true,
        filename: INSTALLER_NAME,
        sizeBytes: Number(imeta.size),
        sizeMB: Math.round(Number(imeta.size) / 1024 / 1024),
        downloadUrl: "/api/download/installer",
      };
    } catch {
      result.windows = { available: false };
    }
    try {
      const [ameta] = await gcs
        .bucket(BUCKET_ID)
        .file(APK_GCS)
        .getMetadata();
      result.android = {
        available: true,
        filename: APK_NAME,
        sizeBytes: Number(ameta.size),
        sizeMB: Math.round(Number(ameta.size) / 1024 / 1024),
        downloadUrl: "/api/download/apk",
      };
    } catch {
      result.android = { available: false };
    }
  } else {
    result.windows = { available: false };
    result.android = { available: false };
  }
  Object.assign(result, result.windows);
  res.json(result);
});

export default router;
