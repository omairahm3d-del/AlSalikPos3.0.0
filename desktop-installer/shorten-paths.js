#!/usr/bin/env node
/**
 * Post-export step: shorten the very long pnpm directory names that Expo
 * dumps under www/assets/__node_modules/.pnpm/. On Windows MAX_PATH = 260,
 * and "C:\Program Files\Al Salik Computers\Al Salik POS\resources\app\www\
 * assets\__node_modules\.pnpm\@expo+vector-icons@15.1.1_..._<32 hex>\
 * node_modules\@expo\vector-icons\build\vendor\react-native-vector-icons\
 * Fonts\<font>.ttf" easily exceeds 300 chars and the NSIS installer fails
 * with "Error opening file for writing".
 *
 * Strategy: pick a SHORT alias for each long pnpm dir, rename it on disk,
 * and rewrite all string references inside .js / .css / .html / .json /
 * .map files that ship in www/.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WWW = path.join(__dirname, "www");
const PNPM = path.join(WWW, "assets", "__node_modules", ".pnpm");
const MAX_NAME = 32; // dir names longer than this get aliased

if (!fs.existsSync(PNPM)) {
  console.log("[shorten-paths] no pnpm dir found at", PNPM);
  process.exit(0);
}

function shortAlias(name) {
  // keep human-readable prefix + hash for uniqueness
  const safePrefix = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase();
  const hash = crypto.createHash("md5").update(name).digest("hex").slice(0, 8);
  return `_${safePrefix}_${hash}`; // e.g. _expovect_2740e675
}

const entries = fs.readdirSync(PNPM, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.length > MAX_NAME);

if (entries.length === 0) {
  console.log("[shorten-paths] no long pnpm dirs to shorten (continuing to file pass)");
}

const renames = []; // { from, to, fromName, toName }
for (const d of entries) {
  const newName = shortAlias(d.name);
  const from = path.join(PNPM, d.name);
  const to = path.join(PNPM, newName);
  if (fs.existsSync(to)) {
    console.log("[shorten-paths] target exists, skipping:", newName);
    continue;
  }
  fs.renameSync(from, to);
  renames.push({ from, to, fromName: d.name, toName: newName });
  console.log(`[shorten-paths] ${d.name.length} -> ${newName.length}: ${d.name} => ${newName}`);
}

// Rewrite references in text-like files across www/
const TEXT_EXTS = new Set([".js", ".mjs", ".cjs", ".html", ".htm", ".css", ".json", ".map", ".txt"]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

let touched = 0;
let totalReplacements = 0;
for (const file of walk(WWW)) {
  let content;
  try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
  let changed = false;
  let count = 0;
  for (const r of renames) {
    if (content.includes(r.fromName)) {
      // simple global string replace
      const before = content.length;
      content = content.split(r.fromName).join(r.toName);
      const replacedNow = (before - content.length) / Math.max(1, r.fromName.length - r.toName.length);
      count += Math.round(replacedNow);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, content);
    touched++;
    totalReplacements += count;
  }
}

console.log(`[shorten-paths] rewrote ${touched} files (${totalReplacements} total replacements)`);

// Second pass: shorten very long asset filenames (typically <name>.<32hex>.<ext>).
// We compress the 32-hex segment to 8 hex chars. This shaves ~24 chars off
// every Expo-fingerprinted asset filename and keeps the worst-case Windows
// install path comfortably under 260 chars.
const fileRenames = []; // { from, to, fromBase, toBase }
function* walkAll(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkAll(full);
    else if (entry.isFile()) yield full;
  }
}
// Matches both "name.<hash>.ext" (Expo asset fingerprint) and
// "name-<hash>.ext" (Expo bundle/chunk fingerprint).
const HASH_RE_DOT = /^(.+?)\.([0-9a-f]{16,})\.([^.]+)$/;
const HASH_RE_DASH = /^(.+?)-([0-9a-f]{16,})\.([^.]+)$/;
for (const file of walkAll(WWW)) {
  const base = path.basename(file);
  let m = HASH_RE_DOT.exec(base);
  let sep = ".";
  if (!m) { m = HASH_RE_DASH.exec(base); sep = "-"; }
  if (!m) continue;
  if (base.length <= 24) continue;
  const [, stem, hash, ext] = m;
  const newBase = `${stem}${sep}${hash.slice(0, 8)}.${ext}`;
  if (newBase === base) continue;
  const newFile = path.join(path.dirname(file), newBase);
  if (fs.existsSync(newFile)) continue;
  fs.renameSync(file, newFile);
  fileRenames.push({ from: file, to: newFile, fromBase: base, toBase: newBase });
}
console.log(`[shorten-paths] shortened ${fileRenames.length} asset filenames`);

// Rewrite references for renamed asset files
let touched2 = 0;
for (const file of walkAll(WWW)) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXTS.has(ext)) continue;
  let content;
  try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
  let changed = false;
  for (const r of fileRenames) {
    if (content.includes(r.fromBase)) {
      content = content.split(r.fromBase).join(r.toBase);
      changed = true;
    }
  }
  if (changed) { fs.writeFileSync(file, content); touched2++; }
}
console.log(`[shorten-paths] rewrote ${touched2} files for asset renames`);

// Save mapping for debugging
fs.writeFileSync(path.join(PNPM, "_aliases.json"),
  JSON.stringify(renames.map((r) => ({ from: r.fromName, to: r.toName })), null, 2));
