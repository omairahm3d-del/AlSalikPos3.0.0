import { Router, type IRouter } from "express";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const router: IRouter = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Locate a file inside desktop-installer/dist relative to THIS compiled file.
 * Tries both dev (src/routes/) and production (dist/) __dirname depths.
 */
function findFile(filename: string): string {
  const candidates = [
    resolve(__dirname, "../../../desktop-installer/dist", filename),
    resolve(__dirname, "../../../../desktop-installer/dist", filename),
  ];
  return candidates.find(existsSync) ?? candidates[0];
}

const INSTALLER_NAME = "Al Salik POS Setup 1.0.0.exe";
const APK_NAME = "Al Salik POS.apk";

/**
 * Static URLs — served directly by the admin static file handler in production.
 * This avoids streaming large files through the API proxy (which times out).
 */
const INSTALLER_STATIC_URL = "/admin/AlSalikPOS-Setup-1.0.0.exe";
const APK_STATIC_URL = "/admin/AlSalikPOS.apk";

router.get("/download/installer", (req, res) => {
  res.redirect(302, INSTALLER_STATIC_URL);
});

router.get("/download/apk", (req, res) => {
  res.redirect(302, APK_STATIC_URL);
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
      downloadUrl: INSTALLER_STATIC_URL,
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
      downloadUrl: APK_STATIC_URL,
    };
  } else {
    result.android = { available: false };
  }
  Object.assign(result, result.windows);
  res.json(result);
});

export default router;
