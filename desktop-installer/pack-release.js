#!/usr/bin/env node
// Packages the installer EXE + SHA256SUMS.txt (and SHA256SUMS.txt.asc when
// present) into a distributable tar.gz archive.
//
// Usage:
//   node pack-release.js        # packages the 64-bit installer
//   node pack-release.js 32     # packages the 32-bit installer
//
// Output:
//   AlSalikPOS-Installer.tar.gz        (64-bit, written to desktop-installer/)
//   AlSalikPOS-Installer-32.tar.gz     (32-bit, written to desktop-installer/)
//
// Contents of the archive:
//   Al Salik POS Setup <version>.exe          installer executable
//   SHA256SUMS.txt                            SHA-256 checksum file
//   SHA256SUMS.txt.asc   (when GPG-signed)   detached GPG signature

'use strict';

const { existsSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { version } = require('./package.json');

const arch = process.argv[2] || '64';

const is32 = arch === '32';
const distDir = is32 ? 'dist-32' : 'dist';
const exeName = is32
  ? `Al Salik POS Setup ${version} (32-bit).exe`
  : `Al Salik POS Setup ${version}.exe`;
const archiveName = is32
  ? 'AlSalikPOS-Installer-32.tar.gz'
  : 'AlSalikPOS-Installer.tar.gz';

const exePath = path.join(distDir, exeName);
const checksumPath = path.join(distDir, 'SHA256SUMS.txt');
const signaturePath = path.join(distDir, 'SHA256SUMS.txt.asc');

if (!existsSync(exePath)) {
  console.error(
    `pack-release.js: installer not found: "${exePath}"\n` +
      `Run "npm run build:installer${is32 ? '-32' : ''}" first.`
  );
  process.exit(1);
}

if (!existsSync(checksumPath)) {
  console.error(
    `pack-release.js: checksum file not found: "${checksumPath}"\n` +
      `Run "npm run build:installer${is32 ? '-32' : ''}" first.`
  );
  process.exit(1);
}

const filesToPack = [exeName, 'SHA256SUMS.txt'];

if (existsSync(signaturePath)) {
  filesToPack.push('SHA256SUMS.txt.asc');
  console.log('Including GPG signature: SHA256SUMS.txt.asc');
}

// tar -czf <archive> -C <distDir> <file1> <file2> ...
const tarArgs = ['-czf', archiveName, '-C', distDir, ...filesToPack];

console.log(`Packaging ${archiveName}...`);
console.log(`  Contents: ${filesToPack.join(', ')}`);

const result = spawnSync('tar', tarArgs, { stdio: 'inherit', encoding: 'utf8' });

if (result.status !== 0) {
  console.error(`pack-release.js: tar failed (exit ${result.status}).`);
  process.exit(result.status || 1);
}

console.log(`\nRelease archive created: ${archiveName}`);
console.log(
  `Distribute this file alongside your download page so recipients have ` +
    `the installer and its checksum in one download.`
);
