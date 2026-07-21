const {
  app,
  BaseWindow,
  WebContentsView,
  ipcMain,
  session,
} = require('electron/main')
const path = require('node:path')
const { loadConfig, getConfigPath } = require('./src/runtime-config')
const config = loadConfig()
const { attachWebContentsGuard } = require('./src/navigation-guard')
const { SessionManager } = require('./src/session-manager')
const { IdleTimer } = require('./src/idle-timer')

const PARTITION = 'persist:kiosk'

let win = null
let toolbarView = null
let contentView = null
let keyboardView = null
let overlayView = null
let sessionManager = null
let idleTimer = null
let keyboardDebounce = null
let isOverlayVisible = false
let isKeyboardVisible = false
let isEndingSession = false
const activeDownloads = new Map()

if (config.dev.ignoreCertificateErrors) {
  app.commandLine.appendSwitch('ignore-certificate-errors')
}

function log(...args) {
  console.log('[kiosk]', ...args)
}

log('Konfiguracja homeUrl:', config.homeUrl, '| plik:', getConfigPath())

function getKioskSession() {
  return session.fromPartition(PARTITION)
}

function setupKioskSession() {
  const kioskSession = getKioskSession()

  kioskSession.on('will-download', (_event, item) => {
    const id = item.getURL()
    activeDownloads.set(id, item)
    item.on('done', () => activeDownloads.delete(id))
  })
}

function getWindowSize() {
  const [width, height] = win.getContentSize()
  return { width, height }
}

function getKeyboardHeight() {
  if (!isKeyboardVisible) return 0
  return config.keyboard?.height ?? 280
}

function layoutViews() {
  if (!win || win.isDestroyed()) return

  const { width, height } = getWindowSize()
  const toolbarHeight = config.toolbarHeight
  const keyboardHeight = getKeyboardHeight()

  toolbarView.setBounds({ x: 0, y: 0, width, height: toolbarHeight })
  contentView.setBounds({
    x: 0,
    y: toolbarHeight,
    width,
    height: Math.max(0, height - toolbarHeight - keyboardHeight),
  })

  if (keyboardView) {
    keyboardView.setBounds({
      x: 0,
      y: height - keyboardHeight,
      width,
      height: keyboardHeight,
    })
  }

  if (isOverlayVisible) {
    overlayView.setBounds({ x: 0, y: 0, width, height })
  }
}

function showKeyboard() {
  if (!keyboardView || keyboardView.webContents.isDestroyed()) return

  isKeyboardVisible = true
  layoutViews()
}

function hideKeyboard() {
  if (!isKeyboardVisible) return

  isKeyboardVisible = false
  layoutViews()
}

function showOverlay(mode, payload = {}) {
  if (!win || win.isDestroyed()) return

  const { width, height } = getWindowSize()
  overlayView.setBounds({ x: 0, y: 0, width, height })

  if (!isOverlayVisible) {
    win.contentView.addChildView(overlayView)
    isOverlayVisible = true
  }

  overlayView.webContents.send('overlay:mode', { mode, ...payload })
  overlayView.webContents.focus()
}

function hideOverlay() {
  if (!win || win.isDestroyed()) return
  if (!isOverlayVisible) return

  win.contentView.removeChildView(overlayView)
  isOverlayVisible = false

  if (contentView && !contentView.webContents.isDestroyed()) {
    contentView.webContents.focus()
  }
}

function attachActivityTracking(webContents) {
  const maybeResetIdle = () => {
    if (!isEndingSession) {
      idleTimer?.reset()
    }
  }

  webContents.on('before-input-event', maybeResetIdle)
  webContents.on('did-navigate', maybeResetIdle)
  webContents.on('did-navigate-in-page', maybeResetIdle)
}

function attachKeyboardDismiss(webContents) {
  const hideOnNavigate = () => hideKeyboard()

  webContents.on('did-navigate', hideOnNavigate)
  webContents.on('did-navigate-in-page', hideOnNavigate)
}

