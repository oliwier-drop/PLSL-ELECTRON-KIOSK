const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kiosk', {
  nav: {
    back: () => ipcRenderer.invoke('nav:back'),
    home: () => ipcRenderer.invoke('nav:home'),
    refresh: () => ipcRenderer.invoke('nav:refresh'),
  },
  keyboard: {
    show: () => ipcRenderer.invoke('keyboard:show'),
  },
  session: {
    end: () => ipcRenderer.invoke('session:end'),
  },
  idle: {
    continue: () => ipcRenderer.invoke('idle:continue'),
    endNow: () => ipcRenderer.invoke('idle:endNow'),
  },
  activity: {
    ping: () => ipcRenderer.send('activity:ping'),
  },
  onNavBlocked: (callback) => {
    ipcRenderer.on('nav:blocked', (_event, message) => callback(message))
  },
  onIdleWarning: (callback) => {
    ipcRenderer.on('idle:warning', (_event, data) => callback(data))
  },
  onIdleHide: (callback) => {
    ipcRenderer.on('idle:hide', () => callback())
  },
})
