const { app, BrowserWindow, BrowserView, ipcMain } = require('electron/main')
const path = require('node:path')
const config = require('./config')
const { attachNavigationGuard } = require('./src/navigation-guard')
const { SessionManager } = require('./src/session-manager')
const { IdleTimer } = require('./src/idle-timer')
const { showOnScreenKeyboard } = require('./src/keyboard')

let mainWindow = null
let browserView = null
let sessionManager = null
let idleTimer = null

if (config.dev.ignoreCertificateErrors) {
  app.commandLine.appendSwitch('ignore-certificate-errors')
}

function updateBrowserViewBounds() {
  if (!mainWindow || !browserView) return

  const [width, height] = mainWindow.getContentSize()
  browserView.setBounds({
    x: 0,
    y: 0,
    width,
    height: height - config.toolbarHeight,
  })
}

function attachActivityTracking(webContents) {
  webContents.on('before-input-event', () => {
    idleTimer?.reset()
  })

  webContents.on('did-navigate', () => {
    idleTimer?.reset()
  })

  webContents.on('did-navigate-in-page', () => {
    idleTimer?.reset()
  })
}

function setupIpc() {
  ipcMain.handle('nav:back', () => {
    idleTimer?.reset()
    sessionManager?.goBack()
  })

  ipcMain.handle('nav:home', () => {
    idleTimer?.reset()
    sessionManager?.goHome()
  })

  ipcMain.handle('nav:refresh', () => {
    idleTimer?.reset()
    sessionManager?.refresh()
  })

  ipcMain.handle('keyboard:show', () => {
    idleTimer?.reset()
    showOnScreenKeyboard()
  })

  ipcMain.handle('session:end', async () => {
    await sessionManager?.endSession()
    idleTimer?.reset()
  })

  ipcMain.handle('idle:continue', () => {
    idleTimer?.continueSession()
  })

  ipcMain.handle('idle:endNow', async () => {
    await sessionManager?.endSession()
    idleTimer?.reset()
  })

  ipcMain.on('activity:ping', () => {
    idleTimer?.reset()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    kiosk: true,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  browserView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: 'persist:kiosk',
    },
  })

  mainWindow.setBrowserView(browserView)
  updateBrowserViewBounds()

  sessionManager = new SessionManager(browserView, config)

  attachNavigationGuard(browserView.webContents, config, (message) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nav:blocked', message)
    }
  })

  idleTimer = new IdleTimer(config, mainWindow, async () => {
    await sessionManager.endSession()
    idleTimer.reset()
  })

  attachActivityTracking(browserView.webContents)
  attachActivityTracking(mainWindow.webContents)

  setupIpc()

  mainWindow.on('resize', updateBrowserViewBounds)

  mainWindow.loadFile(path.join(__dirname, 'shell', 'index.html'))
  browserView.webContents.loadURL(config.homeUrl)
}

app.whenReady().then(() => {
  const { globalShortcut } = require('electron')

  createWindow()

  if (config.dev.exitShortcut) {
    globalShortcut.register(config.dev.exitShortcut, () => {
      app.quit()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  const { globalShortcut } = require('electron')
  globalShortcut.unregisterAll()
  idleTimer?.destroy()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
