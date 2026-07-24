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
const {
  createSessionEnder,
  withTimeout,
  withTimeoutResolve,
} = require('./src/session-ender')

const PARTITION = 'persist:kiosk'

let win = null
let toolbarView = null
let contentView = null
let overlayView = null
let keyboardView = null
let sessionManager = null
let idleTimer = null
let sessionEnder = null
let isOverlayVisible = false
let isKeyboardVisible = false

const KEYBOARD_HEIGHT = config.keyboard?.height ?? 270
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

function layoutViews() {
  if (!win || win.isDestroyed()) return

  const { width, height } = getWindowSize()
  const toolbarHeight = config.toolbarHeight
  const keyboardSpace = isKeyboardVisible ? KEYBOARD_HEIGHT : 0

  toolbarView.setBounds({ x: 0, y: 0, width, height: toolbarHeight })
  contentView.setBounds({
    x: 0,
    y: toolbarHeight,
    width,
    height: Math.max(0, height - toolbarHeight - keyboardSpace),
  })

  if (isOverlayVisible) {
    overlayView.setBounds({ x: 0, y: 0, width, height })
  }

  if (isKeyboardVisible) {
    keyboardView.setBounds({ x: 0, y: height - KEYBOARD_HEIGHT, width, height: KEYBOARD_HEIGHT })
  }
}

function showKeyboard() {
  if (!win || win.isDestroyed() || isKeyboardVisible) return
  win.contentView.addChildView(keyboardView)
  isKeyboardVisible = true
  layoutViews()
}

function hideKeyboard() {
  if (!win || win.isDestroyed() || !isKeyboardVisible) return
  win.contentView.removeChildView(keyboardView)
  isKeyboardVisible = false
  layoutViews()

  // Blur active element on the page to remove focus
  if (contentView && !contentView.webContents.isDestroyed()) {
    contentView.webContents.send('blur-active-element')
  }
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
    resetIdleIfActive()
  }

  webContents.on('before-input-event', maybeResetIdle)
  webContents.on('did-navigate', maybeResetIdle)
  webContents.on('did-navigate-in-page', maybeResetIdle)
}

function resetIdleIfActive() {
  if (sessionEnder?.isEnding()) return
  if (idleTimer?.shouldIgnoreActivity?.()) return
  idleTimer?.reset()
}

async function clearKioskSession() {
  const kioskSession = getKioskSession()

  for (const item of activeDownloads.values()) {
    item.cancel()
  }
  activeDownloads.clear()

  await withTimeoutResolve(kioskSession.clearStorageData(), 8000)
  await withTimeoutResolve(kioskSession.clearCache(), 5000)
  kioskSession.clearAuthCache()
}

async function loadHome() {
  const webContents = contentView.webContents

  try {
    webContents.navigationHistory.clear()
  } catch (error) {
    log('Nie udało się wyczyścić historii:', error.message)
  }

  const LOAD_TIMEOUT_MS = 15_000

  try {
    log('Ładowanie strony głównej:', config.homeUrl)
    await withTimeout(
      webContents.loadURL(config.homeUrl),
      LOAD_TIMEOUT_MS,
      'Timeout ładowania homeUrl'
    )
  } catch (error) {
    log('Home nie załadowany, ładuję pustkę bezpieczeństwa:', error.message)
    try {
      await webContents.loadURL('about:blank')
    } catch (blankError) {
      log('Nie udało się załadować about:blank:', blankError.message)
    }
  }

  return webContents.getURL()
}

function createSessionEnderInstance() {
  return createSessionEnder({
    getCurrentUrl: () => contentView.webContents.getURL(),
    stopIdleTimers: () => idleTimer?.stopTimers(),
    showEndingOverlay: () => showOverlay('ending'),
    hideKeyboard: () => {
      if (isKeyboardVisible) hideKeyboard()
    },
    clearSession: () => clearKioskSession(),
    loadHome: () => loadHome(),
    hideOverlay: () => hideOverlay(),
    notifySessionEnded: (url) => {
      if (toolbarView && !toolbarView.webContents.isDestroyed()) {
        toolbarView.webContents.send('session:ended', { url })
      }
    },
    notifySessionError: (message) => {
      if (toolbarView && !toolbarView.webContents.isDestroyed()) {
        toolbarView.webContents.send('session:error', message)
      }
    },
    restartIdleTimer: () => idleTimer?.reset({ force: true }),
    log,
  })
}

