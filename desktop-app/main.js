const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;

let mainWindow = null;

function getWebBuildPath() {
  if (isDev) {
    return path.join(__dirname, "web-build");
  }
  return path.join(process.resourcesPath, "web-build");
}

function fixAbsolutePaths(buildDir) {
  const indexPath = path.join(buildDir, "index.html");
  if (!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath, "utf-8");
  html = html.replace(/href="\//g, 'href="./');
  html = html.replace(/src="\//g, 'src="./');
  html = html.replace(/url\(\//g, "url(./");
  fs.writeFileSync(indexPath, html, "utf-8");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "POS System",
    backgroundColor: "#0F1117",
    show: false,
    icon: path.join(__dirname, "build-resources", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
    autoHideMenuBar: true,
  });

  const menuTemplate = [
    {
      label: "File",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow.reload(),
        },
        { type: "separator" },
        {
          label: "Exit",
          accelerator: "Alt+F4",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Full Screen",
          accelerator: "F11",
          click: () =>
            mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+=",
          click: () => {
            const zoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(Math.min(zoom + 0.1, 2.0));
          },
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          click: () => {
            const zoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.5));
          },
        },
        {
          label: "Reset Zoom",
          accelerator: "CmdOrCtrl+0",
          click: () => mainWindow.webContents.setZoomFactor(1.0),
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About POS System",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About POS System",
              message: "POS System v1.0.0",
              detail:
                "Full-featured Point of Sale system with inventory management, " +
                "staff PIN login, table management, split payments, loyalty points, " +
                "UAE VAT compliance (5% / AED), and Z-report generation.\n\n" +
                "Data is stored locally on this computer.",
            });
          },
        },
      ],
    },
  ];

  if (isDev) {
    menuTemplate[1].submenu.push(
      { type: "separator" },
      {
        label: "Developer Tools",
        accelerator: "F12",
        click: () => mainWindow.webContents.toggleDevTools(),
      }
    );
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const webBuildPath = getWebBuildPath();
  fixAbsolutePaths(webBuildPath);
  const indexPath = path.join(webBuildPath, "index.html");

  if (!fs.existsSync(indexPath)) {
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head><style>
        body { background: #0F1117; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .box { max-width: 500px; }
        h1 { color: #4F8EF7; margin-bottom: 16px; }
        p { color: #9CA3AF; line-height: 1.6; }
        code { background: #1A1D25; padding: 4px 8px; border-radius: 4px; font-size: 13px; }
      </style></head>
      <body><div class="box">
        <h1>Web Build Not Found</h1>
        <p>The web build has not been generated yet.</p>
        <p>Run the following command to build:</p>
        <p><code>npm run build:web</code></p>
        <p>Then restart this application.</p>
      </div></body>
      </html>
    `)}`
    );
  } else {
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});
