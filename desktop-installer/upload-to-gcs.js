#!/usr/bin/env node
// Uploads installer EXEs and APK to GCS using Replit object storage sidecar auth.
// Usage: node upload-to-gcs.js

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SIDECAR = 'http://127.0.0.1:1106';
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;

if (!BUCKET_ID) {
  console.error('DEFAULT_OBJECT_STORAGE_BUCKET_ID env var not set');
  process.exit(1);
}

const FILES = [
  {
    local: path.join(__dirname, 'dist', 'Al Salik POS Setup 2.0.0.exe'),
    gcsPath: 'public/releases/AlSalikPOS-Setup-2.0.0.exe',
    contentType: 'application/octet-stream',
    label: 'Windows 64-bit installer',
  },
  {
    local: path.join(__dirname, 'dist-32', 'Al Salik POS Setup 2.0.0 (32-bit).exe'),
    gcsPath: 'public/releases/AlSalikPOS-Setup-2.0.0-32bit.exe',
    contentType: 'application/octet-stream',
    label: 'Windows 32-bit installer',
  },
  {
    local: path.join(__dirname, 'dist', 'AlSalikPOS-2.0.0.apk'),
    gcsPath: 'public/releases/AlSalikPOS.apk',
    contentType: 'application/vnd.android.package-archive',
    label: 'Android APK',
  },
];

function fetch_json(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? https : http;
    const body = opts.body ? Buffer.from(opts.body) : null;
    const headers = { ...(opts.headers || {}) };
    if (body) headers['Content-Length'] = body.length;

    const req = transport.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const resp = await fetch_json(`${SIDECAR}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audience: 'https://storage.googleapis.com/',
      scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
    }),
  });
  const tok = resp.body.access_token ?? resp.body.token;
  if (!tok) throw new Error('No token in sidecar response: ' + JSON.stringify(resp.body));
  return tok;
}

function initiateResumableUpload(token, gcsPath, contentType, fileSize) {
  return new Promise((resolve, reject) => {
    const encodedName = encodeURIComponent(gcsPath);
    const url = new URL(
      `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_ID}/o?uploadType=resumable&name=${encodedName}`
    );
    const bodyJson = JSON.stringify({ name: gcsPath, contentType });
    const bodyBuf = Buffer.from(bodyJson);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': bodyBuf.length,
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': fileSize,
      },
    }, (res) => {
      if (res.statusCode === 200) {
        resolve(res.headers.location);
      } else {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => reject(new Error(`Initiate resumable upload failed ${res.statusCode}: ${d.slice(0, 300)}`)));
      }
    });
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

function uploadFileToResumableUrl(sessionUrl, localPath, contentType, fileSize) {
  return new Promise((resolve, reject) => {
    const url = new URL(sessionUrl);
    const stream = fs.createReadStream(localPath);

    let uploaded = 0;
    let lastPct = 0;

    stream.on('data', (chunk) => {
      uploaded += chunk.length;
      const pct = Math.floor((uploaded / fileSize) * 100);
      if (pct >= lastPct + 10) {
        process.stdout.write(`\r  Progress: ${pct}%`);
        lastPct = pct;
      }
    });

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileSize,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        process.stdout.write('\r  Progress: 100%\n');
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Upload PUT failed ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    stream.pipe(req);
  });
}

async function uploadFile(file, token) {
  const stat = fs.statSync(file.local);
  const fileSize = stat.size;

  console.log(`\n[${file.label}]`);
  console.log(`  Local: ${file.local}`);
  console.log(`  GCS:   ${file.gcsPath}`);
  console.log(`  Size:  ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Initiating resumable upload...`);

  const sessionUrl = await initiateResumableUpload(token, file.gcsPath, file.contentType, fileSize);
  console.log(`  Uploading...`);
  const result = await uploadFileToResumableUrl(sessionUrl, file.local, file.contentType, fileSize);
  console.log(`  Done! GCS name: ${result.name}, size: ${result.size} bytes`);
  return result;
}

async function main() {
  console.log('Al Salik POS — GCS Release Uploader');
  console.log(`Bucket: ${BUCKET_ID}`);

  let token;
  try {
    token = await getToken();
    console.log('Got GCS access token from sidecar.');
  } catch (err) {
    console.error('Failed to get token:', err.message);
    process.exit(1);
  }

  const results = [];
  for (const file of FILES) {
    if (!fs.existsSync(file.local)) {
      console.warn(`\n[SKIP] File not found: ${file.local}`);
      continue;
    }
    try {
      const r = await uploadFile(file, token);
      results.push({ label: file.label, gcsPath: file.gcsPath, ok: true, size: r.size });
    } catch (err) {
      console.error(`\n[ERROR] ${file.label}: ${err.message}`);
      results.push({ label: file.label, gcsPath: file.gcsPath, ok: false, error: err.message });
    }
  }

  console.log('\n=== Upload Summary ===');
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`${icon} ${r.label}: ${r.ok ? r.gcsPath + ' (' + (r.size / 1024 / 1024).toFixed(1) + ' MB)' : r.error}`);
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} upload(s) failed.`);
    process.exit(1);
  }

  console.log('\nAll uploads complete.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
