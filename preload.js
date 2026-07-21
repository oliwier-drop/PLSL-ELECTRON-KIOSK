const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kiosk', {
  nav: {
    back: () => ipcRenderer.invoke('nav:back'),
    home: () => ipcRenderer.invoke('nav:home'),
    refresh: () => ipcRenderer.invoke('nav:refresh'),
  },
  keyboard: {
    show: () => ipcRenderer.invoke('keyboard:show'),
    hide: () => ipcRenderer.send('keyboard:hide'),
  },
  session: {
    requestEnd: () => ipcRenderer.send('ui:show-confirm'),
  },
  activity: {
    ping: () => ipcRenderer.send('activity:ping'),
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
  },
  onSessionEnded: (callback) => {
    ipcRenderer.on('session:ended', (_event, data) => callback(data))
  },
  onSessionError: (callback) => {
    ipcRenderer.on('session:error', (_event, message) => callback(message))
  },
})
