# Al Salik POS — Windows Installer Build Guide

**Software Provider:** Al Salik Computers  
**Product:** Al Salik POS v1.0.0

---

## Editions

| Edition | Target | Electron | File |
|---------|--------|----------|------|
| **64-bit** | Windows 10 / 11 (x64) | 33.x | `dist\Al Salik POS Setup 1.0.0.exe` |
| **32-bit** | Windows 7 SP1+ / 10 / 11 (x86) | 22.3.27 | `dist-32\Al Salik POS Setup 1.0.0 (32-bit).exe` |

> **Windows 7 note:** Requires Windows 7 **Service Pack 1** with the **Platform Update** (KB2670838).  
> Install KB2670838 from Windows Update before running the app.

---

## Prerequisites

Install on your build machine (Linux, macOS, or Windows):

1. **Node.js** v18 or later — https://nodejs.org
2. **pnpm** — `npm install -g pnpm`

---

## Step 1 — Set the API Server URL

Open `api-config.json` and set `apiBase` to your deployed API server:

```json
{
  "apiBase": "https://your-replit-app.replit.app"
}
```

This file is installed next to the app executable. After editing it, restart the app — no reinstall needed.

---

## Step 2 — Add Branding Assets

Place the following files in the `assets/` folder before building:

| File | Size | Description |
|------|------|-------------|
| `icon.ico` | 256×256 | Windows taskbar / desktop icon (ICO format) |
| `icon.png` | 512×512 | About dialog icon |

Convert PNG to ICO with ImageMagick: `magick icon.png -resize 256x256 icon.ico`

---

## Step 3 — Install Dependencies

```bash
cd desktop-installer
npm install
```

---

## Step 4A — Build 64-bit Installer (Windows 10/11)

```bash
# 1. Export Expo web build (run once, shared by both editions)
npm run export-web

# 2. Stage web files into Electron package + build 64-bit Electron binary
npm run build:win
npm run rebuild-web

# 3. Build installer
npm run build:installer
```

Output: `dist\Al Salik POS Setup 1.0.0.exe`

---

## Step 4B — Build 32-bit Installer (Windows 7 SP1+)

```bash
# 1. Export Expo web build (skip if already done in Step 4A)
npm run export-web

# 2. Stage and build — downloads Electron 22 ia32 automatically
npm run build:all-32
```

Or step-by-step:

```bash
npm run build:win7-32      # Downloads Electron 22 ia32, creates dist-32/win-ia32-unpacked/
npm run rebuild-web-32     # Copies web assets into the Electron package
npm run build:installer-32 # Runs NSIS to produce the .exe
```

Output: `dist-32\Al Salik POS Setup 1.0.0 (32-bit).exe`

> **First run:** electron-builder will download Electron 22.3.27 for Windows ia32 (~80 MB).
> It caches automatically so subsequent builds are fast.

---

## Build Both Editions at Once

```bash
npm run export-web
npm run build:win && npm run rebuild-web && npm run build:installer
npm run build:all-32
```

---

## Updating the Web UI (no Electron rebuild needed)

When only JavaScript/UI changes have been made:

```bash
npm run export-web
npm run rebuild-web        # updates 64-bit package
npm run rebuild-web-32     # updates 32-bit package
npm run build:installer    # rebuild 64-bit .exe
npm run build:installer-32 # rebuild 32-bit .exe
```

---

## Updating the Version

Edit the `"version"` field in **`package.json`** only — that is the single source of truth:

```json
"version": "1.1.0"
```

The `build:installer` and `build:installer-32` scripts automatically pass the version to
NSIS at compile time via a `/D` flag, so `installer.nsi` and `installer-32.nsi` never
need to be touched. Both NSIS scripts will fail with a clear error if invoked directly
without the flag (i.e. without going through `npm run build:installer`).

---

## Code Signing (Removing the "Unknown Publisher" Warning)

Unsigned installers trigger a blue SmartScreen warning on every clean Windows install.
To remove this warning, both the inner Electron executable **and** the NSIS Setup EXE must
be signed with a trusted Extended Validation (EV) or OV code-signing certificate.

### Obtaining a Certificate

Purchase an OV or EV code-signing certificate from a Microsoft-approved CA, for example:

