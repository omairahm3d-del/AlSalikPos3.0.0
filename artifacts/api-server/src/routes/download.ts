import { Router, type IRouter } from "express";
import { createReadStream, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const router: IRouter = Router();

const INSTALLER_PATH = resolve(
  process.cwd(),
  "../../desktop-installer/dist/Al Salik POS Setup 1.0.0.exe",
);

router.get("/download/installer", (req, res) => {
  if (!existsSync(INSTALLER_PATH)) {
    req.log.error({ path: INSTALLER_PATH }, "Installer file not found");
    res.status(404).json({ error: "Installer not found" });
    return;
  }

  const stat = statSync(INSTALLER_PATH);
  const filename = "Al Salik POS Setup 1.0.0.exe";

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  res.setHeader("Content-Length", stat.size.toString());
  res.setHeader("Cache-Control", "no-cache");

  const stream = createReadStream(INSTALLER_PATH);
  stream.on("error", (err) => {
    req.log.error({ err }, "Error streaming installer");
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
});

router.get("/download/info", (req, res) => {
  if (!existsSync(INSTALLER_PATH)) {
    res.status(404).json({ available: false });
    return;
  }
  const stat = statSync(INSTALLER_PATH);
  res.json({
    available: true,
    filename: "Al Salik POS Setup 1.0.0.exe",
    sizeBytes: stat.size,
    sizeMB: Math.round(stat.size / 1024 / 1024),
    downloadUrl: "/api/download/installer",
  });
});

export default router;
