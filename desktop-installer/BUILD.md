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

Edit the `"version"` field in `package.json` and the `APP_VERSION` define in both
`installer.nsi` and `installer-32.nsi`:

```json
"version": "1.1.0"
```

```nsis
!define APP_VERSION   "1.1.0"
```

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

## Cross-compiling from Linux/macOS

electron-builder supports building Windows installers from Linux/macOS with no extra setup.
Code signing on Linux requires `osslsigncode` (see the Code Signing section above).