function endSession() {
  return sessionEnder.endSession()
}

function setupIpc() {
  ipcMain.handle('nav:back', () => {
    resetIdleIfActive()
    sessionManager?.goBack()
  })

  ipcMain.handle('nav:home', async () => {
    resetIdleIfActive()
    await sessionManager?.goHome()
  })

  ipcMain.handle('nav:refresh', () => {
    resetIdleIfActive()
    sessionManager?.refresh()
  })

  ipcMain.handle('keyboard:show', async () => {
    resetIdleIfActive()
    showKeyboard()
    return true
  })

  ipcMain.on('keyboard:hide', () => {
    hideKeyboard()
    if (contentView && !contentView.webContents.isDestroyed()) {
      contentView.webContents.focus()
    }
  })

  ipcMain.on('keyboard:key', (_event, { key }) => {
    if (!contentView || contentView.webContents.isDestroyed()) return

    if (key === '{esc}') {
      hideKeyboard()
      if (!contentView.webContents.isDestroyed()) {
        contentView.webContents.focus()
      }
      return
    }

    // Nie przełączaj fokusu na contentView przy każdym klawiszu — Enova (i podobne)
    // przy focus robi select-all i miga zaznaczeniem. Znaki wstrzykujemy do
    // ostatniego pola przez preload, bez wc.focus()/sendInputEvent.
    resetIdleIfActive()
    contentView.webContents.send('keyboard:inject', { key })
  })

  ipcMain.handle('keyboard:timing', () => ({
    debounceMs: config.keyboard?.debounceMs ?? 300,
    hideOnBlurDelayMs: config.keyboard?.hideOnBlurDelayMs ?? 200,
  }))

  ipcMain.handle('keyboard:config', () => ({
    widthPercent: config.keyboard?.widthPercent ?? 65,
  }))

  ipcMain.on('keyboard:focus', () => {
    resetIdleIfActive()
    if (config.keyboard?.autoShowOnFocus !== false) {
      showKeyboard()
    }
  })

  ipcMain.on('keyboard:blur', () => {
    hideKeyboard()
  })

  ipcMain.on('ui:show-confirm', () => {
    resetIdleIfActive()
    showOverlay('confirm')
  })

  ipcMain.on('ui:hide-overlay', () => {
    resetIdleIfActive()
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
    resetIdleIfActive()
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
  keyboardView.webContents.loadFile(path.join(__dirname, 'shell', 'keyboard.html'))

  win.contentView.addChildView(contentView)
  win.contentView.addChildView(toolbarView)

  sessionManager = new SessionManager(contentView, config)
  sessionEnder = createSessionEnderInstance()

  attachWebContentsGuard(contentView.webContents)
  attachActivityTracking(contentView.webContents)
  attachActivityTracking(toolbarView.webContents)

  idleTimer = new IdleTimer(config, {
    showWarning: (seconds) => showOverlay('idle', { seconds }),
    updateWarning: (seconds) => {
      if (isOverlayVisible && !sessionEnder?.isEnding()) {
        overlayView.webContents.send('overlay:mode', { mode: 'idle', seconds })
      }
    },
    hideWarning: () => {
      if (isOverlayVisible && !sessionEnder?.isEnding()) hideOverlay()
    },
    onExpire: () => {
      log('IdleTimer: onExpire — automatyczne kończenie sesji')
      endSession().catch((error) => {
        log('auto idle end błąd:', error.message)
      })
    },
  })

  layoutViews()

  win.on('resize', layoutViews)

  toolbarView.webContents.loadFile(path.join(__dirname, 'shell', 'index.html'))
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
