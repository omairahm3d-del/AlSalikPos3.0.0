'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPOS', {
  isElectron: true,
  platform: process.platform,
  version: '1.0.0',
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  silentPrint: (html, options) => ipcRenderer.invoke('printers:print', { html, options: options || {} }),
});
