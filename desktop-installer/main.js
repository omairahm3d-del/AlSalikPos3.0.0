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

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
