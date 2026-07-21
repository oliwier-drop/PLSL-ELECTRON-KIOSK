const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kioskKeyboard', {
  hide: () => ipcRenderer.send('keyboard:hide'),
  sendKey: (key) => ipcRenderer.send('keyboard:key', { key }),
})
