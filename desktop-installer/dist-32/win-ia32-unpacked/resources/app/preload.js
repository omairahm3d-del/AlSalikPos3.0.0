const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPOS', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  silentPrint: (html, options) => ipcRenderer.invoke('printers:print', { html, options: options || {} }),
  silentPrintRaw: (text, options) => ipcRenderer.invoke('printers:printRaw', { text, options: options || {} }),
  openOSK: () => ipcRenderer.invoke('osk:open'),
  closeOSK: () => ipcRenderer.invoke('osk:close'),
});
