'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const WWW_DIR = path.join(__dirname, 'www');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json',
};

function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startLocalServer(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = url.pathname;

    // Strip leading slash, default to index.html
    let rel = pathname.replace(/^\//, '') || 'index.html';
    let filePath = path.join(WWW_DIR, rel);

    // SPA fallback — serve index.html for unknown routes
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(WWW_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, '127.0.0.1');
  return server;
}

let mainWindow;
let localServer;

async function createWindow() {
  const port = await getFreePort();
  localServer = startLocalServer(port);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Al Salik POS',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0F1117',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.loadURL(`http://localhost:${port}/`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('mailto:') || url.startsWith('tel:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (!url || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 480,
          height: 760,
          title: 'Print Preview',
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        },
      };
    }
    if (url.startsWith('http') && !/localhost|127\.0\.0\.1/.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('mailto:') || url.startsWith('tel:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

const menuTemplate = [
  {
    label: 'File',
    submenu: [
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
    ],
  },
  {
    label: 'View',
    submenu: [
      { label: 'Toggle Full Screen', accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      { label: 'Zoom In',  accelerator: 'CmdOrCtrl+=', click: () => mainWindow && mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5) },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow && mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5) },
      { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => mainWindow && mainWindow.webContents.setZoomLevel(0) },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About Al Salik POS',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Al Salik POS',
            message: 'Al Salik POS',
            detail: 'Version 1.0.0\n\nPoint of Sale system with UAE 5% VAT, AED currency, and TRN compliance.\n\nSoftware Provider:\nAl Salik Computers\n\n© 2025 Al Salik Computers. All rights reserved.',
            icon: path.join(__dirname, 'assets', 'icon.png'),
          });
        },
      },
      { label: 'Contact Support', click: () => shell.openExternal('mailto:support@alsalikcomputers.com') },
    ],
  },
];

// ===== Windows On-Screen Keyboard (OSK) =====
ipcMain.handle('osk:open', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Not on Windows' };
  try {
    const { spawn } = require('child_process');
    spawn('cmd.exe', ['/c', 'start', '', 'osk.exe'], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});
ipcMain.handle('osk:close', async () => {
  if (process.platform !== 'win32') return { ok: false };
  try {
    const { spawn } = require('child_process');
    spawn('taskkill', ['/IM', 'osk.exe', '/F'], { windowsHide: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
});

// ===== Printer IPC bridge =====
ipcMain.handle('printers:list', async () => {
  try {
    if (!mainWindow) return [];
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      isDefault: !!p.isDefault,
      status: p.status,
    }));
  } catch (e) {
    console.error('printers:list error', e);
    return [];
  }
});

ipcMain.handle('printers:print', async (_evt, payload) => {
  const { html, options } = payload || {};
  if (!html) return { ok: false, error: 'No HTML provided' };
  const opts = options || {};
  const deviceName = opts.deviceName || '';
  const paperWidth = opts.paperWidth === '58mm' ? 58 : 80;
  const copies = Math.max(1, Math.min(10, parseInt(opts.copies || 1, 10)));

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, contextIsolation: true, sandbox: true },
  });

  try {
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await win.loadURL(dataUrl);
    await new Promise((r) => setTimeout(r, 120));

    const printOpts = {
      silent: true,
      printBackground: true,
      deviceName,
      copies,
      margins: { marginType: 'none' },
      pageSize: { width: paperWidth * 1000, height: 297000 },
      scaleFactor: 100,
    };

    const ok = await new Promise((resolve) => {
      win.webContents.print(printOpts, (success, reason) => {
        if (!success) console.warn('Silent print failed:', reason);
        resolve(success);
      });
    });
    return { ok };
  } catch (e) {
    console.error('printers:print error', e);
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    setTimeout(() => { try { win.destroy(); } catch {} }, 500);
  }
});

