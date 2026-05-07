import { cpSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "dist/public");
const srcDir = resolve(__dirname, "../../desktop-installer/dist");

mkdirSync(distDir, { recursive: true });

const files = [
  ["Al Salik POS Setup 1.0.0.exe", "AlSalikPOS-Setup-1.0.0.exe"],
  ["Al Salik POS.apk", "AlSalikPOS.apk"],
];

for (const [src, dst] of files) {
  const srcPath = resolve(srcDir, src);
  const dstPath = resolve(distDir, dst);
  if (existsSync(srcPath)) {
    cpSync(srcPath, dstPath);
    console.log(`Copied: ${dst}`);
  } else {
    console.log(`Skipped: ${dst} (not found at ${srcPath})`);
  }
}
