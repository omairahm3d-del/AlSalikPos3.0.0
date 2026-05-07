import { Router, type IRouter } from "express";
import { createReadStream, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const router: IRouter = Router();

function findFile(filename: string): string {
  const candidates = [
    resolve(process.cwd(), "desktop-installer/dist", filename),
    resolve(process.cwd(), "../../desktop-installer/dist", filename),
  ];
  return candidates.find(existsSync) ?? candidates[0];
}

const INSTALLER_NAME = "Al Salik POS Setup 1.0.0.exe";
const APK_NAME = "Al Salik POS.apk";

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
  streamFile(req, res, findFile(INSTALLER_NAME), INSTALLER_NAME);
});

router.get("/download/apk", (req, res) => {
  streamFile(req, res, findFile(APK_NAME), APK_NAME);
});

router.get("/download/info", (_req, res) => {
  const result: Record<string, any> = {};
  const installerPath = findFile(INSTALLER_NAME);
  if (existsSync(installerPath)) {
    const s = statSync(installerPath);
    result.windows = {
      available: true,
      filename: INSTALLER_NAME,
      sizeBytes: s.size,
      sizeMB: Math.round(s.size / 1024 / 1024),
      downloadUrl: "/api/download/installer",
    };
  } else {
    result.windows = { available: false };
  }
  const apkPath = findFile(APK_NAME);
  if (existsSync(apkPath)) {
    const s = statSync(apkPath);
    result.android = {
      available: true,
      filename: APK_NAME,
      sizeBytes: s.size,
      sizeMB: Math.round(s.size / 1024 / 1024),
      downloadUrl: "/api/download/apk",
    };
  } else {
    result.android = { available: false };
  }
  Object.assign(result, result.windows);
  res.json(result);
});

export default router;