// ===== ESC/POS RAW print via PowerShell + Win32 spooler =====
const os = require('os');
const { spawn } = require('child_process');

function escposBuild(text, opts) {
  const codepage = (opts.codepage || 'cp1252').toLowerCase();
  const cut = opts.autoCut !== false;

  // ESC @ : initialize
  const init = Buffer.from([0x1B, 0x40]);
  // ESC t n : select code page (n: 0=CP437, 16=CP1252, 22=CP858)
  const cpMap = { cp437: 0, cp1252: 16, ascii: 0 };
  const cpByte = cpMap[codepage] != null ? cpMap[codepage] : 16;
  const setCp = Buffer.from([0x1B, 0x74, cpByte]);
  // ESC a 0 : left align
  const align = Buffer.from([0x1B, 0x61, 0x00]);

  // Encode text. Node Buffer doesn't natively do CP437; map non-ascii via simple fold.
  const safe = String(text).replace(/[\u0080-\uFFFF]/g, (ch) => {
    // Try a small map for common chars
    const map = { '\u00B0': String.fromCharCode(0xF8), '\u00A3': String.fromCharCode(0x9C), '\u00E9': 'e', '\u00E8': 'e' };
    return map[ch] != null ? map[ch] : '?';
  });
  const body = Buffer.from(safe, 'binary');

  // Feed 4 lines + cut
  const feedAndCut = cut
    ? Buffer.from([0x0A, 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]) // GS V 0 = full cut
    : Buffer.from([0x0A, 0x0A, 0x0A]);

  return Buffer.concat([init, setCp, align, body, feedAndCut]);
}

const RAW_PRINT_PS = `param([string]$PrinterName, [string]$BinPath)
$src = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RP {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DI { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string s, out IntPtr h, IntPtr d);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DI di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] d, int l, out int w);
  public static bool Send(string p, byte[] b) {
    IntPtr h; if(!OpenPrinter(p, out h, IntPtr.Zero)) return false;
    var di = new DI(); di.pDocName = "POS Receipt"; di.pDataType = "RAW";
    if(!StartDocPrinter(h, 1, di)) { ClosePrinter(h); return false; }
    StartPagePrinter(h); int w; bool ok = WritePrinter(h, b, b.Length, out w);
    EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h); return ok;
  }
}
"@
Add-Type -TypeDefinition $src -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($BinPath)
$ok = [RP]::Send($PrinterName, $bytes)
if ($ok) { exit 0 } else { exit 1 }
`;

ipcMain.handle('printers:printRaw', async (_evt, payload) => {
  const { text, options } = payload || {};
  const opts = options || {};
  const printerName = opts.deviceName;
  if (!printerName) return { ok: false, error: 'No printer selected' };
  if (process.platform !== 'win32') return { ok: false, error: 'RAW printing only available on Windows' };
  if (text == null) return { ok: false, error: 'No text provided' };

  const bin = escposBuild(String(text), { autoCut: !!opts.autoCut, codepage: opts.codepage || 'cp1252' });
  const tmp = path.join(os.tmpdir(), `alsalik-raw-${Date.now()}-${Math.random().toString(36).slice(2,8)}.bin`);
  const ps1 = path.join(os.tmpdir(), `alsalik-raw-${Date.now()}-${Math.random().toString(36).slice(2,8)}.ps1`);
  try {
    fs.writeFileSync(tmp, bin);
    fs.writeFileSync(ps1, RAW_PRINT_PS);
    const code = await new Promise((resolve) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-PrinterName', printerName, '-BinPath', tmp], { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (c) => { if (c !== 0) console.warn('RAW print stderr:', stderr); resolve(c); });
      child.on('error', (e) => { console.warn('RAW print spawn error:', e); resolve(1); });
    });
    return { ok: code === 0 };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    setTimeout(() => { try { fs.unlinkSync(tmp); } catch {} try { fs.unlinkSync(ps1); } catch {} }, 5000);
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
