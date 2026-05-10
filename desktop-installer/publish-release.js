#!/usr/bin/env node
// Uploads the release archive (and its SHA256SUMS.txt) to a remote distribution
// channel immediately after pack:release produces it.
//
// Usage:
//   node publish-release.js        # uploads the 64-bit archive
//   node publish-release.js 32     # uploads the 32-bit archive
//
// Upload target is selected by the RELEASE_UPLOAD_TARGET environment variable:
//
//   s3   — Amazon S3 (or S3-compatible) via the `aws` CLI
//   sftp — SFTP server via the `sftp` CLI
//   http — HTTP/HTTPS PUT via Node's built-in https module
//
// See BUILD.md (§ Publishing a Release) for required variables per target.

'use strict';

const { existsSync, readFileSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const https = require('https');
const http = require('http');

// ---------------------------------------------------------------------------
// Resolve files to upload
// ---------------------------------------------------------------------------

const arch = process.argv[2] || '64';
const is32 = arch === '32';
const distDir = is32 ? 'dist-32' : 'dist';
const archiveName = is32
  ? 'AlSalikPOS-Installer-32.tar.gz'
  : 'AlSalikPOS-Installer.tar.gz';
const checksumName = 'SHA256SUMS.txt';
const signatureName = 'SHA256SUMS.txt.asc';

const archivePath = archiveName;
const checksumPath = path.join(distDir, checksumName);
const signaturePath = path.join(distDir, signatureName);

if (!existsSync(archivePath)) {
  console.error(
    `publish-release.js: archive not found: "${archivePath}"\n` +
      `Run "npm run pack:release${is32 ? '-32' : ''}" first.`
  );
  process.exit(1);
}

if (!existsSync(checksumPath)) {
  console.error(
    `publish-release.js: checksum file not found: "${checksumPath}"\n` +
      `Run "npm run build:installer${is32 ? '-32' : ''}" first.`
  );
  process.exit(1);
}

const filesToUpload = [
  { local: archivePath, name: archiveName },
  { local: checksumPath, name: checksumName },
];

if (existsSync(signaturePath)) {
  filesToUpload.push({ local: signaturePath, name: signatureName });
  console.log('Including GPG signature: SHA256SUMS.txt.asc');
}

// ---------------------------------------------------------------------------
// Read config — environment variables take precedence over publish-config.json
// ---------------------------------------------------------------------------

let fileConfig = {};
const configFile = path.join(__dirname, 'publish-config.json');
if (existsSync(configFile)) {
  try {
    fileConfig = JSON.parse(readFileSync(configFile, 'utf8'));
  } catch (e) {
    console.warn(`publish-release.js: could not parse publish-config.json: ${e.message}`);
  }
}

function cfg(key) {
  return process.env[key] || fileConfig[key] || '';
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

function runCmd(cmd, args, opts = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command exited with status ${result.status}`);
  }
}

function uploadS3(files) {
  const bucket = cfg('RELEASE_S3_BUCKET');
  const prefix = cfg('RELEASE_S3_PREFIX').replace(/\/$/, '');
  const endpoint = cfg('RELEASE_S3_ENDPOINT');
  const publicBaseUrl = cfg('RELEASE_S3_PUBLIC_BASE_URL').replace(/\/$/, '');

  if (!bucket) {
    console.error(
      'publish-release.js [s3]: RELEASE_S3_BUCKET is not set.\n' +
        'Set it to your S3 bucket name, e.g. "my-releases-bucket".'
    );
    process.exit(1);
  }

  const endpointArgs = endpoint ? ['--endpoint-url', endpoint] : [];

  for (const { local, name } of files) {
    const dest = prefix ? `s3://${bucket}/${prefix}/${name}` : `s3://${bucket}/${name}`;
    console.log(`  Uploading ${name} → ${dest}`);
    runCmd('aws', ['s3', 'cp', local, dest, '--no-progress', ...endpointArgs]);
  }

  const s3Base = endpoint
    ? `${endpoint.replace(/\/$/, '')}/${bucket}${prefix ? '/' + prefix : ''}`
    : `https://${bucket}.s3.amazonaws.com${prefix ? '/' + prefix : ''}`;
  const downloadBase = publicBaseUrl || s3Base;

  console.log(`\nFiles published to: ${s3Base}/`);
  console.log(`\nDownload link: ${downloadBase}/${archiveName}`);
  if (publicBaseUrl) {
    console.log(`  (using RELEASE_S3_PUBLIC_BASE_URL — CloudFront/custom domain)`);
  }
}

function uploadSftp(files) {
  const host = cfg('RELEASE_SFTP_HOST');
  const user = cfg('RELEASE_SFTP_USER');
  const remotePath = cfg('RELEASE_SFTP_PATH').replace(/\/$/, '');
  const keyFile = cfg('RELEASE_SFTP_KEY');
  const port = cfg('RELEASE_SFTP_PORT') || '22';

  if (!host || !user || !remotePath) {
    console.error(
      'publish-release.js [sftp]: RELEASE_SFTP_HOST, RELEASE_SFTP_USER, and\n' +
        'RELEASE_SFTP_PATH must all be set.'
    );
    process.exit(1);
  }

  const keyArgs = keyFile ? ['-i', keyFile] : [];
  const portArgs = ['-P', port];
  const sshOpts = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes'];

  // Build a batch file of sftp commands piped via stdin
  const batchLines = files
    .map(({ local, name }) => {
      const localAbs = path.resolve(__dirname, local);
      return `put "${localAbs}" "${remotePath}/${name}"`;
    })
    .join('\n');

  console.log(`  SFTP batch:\n${batchLines.split('\n').map(l => '    ' + l).join('\n')}`);

  const result = spawnSync(
    'sftp',
    [...sshOpts, ...keyArgs, ...portArgs, `${user}@${host}`],
    {
      input: batchLines + '\nbye\n',
      stdio: ['pipe', 'inherit', 'inherit'],
      encoding: 'utf8',
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sftp exited with status ${result.status}`);
  }

  const publicUrl = cfg('RELEASE_SFTP_PUBLIC_URL').replace(/\/$/, '');

  console.log(`\nFiles published to: sftp://${user}@${host}${remotePath}/`);
  if (publicUrl) {
    console.log(`\nDownload link: ${publicUrl}/${archiveName}`);
  } else {
    console.log(`\n(Set RELEASE_SFTP_PUBLIC_URL to print a shareable download link.)`);
  }
}

function uploadHttp(files) {
  const baseUrl = cfg('RELEASE_HTTP_URL').replace(/\/$/, '');
  const bearer = cfg('RELEASE_HTTP_BEARER');

  if (!baseUrl) {
    console.error(
      'publish-release.js [http]: RELEASE_HTTP_URL is not set.\n' +
        'Set it to the base URL that accepts HTTP PUT requests,\n' +
        'e.g. "https://my-server.example.com/releases/v1.0.0".'
    );
    process.exit(1);
  }

  function putFile({ local, name }) {
    return new Promise((resolve, reject) => {
      const fileData = readFileSync(local);
      const url = new URL(`${baseUrl}/${name}`);
      const transport = url.protocol === 'https:' ? https : http;

      const headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileData.length,
      };
      if (bearer) headers['Authorization'] = `Bearer ${bearer}`;

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'PUT',
          headers,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`  ✓ ${name} → HTTP ${res.statusCode}`);
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode} for ${name}: ${body.slice(0, 200)}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(fileData);
      req.end();
    });
  }

  async function run() {
    for (const file of files) {
      console.log(`  Uploading ${file.name} → ${baseUrl}/${file.name}`);
      await putFile(file);
    }
    console.log(`\nFiles published to: ${baseUrl}/`);
    console.log(`\nDownload link: ${baseUrl}/${archiveName}`);
  }

  return run();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const target = (cfg('RELEASE_UPLOAD_TARGET') || '').toLowerCase();

  if (!target) {
    console.error(
      'publish-release.js: RELEASE_UPLOAD_TARGET is not set.\n' +
        'Supported values: s3 | sftp | http\n' +
        'Set the variable in your shell or in desktop-installer/publish-config.json.'
    );
    process.exit(1);
  }

  console.log(`Publishing release archive (${arch}-bit) via ${target}…`);
  console.log(
    `  Files: ${filesToUpload.map((f) => f.name).join(', ')}\n`
  );

  try {
    if (target === 's3') {
      uploadS3(filesToUpload);
    } else if (target === 'sftp') {
      uploadSftp(filesToUpload);
    } else if (target === 'http') {
      await uploadHttp(filesToUpload);
    } else {
      console.error(
        `publish-release.js: unknown target "${target}".\n` +
          'Supported values: s3 | sftp | http'
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`\npublish-release.js: upload failed — ${err.message}`);
    process.exit(1);
  }

  console.log('\nRelease published successfully.');
}

main();