async function clearKioskSession() {
  const kioskSession = getKioskSession()

  for (const item of activeDownloads.values()) {
    item.cancel()
  }
  activeDownloads.clear()

  await Promise.race([
    kioskSession.clearStorageData(),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ])

  await Promise.race([
    kioskSession.clearCache(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])

  kioskSession.clearAuthCache()
}

async function loadHome() {
  const webContents = contentView.webContents

  try {
    webContents.navigationHistory.clear()
  } catch (error) {
    log('Nie udało się wyczyścić historii:', error.message)
  }

  try {
    log('Ładowanie strony głównej:', config.homeUrl)
    await webContents.loadURL(config.homeUrl)
  } catch (error) {
    log('Home nie załadowany, ładuję pustkę bezpieczeństwa:', error.message)
    await webContents.loadURL('about:blank')
  }

  return webContents.getURL()
}

async function endSession() {
  if (isEndingSession) {
    return { ok: true, url: contentView.webContents.getURL() }
  }

  isEndingSession = true
  idleTimer?.cancelWarning()

  if (isOverlayVisible && overlayView && !overlayView.webContents.isDestroyed()) {
    overlayView.webContents.send('overlay:mode', { mode: 'ending' })
  }

  try {
    log('Zakończenie sesji, obecny URL:', contentView.webContents.getURL())

    await clearKioskSession()
    const afterUrl = await loadHome()

    hideOverlay()
    hideKeyboard()
    idleTimer?.reset()

    if (toolbarView && !toolbarView.webContents.isDestroyed()) {
      toolbarView.webContents.send('session:ended', { url: afterUrl })
    }

    log('Reset sesji zakończony, adres:', afterUrl)
    return { ok: true, url: afterUrl }
  } catch (error) {
    log('endSession błąd:', error.message)
    hideOverlay()
    if (toolbarView && !toolbarView.webContents.isDestroyed()) {
      toolbarView.webContents.send('session:error', error.message)
    }
    return { ok: false, error: error.message }
  } finally {
    isEndingSession = false
  }
}

function setupIpc() {
  ipcMain.handle('nav:back', () => {
    idleTimer?.reset()
    sessionManager?.goBack()
  })

  ipcMain.handle('nav:home', async () => {
    idleTimer?.reset()
    await sessionManager?.goHome()
  })

  ipcMain.handle('nav:refresh', () => {
    idleTimer?.reset()
    sessionManager?.refresh()
  })

  ipcMain.handle('keyboard:show', async () => {
    idleTimer?.reset()
    showKeyboard()
    return true
  })

  ipcMain.on('keyboard:focus', () => {
    if (!config.keyboard?.autoShowOnFocus) return

    idleTimer?.reset()
    clearTimeout(keyboardDebounce)
    keyboardDebounce = setTimeout(() => {
      showKeyboard()
    }, config.keyboard?.debounceMs ?? 300)
  })

  ipcMain.on('keyboard:hide', () => {
    idleTimer?.reset()
    hideKeyboard()
  })

  ipcMain.on('keyboard:key', (_event, { key }) => {
    idleTimer?.reset()

    if (!contentView || contentView.webContents.isDestroyed()) return

    contentView.webContents.send('keyboard:inject', { key })
  })

  ipcMain.on('ui:show-confirm', () => {
    idleTimer?.reset()
    showOverlay('confirm')
  })

  ipcMain.on('ui:hide-overlay', () => {
    idleTimer?.reset()
    hideOverlay()
  })

  ipcMain.handle('confirm:accept', async () => {
    return endSession()
  })

  ipcMain.handle('idle:continue', () => {
    hideOverlay()
    idleTimer?.continueSession()
  })

  ipcMain.handle('idle:endNow', async () => {
    return endSession()
  })

  ipcMain.on('activity:ping', () => {
    idleTimer?.reset()
  })

  ipcMain.handle('config:get', () => ({
    logoPath: config.logoPath,
    homeUrl: config.homeUrl,
  }))
}

function createWindow() {
  win = new BaseWindow({
    width: 1920,
    height: 1080,
    kiosk: true,
    fullscreen: true,
    autoHideMenuBar: true,
  })

  toolbarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  contentView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'browser-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: PARTITION,
    },
  })

  overlayView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      transparent: true,
    },
  })
  overlayView.setBackgroundColor('#00000000')

  keyboardView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'keyboard-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.contentView.addChildView(contentView)
  win.contentView.addChildView(toolbarView)
  win.contentView.addChildView(keyboardView)

  sessionManager = new SessionManager(contentView, config)

  attachWebContentsGuard(contentView.webContents)
  attachActivityTracking(contentView.webContents)
  attachKeyboardDismiss(contentView.webContents)
  attachActivityTracking(toolbarView.webContents)

  idleTimer = new IdleTimer(config, {
    showWarning: (seconds) => showOverlay('idle', { seconds }),
    updateWarning: (seconds) => {
      if (isOverlayVisible && !isEndingSession) {
        overlayView.webContents.send('overlay:mode', { mode: 'idle', seconds })
      }
    },
    hideWarning: () => {
      if (isOverlayVisible) hideOverlay()
    },
    onExpire: async () => {
      try {
        await endSession()
      } catch (error) {
        log('auto idle end błąd:', error.message)
      }
    },
  })

  layoutViews()

  win.on('resize', layoutViews)

  toolbarView.webContents.loadFile(path.join(__dirname, 'shell', 'index.html'))
  keyboardView.webContents.loadFile(path.join(__dirname, 'shell', 'keyboard.html'))
  overlayView.webContents.loadFile(path.join(__dirname, 'shell', 'overlay.html'))

  contentView.webContents.loadURL(config.homeUrl).catch((error) => {
    log('Błąd startowej strony głównej:', error.message)
  })
}

app.whenReady().then(() => {
  const { globalShortcut } = require('electron')

  setupKioskSession()
  setupIpc()
  createWindow()

  if (config.dev.exitShortcut) {
    globalShortcut.register(config.dev.exitShortcut, () => {
      app.quit()
    })
  }

  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) {
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
