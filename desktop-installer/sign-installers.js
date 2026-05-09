#!/usr/bin/env node
// Calls sign-exe.sh for the installer EXE whose filename is derived from the
// version in package.json — so the signing step stays correct after version bumps.
//
// Usage:
//   node sign-installers.js        # signs the 64-bit installer
//   node sign-installers.js 32     # signs the 32-bit installer

'use strict';

const { execSync } = require('child_process');
const { version } = require('./package.json');

const arch = process.argv[2] || '64';

const exePath =
  arch === '32'
    ? `dist-32/Al Salik POS Setup ${version} (32-bit).exe`
    : `dist/Al Salik POS Setup ${version}.exe`;

execSync(`bash sign-exe.sh "${exePath}"`, { stdio: 'inherit' });