- **Sectigo** — https://sectigo.com/ssl-certificates-tls/code-signing
- **DigiCert** — https://www.digicert.com/signing/code-signing-certificates
- **SSL.com** — https://www.ssl.com/certificates/ev-code-signing/

The CA will issue a `.pfx` (PKCS#12) file containing both the certificate and the private key,
protected by a password you set during enrollment.

> **EV certificates** (hardware tokens) give immediate SmartScreen reputation.  
> **OV certificates** suppress the "Unknown Publisher" warning but may still show SmartScreen  
> until the file builds enough reputation.

---

### Environment Variables

| Variable | Description |
|---|---|
| `WIN_CSC_LINK` | Absolute path to the `.pfx` file, **or** the file's contents base64-encoded with the prefix `base64,` |
| `WIN_CSC_KEY_PASSWORD` | Password that protects the `.pfx` file |
| `WIN_SIGN_TIMESTAMP_URL` | *(optional)* RFC 3161 timestamp server. Default: `http://timestamp.digicert.com` |
| `WIN_SIGN_DESCRIPTION` | *(optional)* Product name embedded in the signature. Default: `Al Salik POS` |
| `WIN_SIGN_URL` | *(optional)* Publisher URL embedded in the signature. Default: `https://alsalikcomputers.com` |

Set these in your shell before building:

```bash
export WIN_CSC_LINK="/path/to/alsalik-codesign.pfx"
export WIN_CSC_KEY_PASSWORD="your-pfx-password"
```

Or store them as CI/CD secrets (GitHub Actions, GitLab CI, etc.) and inject them at build time.

---

### What Gets Signed

| Step | Tool | What is signed |
|---|---|---|
| `build:win` / `build:win7-32` | electron-builder | `Al Salik POS.exe` inside the unpacked directory |
| `build:installer` | `sign-exe.sh` → `osslsigncode` | `dist\Al Salik POS Setup <version>.exe` |
| `build:installer-32` | `sign-exe.sh` → `osslsigncode` | `dist-32\Al Salik POS Setup <version> (32-bit).exe` |

`electron-builder` reads `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` automatically to sign
the inner executable. The `sign-exe.sh` script signs the NSIS-generated Setup EXE
immediately after NSIS finishes. Both steps are skipped gracefully when the variables are
not set, so unsigned development builds continue to work with no changes.

> **Note on `signAndEditExecutable: false`** in `desktop-installer/package.json`:  
> This tells electron-builder to **sign** the Electron EXE but **not** rewrite its PE
> version resource headers. The setting suppresses PE header editing only — signing via
> `WIN_CSC_LINK` still occurs normally. It was set to preserve the original PE headers
> embedded by the Electron build toolchain.

---

### Installing `osslsigncode` (Linux build machines)

`osslsigncode` is required on Linux to sign the NSIS installer EXE.

```bash
# Debian / Ubuntu
sudo apt-get install -y osslsigncode

# Fedora / RHEL
sudo dnf install -y osslsigncode

# macOS
brew install osslsigncode
```

On Windows (native builds), replace `osslsigncode` with Microsoft's `signtool.exe`
from the Windows SDK — edit `sign-exe.sh` accordingly or sign the file manually after
the build completes.

---

### Verifying the Signature

After a signed build, verify from any Linux/macOS machine:

```bash
osslsigncode verify "dist/Al Salik POS Setup 1.0.0.exe"
```

On Windows:

```powershell
Get-AuthenticodeSignature "dist\Al Salik POS Setup 1.0.0.exe" | Select-Object Status, SignerCertificate
```

A valid signature returns `Valid` / `HashMismatch` will not appear.

---

## Verifying a Download with SHA-256 Checksums

Every `build:installer` / `build:installer-32` run writes a `SHA256SUMS.txt` file
into the same folder as the installer EXE. The file uses the standard `sha256sum`
format (`<hash>  <filename>`) so recipients can confirm the download is unaltered.

### File locations after a build

| Edition | Checksum file |
|---------|---------------|
| 64-bit  | `dist/SHA256SUMS.txt` |
| 32-bit  | `dist-32/SHA256SUMS.txt` |

### Verifying on Linux / macOS

```bash
# 64-bit
cd dist
sha256sum -c SHA256SUMS.txt

# 32-bit
cd dist-32
sha256sum -c SHA256SUMS.txt
```

A successful check prints `Al Salik POS Setup <version>.exe: OK` (or the 32-bit equivalent).

### Verifying on Windows (PowerShell)

```powershell
# 64-bit — run from the dist\ folder (replace <version> with the actual version)
$exeName  = "Al Salik POS Setup <version>.exe"
$expected = (Get-Content SHA256SUMS.txt | Where-Object { $_ -match [regex]::Escape($exeName) }).Split("  ")[0]
$actual   = (Get-FileHash $exeName -Algorithm SHA256).Hash.ToLower()
if ($actual -eq $expected) { "OK" } else { "MISMATCH — do not run this file" }
```

Replace `<version>` with the actual version number (e.g. `1.0.0`). For the 32-bit
build, use `Al Salik POS Setup <version> (32-bit).exe` and run from `dist-32\`.

### Distributing checksums

Publish `SHA256SUMS.txt` on the same page or channel where the installer is offered
(website, Teams message, file share). Recipients download it separately and run the
verification command above before installing.

---

## GPG Signing of Checksum Files

SHA256SUMS.txt proves the installer hasn't been corrupted, but it doesn't
prove who created it. A detached GPG signature (`SHA256SUMS.txt.asc`) lets
IT admins verify **both integrity and authenticity** in one step.

After each build, `checksum.js` automatically signs `SHA256SUMS.txt` when
`GPG_KEY_ID` is set. If the variable is absent, signing is skipped
gracefully — unsigned development builds continue to work unchanged.

### Environment Variables

| Variable | Description |
|---|---|
| `GPG_KEY_ID` | Key fingerprint or email address of the signing key (required to enable signing) |
| `GPG_PASSPHRASE` | Passphrase for the key. Omit if the key is passphrase-less or if `gpg-agent` is already unlocked |

Set these in your shell before building:

```bash
export GPG_KEY_ID="releases@alsalikcomputers.com"
export GPG_PASSPHRASE="your-key-passphrase"   # omit if not needed
```

Or store them as CI/CD secrets (GitHub Actions, GitLab CI, etc.) and inject
them at build time.

### Output files

| Edition | Signature file |
|---------|---------------|
| 64-bit  | `dist/SHA256SUMS.txt.asc` |
| 32-bit  | `dist-32/SHA256SUMS.txt.asc` |

Distribute `SHA256SUMS.txt` **and** `SHA256SUMS.txt.asc` together on the
same download page or channel where the installer is offered.

### Generating a Signing Key (one-time setup)

If Al Salik doesn't already have a GPG key for releases, create one on the
build machine:

```bash
gpg --full-generate-key
# Choose: RSA and RSA, 4096 bits, key does not expire
# Name:  Al Salik Computers
# Email: releases@alsalikcomputers.com
```

Export the public key so recipients can import it:

```bash
gpg --armor --export releases@alsalikcomputers.com > alsalik-releases.pub.asc
```

Publish `alsalik-releases.pub.asc` on the same page as the installer, or
upload it to a public key server:

```bash
gpg --keyserver keys.openpgp.org --send-keys <FINGERPRINT>
```

### Importing the Public Key (recipient — one-time setup)

Recipients must import the public key once before they can verify signatures.

**From a file:**

```bash
gpg --import alsalik-releases.pub.asc
```

**From a key server:**

```bash
gpg --keyserver keys.openpgp.org --recv-keys <FINGERPRINT>
```

Replace `<FINGERPRINT>` with the full 40-character key fingerprint shown
during key generation, or provided alongside the download.

### Verifying the Signature

After downloading the installer, `SHA256SUMS.txt`, and `SHA256SUMS.txt.asc`,
run the following commands:

**Step 1 — Verify the GPG signature (authenticity)**

```bash
# 64-bit
gpg --verify dist/SHA256SUMS.txt.asc dist/SHA256SUMS.txt

# 32-bit
gpg --verify dist-32/SHA256SUMS.txt.asc dist-32/SHA256SUMS.txt
```

A valid signature prints a line such as:

```
gpg: Good signature from "Al Salik Computers <releases@alsalikcomputers.com>"
```

A `BAD signature` message means the checksum file was tampered with — do not
proceed.

**Step 2 — Verify the installer checksum (integrity)**

```bash
# Linux / macOS — 64-bit
cd dist && sha256sum -c SHA256SUMS.txt

# Linux / macOS — 32-bit
cd dist-32 && sha256sum -c SHA256SUMS.txt
```

Both steps together confirm the installer is unaltered **and** was produced
by Al Salik.

---

## Packaging a Release Archive

After building and checksumming the installer, run `pack:release` to bundle everything
into a single distributable archive:

```bash
# 64-bit
npm run pack:release

# 32-bit
npm run pack:release-32
```

### Archive contents

| File | Description |
|------|-------------|
| `Al Salik POS Setup <version>.exe` | Installer executable |
| `SHA256SUMS.txt` | SHA-256 checksum (standard `sha256sum -c` format) |
| `SHA256SUMS.txt.asc` *(when GPG-signed)* | Detached GPG signature of the checksum file |

The script exits with an error if the installer or checksum file is missing — you must
run `build:installer` (or `build:installer-32`) before packaging.

### Output files

| Edition | Archive |
|---------|---------|
| 64-bit  | `desktop-installer/AlSalikPOS-Installer.tar.gz` |
| 32-bit  | `desktop-installer/AlSalikPOS-Installer-32.tar.gz` |

### Typical full release workflow

```bash
# 64-bit release
npm run export-web
npm run build:win
npm run rebuild-web
npm run build:installer   # also runs sign-installers.js and checksum.js
npm run pack:release      # bundles EXE + SHA256SUMS.txt (+ .asc) into tar.gz

# 32-bit release (export-web already done above)
npm run build:all-32      # build:win7-32 + rebuild-web-32 + build:installer-32
npm run pack:release-32
```

Upload the resulting `.tar.gz` file to your download page or share it over Teams/email.
Recipients unpack it and immediately have both the installer and its checksum in the same
folder — no separate download required.

---

## Publishing a Release (Automated Upload)

`publish:release` packs the archive **and** uploads it to a remote distribution channel
in one step.  The script (`publish-release.js`) reads its configuration from environment
variables or from the optional `publish-config.json` file in `desktop-installer/`.

> **Never commit `publish-config.json`.**  It may contain credentials.  Add it to your
> `.gitignore`.  Use `publish-config.json.example` as a starting template.

### Quick start

```bash
# 1. Copy the example config
cp publish-config.json.example publish-config.json

# 2. Edit publish-config.json (or export the env vars below)

# 3. Publish
npm run publish:release       # 64-bit
npm run publish:release-32    # 32-bit
```

`publish:release` is equivalent to running `pack:release` followed by
`node publish-release.js`.  If the archive already exists from a previous
`pack:release` run, you can call `node publish-release.js` directly to skip
re-packing.

---

### Selecting an upload target

Set `RELEASE_UPLOAD_TARGET` (environment variable or `publish-config.json` key) to one
of the three supported backends:

| Value  | Backend                        |
|--------|--------------------------------|
| `s3`   | Amazon S3 (or S3-compatible)   |
| `sftp` | SFTP server via `sftp` CLI     |
| `http` | HTTP/HTTPS PUT endpoint        |

---

### Target: `s3` — Amazon S3

**Requirements:** AWS CLI (`aws`) must be installed and configured (credentials via
`~/.aws/credentials`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or an IAM role).

| Variable | Required | Description |
|---|---|---|
| `RELEASE_UPLOAD_TARGET` | yes | `s3` |
| `RELEASE_S3_BUCKET` | yes | S3 bucket name (e.g. `my-releases-bucket`) |
| `RELEASE_S3_PREFIX` | no | Key prefix inside the bucket (e.g. `alsalik-pos/v1.0.0`) |
| `RELEASE_S3_ENDPOINT` | no | Custom endpoint for S3-compatible stores (MinIO, Wasabi, Backblaze B2, etc.) |
| `RELEASE_S3_PUBLIC_BASE_URL` | no | Public base URL printed as the download link (e.g. a CloudFront or custom-domain URL). When not set, falls back to the standard `https://<bucket>.s3.amazonaws.com/<prefix>` URL — or to `<RELEASE_S3_ENDPOINT>/<bucket>/<prefix>` when `RELEASE_S3_ENDPOINT` is configured. |

**Shell example:**

```bash
export RELEASE_UPLOAD_TARGET=s3
export RELEASE_S3_BUCKET=my-releases-bucket
export RELEASE_S3_PREFIX=alsalik-pos/v1.0.0
npm run publish:release
```

**`publish-config.json` example:**

```json
{
  "RELEASE_UPLOAD_TARGET": "s3",
  "RELEASE_S3_BUCKET": "my-releases-bucket",
  "RELEASE_S3_PREFIX": "alsalik-pos/v1.0.0"
}
```

The script runs `aws s3 cp <file> s3://<bucket>/<prefix>/<file>` for each artifact.
Pass `RELEASE_S3_ENDPOINT` to point to an S3-compatible provider:

```bash
export RELEASE_S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
```

---

### Target: `sftp` — SFTP Server

**Requirements:** `sftp` CLI (OpenSSH, available by default on Linux/macOS).

| Variable | Required | Description |
|---|---|---|
| `RELEASE_UPLOAD_TARGET` | yes | `sftp` |
| `RELEASE_SFTP_HOST` | yes | Hostname or IP of the SFTP server |
| `RELEASE_SFTP_USER` | yes | SSH username |
| `RELEASE_SFTP_PATH` | yes | Absolute remote directory path |
| `RELEASE_SFTP_PORT` | no | SSH port (default: `22`) |
| `RELEASE_SFTP_KEY` | no | Path to a private key file (`~/.ssh/id_rsa`, etc.) |
| `RELEASE_SFTP_PUBLIC_URL` | no | Public HTTP(S) base URL printed as the download link (e.g. `https://files.example.com/releases/alsalik-pos`). When not set a reminder is printed to configure it. |

The remote directory (`RELEASE_SFTP_PATH`) must already exist on the server.

**Shell example:**

```bash
export RELEASE_UPLOAD_TARGET=sftp
export RELEASE_SFTP_HOST=files.example.com
export RELEASE_SFTP_USER=deploy
export RELEASE_SFTP_PATH=/var/www/releases/alsalik-pos
export RELEASE_SFTP_KEY=~/.ssh/id_rsa_deploy
npm run publish:release
```

The first connection to a new host requires SSH host-key verification.  The script passes
`-o StrictHostKeyChecking=accept-new` so new hosts are trusted automatically; subsequent
runs verify the cached key.

---

### Target: `http` — HTTP PUT Endpoint

**Requirements:** None beyond Node.js (uses the built-in `https` module).

| Variable | Required | Description |
|---|---|---|
| `RELEASE_UPLOAD_TARGET` | yes | `http` |
| `RELEASE_HTTP_URL` | yes | Base URL that accepts `PUT <url>/<filename>` (no trailing slash) |
| `RELEASE_HTTP_BEARER` | no | Bearer token sent in the `Authorization` header |

**Shell example:**

```bash
export RELEASE_UPLOAD_TARGET=http
export RELEASE_HTTP_URL=https://my-server.example.com/releases/v1.0.0
export RELEASE_HTTP_BEARER=my-api-token
npm run publish:release
```

The script issues one `PUT` request per file with `Content-Type: application/octet-stream`.
This target works with any HTTP file server or object-storage pre-signed URL that accepts
`PUT` (e.g. Azure Blob Storage, Cloudflare R2 via presigned URL).

---

### What gets uploaded

`publish-release.js` always uploads the two mandatory artifacts plus the optional GPG
signature when it is present:

| File | Source |
|------|--------|
| `AlSalikPOS-Installer.tar.gz` (or `-32`) | `desktop-installer/` |
| `SHA256SUMS.txt` | `dist/` (or `dist-32/`) |
| `SHA256SUMS.txt.asc` *(when GPG-signed)* | `dist/` (or `dist-32/`) |

---

### Full release workflow (build → sign → pack → publish)

```bash
# 64-bit
npm run export-web
npm run build:win
npm run rebuild-web
npm run build:installer       # sign, checksum
npm run publish:release       # pack + upload

# 32-bit (export-web already done above)
npm run build:all-32          # build:win7-32 + rebuild-web-32 + build:installer-32
npm run publish:release-32    # pack + upload
```

---

## Cross-compiling from Linux/macOS

electron-builder supports building Windows installers from Linux/macOS with no extra setup.
Code signing on Linux requires `osslsigncode` (see the Code Signing section above).
