const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlay', {
  confirm: {
    accept: () => ipcRenderer.invoke('confirm:accept'),
    cancel: () => ipcRenderer.send('ui:hide-overlay'),
  },
  idle: {
    continue: () => ipcRenderer.invoke('idle:continue'),
    endNow: () => ipcRenderer.invoke('idle:endNow'),
  },
  onMode: (callback) => {
    ipcRenderer.on('overlay:mode', (_event, data) => callback(data))
  },
})
