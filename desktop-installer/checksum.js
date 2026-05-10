#!/usr/bin/env node
// Generates a SHA-256 checksum file alongside the installer EXE.
//
// Usage:
//   node checksum.js        # checksums the 64-bit installer
//   node checksum.js 32     # checksums the 32-bit installer
//
// Output: SHA256SUMS.txt in the same directory as the installer EXE.
// Format: "<hash>  <filename>" (compatible with sha256sum -c on Linux/macOS).
//
// Each run appends a fresh entry for the current EXE. If an entry for the same
// filename already exists (e.g. from a previous build), it is replaced so the
// file never accumulates stale hashes.

'use strict';

const { createHash } = require('crypto');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');
const { version } = require('./package.json');

const arch = process.argv[2] || '64';

const exeDir = arch === '32' ? 'dist-32' : 'dist';
const exeName =
  arch === '32'
    ? `Al Salik POS Setup ${version} (32-bit).exe`
    : `Al Salik POS Setup ${version}.exe`;

const exePath = path.join(exeDir, exeName);
const checksumPath = path.join(exeDir, 'SHA256SUMS.txt');

let fileData;
try {
  fileData = readFileSync(exePath);
} catch (err) {
  console.error(`checksum.js: cannot read "${exePath}": ${err.message}`);
  process.exit(1);
}

const hash = createHash('sha256').update(fileData).digest('hex');
const newLine = `${hash}  ${exeName}\n`;

// Read existing entries (if any) and drop the stale entry for this filename
// so rebuilds don't accumulate duplicate lines.
let existing = '';
if (existsSync(checksumPath)) {
  existing = readFileSync(checksumPath, 'utf8');
}
const filtered = existing
  .split('\n')
  .filter((l) => l.trim() !== '' && !l.endsWith(`  ${exeName}`))
  .join('\n');

const content = filtered.length > 0 ? `${filtered}\n${newLine}` : newLine;
writeFileSync(checksumPath, content, 'utf8');

console.log(`SHA-256 checksum written to ${checksumPath}`);
console.log(newLine.trimEnd());
