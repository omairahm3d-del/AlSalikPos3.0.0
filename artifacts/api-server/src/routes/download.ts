import { Router, type IRouter } from "express";
import { createReadStream, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const router: IRouter = Router();

const INSTALLER_PATH = resolve(
  process.cwd(),
  "../../desktop-installer/dist/Al Salik POS Setup 1.0.0.exe",
);
const APK_PATH = resolve(
  process.cwd(),
  "../../desktop-installer/dist/Al Salik POS.apk",
);

function streamFile(req: any, res: any, filePath: string, filename: string) {
  if (!existsSync(filePath)) {
    req.log.error({ path: filePath }, "Download file not found");
    res.status(404).json({ error: "File not found" });
    return;
  }
  const stat = statSync(filePath);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", stat.size.toString());
  res.setHeader("Cache-Control", "no-cache");
  const stream = createReadStream(filePath);
  stream.on("error", (err) => {
    req.log.error({ err }, "Error streaming file");
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
}

router.get("/download/installer", (req, res) => {
  streamFile(req, res, INSTALLER_PATH, "Al Salik POS Setup 1.0.0.exe");
});

router.get("/download/apk", (req, res) => {
  streamFile(req, res, APK_PATH, "Al Salik POS.apk");
});

router.get("/download/info", (_req, res) => {
  const result: Record<string, any> = {};
  if (existsSync(INSTALLER_PATH)) {
    const s = statSync(INSTALLER_PATH);
    result.windows = {
      available: true,
      filename: "Al Salik POS Setup 1.0.0.exe",
      sizeBytes: s.size,
      sizeMB: Math.round(s.size / 1024 / 1024),
      downloadUrl: "/api/download/installer",
    };
  } else {
    result.windows = { available: false };
  }
  if (existsSync(APK_PATH)) {
    const s = statSync(APK_PATH);
    result.android = {
      available: true,
      filename: "Al Salik POS.apk",
      sizeBytes: s.size,
      sizeMB: Math.round(s.size / 1024 / 1024),
      downloadUrl: "/api/download/apk",
    };
  } else {
    result.android = { available: false };
  }
  // Backwards-compat: top-level keys mirror the windows installer.
  Object.assign(result, result.windows);
  res.json(result);
});

export default router;
