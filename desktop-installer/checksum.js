#!/usr/bin/env node
// Generates a SHA-256 checksum file alongside the installer EXE, then
// optionally signs it with GPG to prove authenticity.
//
// Usage:
//   node checksum.js        # checksums the 64-bit installer
//   node checksum.js 32     # checksums the 32-bit installer
//
// Output: SHA256SUMS.txt (and SHA256SUMS.txt.asc when GPG is configured)
// in the same directory as the installer EXE.
// Format: "<hash>  <filename>" (compatible with sha256sum -c on Linux/macOS).
//
// GPG signing is controlled by environment variables:
//   GPG_KEY_ID   — Key fingerprint or email used to sign (required to enable signing)
//   GPG_PASSPHRASE — Passphrase for the key (optional; omit if the key has no passphrase
//                    or if gpg-agent is already unlocked)
//
// When GPG_KEY_ID is not set, signing is skipped gracefully and a notice is printed.
//
// Each run appends a fresh entry for the current EXE. If an entry for the same
// filename already exists (e.g. from a previous build), it is replaced so the
// file never accumulates stale hashes.

'use strict';

const { createHash } = require('crypto');
const { readFileSync, writeFileSync, existsSync, unlinkSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { version } = require('./package.json');

const arch = process.argv[2] || '64';

const exeDir = arch === '32' ? 'dist-32' : 'dist';
const exeName =
  arch === '32'
    ? `Al Salik POS Setup ${version} (32-bit).exe`
    : `Al Salik POS Setup ${version}.exe`;

const exePath = path.join(exeDir, exeName);
const checksumPath = path.join(exeDir, 'SHA256SUMS.txt');
const signaturePath = `${checksumPath}.asc`;

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

// --- GPG signing -----------------------------------------------------------

const gpgKeyId = process.env.GPG_KEY_ID;

if (!gpgKeyId) {
  console.log(
    'GPG signing skipped — set GPG_KEY_ID to enable (see BUILD.md for details).'
  );
  process.exit(0);
}

// Remove any stale signature so gpg doesn't prompt to overwrite.
if (existsSync(signaturePath)) {
  unlinkSync(signaturePath);
}

// Build the gpg argument list.
// --batch + --yes ensures non-interactive operation in CI environments.
// --pinentry-mode loopback allows passphrase injection via --passphrase-fd.
const gpgArgs = [
  '--batch',
  '--yes',
  '--armor',
  '--detach-sign',
  '--local-user', gpgKeyId,
];

const gpgPassphrase = process.env.GPG_PASSPHRASE;

if (gpgPassphrase) {
  // Feed the passphrase through stdin (fd 0) to avoid it appearing in
  // the process list or shell history.
  gpgArgs.push('--pinentry-mode', 'loopback');
  gpgArgs.push('--passphrase-fd', '0');
  gpgArgs.push(checksumPath);

  const result = spawnSync('gpg', gpgArgs, {
    input: gpgPassphrase + '\n',
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  if (result.status !== 0) {
    console.error(
      `checksum.js: gpg signing failed (exit ${result.status}). ` +
      'Check that GPG_KEY_ID is correct and the key is available in the keyring.'
    );
    process.exit(result.status || 1);
  }
} else {
  // No passphrase supplied — rely on gpg-agent or a passphrase-less key.
  gpgArgs.push(checksumPath);

  const result = spawnSync('gpg', gpgArgs, {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(
      `checksum.js: gpg signing failed (exit ${result.status}). ` +
      'Check that GPG_KEY_ID is correct and the key is available in the keyring.'
    );
    process.exit(result.status || 1);
  }
}

console.log(`GPG detached signature written to ${signaturePath}`);
