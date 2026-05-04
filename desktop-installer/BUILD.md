# Al Salik POS — Windows Installer Build Guide

**Software Provider:** Al Salik Computers  
**Product:** Al Salik POS v1.0.0  
**Target:** Windows 10/11 (64-bit)

---

## Prerequisites

Install on your build machine:

1. **Node.js** v18 or later — https://nodejs.org
2. **pnpm** — `npm install -g pnpm`

---

## Step 1 — Update the App URL

Open `main.js` and set `APP_URL` to your published app domain:

```js
const APP_URL = 'https://your-replit-app.replit.app/pos-app/';
```

---

## Step 2 — Add Branding Assets

Place the following files in the `assets/` folder before building:

| File | Size | Description |
|------|------|-------------|
| `icon.ico` | 256×256 | Windows taskbar / desktop icon (ICO format) |
| `icon.png` | 512×512 | About dialog icon |
| `installer-sidebar.bmp` | 164×314 px | Left sidebar shown in installer wizard |

You can convert a PNG to ICO using https://convertio.co or ImageMagick:
```
magick icon.png -resize 256x256 icon.ico
```

---

## Step 3 — Install Dependencies

```bash
cd desktop-installer
npm install
```

---

## Step 4 — Build the Windows Installer

```bash
npm run build:win
```

The installer will be generated at:
```
desktop-installer/dist/Al Salik POS Setup 1.0.0.exe
```

---

## Installer Features

- **One-click or custom install directory** — user can choose where to install
- **Desktop shortcut** — "Al Salik POS" shortcut created automatically  
- **Start Menu shortcut** — placed under "Al Salik Computers" group
- **Uninstaller** — included and registered in Windows Add/Remove Programs
- **Publisher** — shows "Al Salik Computers" in Windows security prompts
- **64-bit** — targets x64 Windows (Windows 10/11)

---

## Updating the Version

Edit the `"version"` field in `package.json`:

```json
"version": "1.1.0"
```

---

## Cross-compiling from Linux/macOS

electron-builder supports building Windows installers from Linux/macOS.
No additional setup is required for unsigned builds.

For code-signed builds (removes "Unknown Publisher" warning), you will need
a Windows code-signing certificate (.pfx) from a trusted CA such as Sectigo or DigiCert.
