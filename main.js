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
const { SessionManager } = require('./src/session-manager')
const { IdleTimer } = require('./src/idle-timer')
const { createUserActivityGate } = require('./src/user-activity')
const { createSessionLifetime } = require('./src/session-lifetime')
const {
  PERSONAL_PARTITION,
  SHARED_PARTITION,
  createContentWorkspace,
  createPersonalSessionCleaner,
} = require('./src/content-workspace')
const {
  createSessionEnder,
  withTimeout,
  withTimeoutResolve,
} = require('./src/session-ender')

let win = null
let toolbarView = null
let personalView = null
let sharedView = null
let overlayView = null
let keyboardView = null
let workspace = null
let sessionManager = null
let idleTimer = null
let userActivityGate = null
let sessionLifetime = null
let sessionEnder = null
let isOverlayVisible = false
let isKeyboardVisible = false
let keyboardProgress = 0
let keyboardAnimTimer = null
let keyboardAnimToken = 0

const KEYBOARD_HEIGHT = config.keyboard?.height ?? 270
const KEYBOARD_ANIM_MS = config.keyboard?.animationMs ?? 280
const activeDownloads = new Map()

const clearPersonalSession = createPersonalSessionCleaner({
  getPersonalSession: () => session.fromPartition(PERSONAL_PARTITION),
  getActiveDownloads: () => activeDownloads,
  withTimeoutResolve,
})

if (config.dev.ignoreCertificateErrors) {
  app.commandLine.appendSwitch('ignore-certificate-errors')
}

function log(...args) {
  console.log('[kiosk]', ...args)
}

log('Konfiguracja homeUrl:', config.homeUrl, '| plik:', getConfigPath())
log('sharedOrigins:', (config.sharedOrigins || []).join(', ') || '(brak)')

function attachDownloadTracking(partitionName) {
  const kioskSession = session.fromPartition(partitionName)
  kioskSession.on('will-download', (_event, item) => {
    const id = item.getURL()
    activeDownloads.set(id, item)
    item.on('done', () => activeDownloads.delete(id))
  })
}

function setupKioskSessions() {
  attachDownloadTracking(PERSONAL_PARTITION)
  attachDownloadTracking(SHARED_PARTITION)
}

function getWindowSize() {
  const [width, height] = win.getContentSize()
  return { width, height }
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

function stopKeyboardAnimation() {
  if (keyboardAnimTimer) {
    clearTimeout(keyboardAnimTimer)
    keyboardAnimTimer = null
  }
  keyboardAnimToken += 1
}

function restackChrome() {
  if (!win || win.isDestroyed()) return
  if (toolbarView) {
    try {
      win.contentView.removeChildView(toolbarView)
    } catch {
      // ignore
    }
    win.contentView.addChildView(toolbarView)
  }
  if (isKeyboardVisible && keyboardView) {
    try {
      win.contentView.removeChildView(keyboardView)
    } catch {
      // ignore
    }
    win.contentView.addChildView(keyboardView)
  }
  if (isOverlayVisible && overlayView) {
    try {
      win.contentView.removeChildView(overlayView)
    } catch {
      // ignore
    }
    win.contentView.addChildView(overlayView)
  }
}

function applyKeyboardLayout(progress) {
  if (!win || win.isDestroyed()) return

  const { width, height } = getWindowSize()
  const toolbarHeight = config.toolbarHeight
  const keyboardSpace = Math.round(KEYBOARD_HEIGHT * progress)
  const contentBounds = {
    x: 0,
    y: toolbarHeight,
    width,
    height: Math.max(0, height - toolbarHeight - keyboardSpace),
  }

  toolbarView.setBounds({ x: 0, y: 0, width, height: toolbarHeight })
  workspace?.setContentBounds(contentBounds)

  if (isOverlayVisible) {
    overlayView.setBounds({ x: 0, y: 0, width, height })
  }

  if (progress > 0 || isKeyboardVisible) {
    keyboardView.setBounds({
      x: 0,
      y: height - keyboardSpace,
      width,
      height: KEYBOARD_HEIGHT,
    })
  }
}

function layoutViews() {
  if (!win || win.isDestroyed()) return
  applyKeyboardLayout(keyboardProgress)
}

function animateKeyboardTo(targetProgress) {
  stopKeyboardAnimation()
  const token = keyboardAnimToken
  const startProgress = keyboardProgress
  const delta = targetProgress - startProgress
  if (Math.abs(delta) < 0.001) {
    keyboardProgress = targetProgress
    applyKeyboardLayout(keyboardProgress)
    return Promise.resolve()
  }

  const startedAt = Date.now()
  const duration = Math.max(1, Math.round(KEYBOARD_ANIM_MS * Math.abs(delta)))

  return new Promise((resolve) => {
    const tick = () => {
      if (token !== keyboardAnimToken) {
        resolve()
        return
      }

      const t = Math.min(1, (Date.now() - startedAt) / duration)
      keyboardProgress = startProgress + delta * easeOutCubic(t)
      applyKeyboardLayout(keyboardProgress)

      if (t < 1) {
        keyboardAnimTimer = setTimeout(tick, 16)
        return
      }

      keyboardAnimTimer = null
      keyboardProgress = targetProgress
      applyKeyboardLayout(keyboardProgress)
      resolve()
    }

    tick()
  })
}

function getActiveWebContents() {
  return workspace?.getActiveWebContents?.() ?? null
}

function notifyKeyboardVisibility() {
  if (toolbarView && !toolbarView.webContents.isDestroyed()) {
    toolbarView.webContents.send('keyboard:visibility', {
      visible: isKeyboardVisible,
    })
  }
}

function showKeyboard() {
  if (!win || win.isDestroyed()) return
  if (isKeyboardVisible && keyboardProgress >= 1) return

  if (!isKeyboardVisible) {
    win.contentView.addChildView(keyboardView)
    if (isOverlayVisible) {
      win.contentView.addChildView(overlayView)
    }
  }

  isKeyboardVisible = true
  notifyKeyboardVisibility()
  animateKeyboardTo(1)
}

function hideKeyboard() {
  if (!win || win.isDestroyed()) return
  if (!isKeyboardVisible && keyboardProgress <= 0) return

  isKeyboardVisible = false
  notifyKeyboardVisibility()
  animateKeyboardTo(0).then(() => {
    if (!win || win.isDestroyed() || isKeyboardVisible || keyboardProgress > 0) return
    try {
      win.contentView.removeChildView(keyboardView)
    } catch {
      // already removed
    }
  })

  const active = getActiveWebContents()
  if (active && !active.isDestroyed()) {
    active.send('blur-active-element')
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

  const active = getActiveWebContents()
  if (active && !active.isDestroyed()) {
    active.focus()
  }
}

function signalUserActivity(source) {
  if (sessionEnder?.isEnding()) return
  // W Jirze (shared) timery sesji są wstrzymane — nie resetuj ich aktywnością.
  if (workspace?.getActiveKind?.() === 'shared') return
  userActivityGate?.signal(source)
}

function pauseSessionTimersForShared() {
  if (!idleTimer || !sessionLifetime) return
  if (sessionEnder?.isEnding()) return

  idleTimer.cancelWarning()
  idleTimer.stopTimers()
  sessionLifetime.disarm()
  log('Timery sesji wstrzymane (widok shared / Jira)')
}

function resumeSessionTimersForPersonal() {
  if (!idleTimer || !sessionLifetime) return
  if (sessionEnder?.isEnding()) return

  idleTimer.reset({ force: true })
  sessionLifetime.arm()
  log('Timery sesji wznowione od zera (widok personal)')
}

function attachInputActivityTracking(webContents, source) {
  webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown' && input.type !== 'mouseDown') return
    signalUserActivity(source)
  })
}

function createBrowserView(partitionName) {
  return new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'browser-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: partitionName,
    },
  })
}

async function loadHome() {
  const LOAD_TIMEOUT_MS = 15_000

  try {
    const personalWc = personalView?.webContents
    if (personalWc && !personalWc.isDestroyed()) {
      try {
        personalWc.navigationHistory.clear()
      } catch (error) {
        log('Nie udało się wyczyścić historii personal:', error.message)
      }
    }

    log('Ładowanie strony głównej (personal):', config.homeUrl)
    await withTimeout(
      workspace.showPersonal(config.homeUrl),
      LOAD_TIMEOUT_MS,
      'Timeout ładowania homeUrl'
    )
  } catch (error) {
    log('Home nie załadowany, ładuję pustkę bezpieczeństwa:', error.message)
    try {
      await workspace.showPersonal('about:blank')
    } catch (blankError) {
      log('Nie udało się załadować about:blank:', blankError.message)
    }
  }

  const active = getActiveWebContents()
  return active && !active.isDestroyed() ? active.getURL() : config.homeUrl
}

function createSessionEnderInstance() {
  return createSessionEnder({
    getCurrentUrl: () => {
      const active = getActiveWebContents()
      return active && !active.isDestroyed() ? active.getURL() : null
    },
    stopIdleTimers: () => {
      idleTimer?.stopTimers()
      sessionLifetime?.disarm()
    },
    showEndingOverlay: () => showOverlay('ending'),
    hideKeyboard: () => {
      if (isKeyboardVisible) hideKeyboard()
    },
    clearSession: () => clearPersonalSession(),
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
    restartIdleTimer: () => {
      idleTimer?.reset({ force: true })
      sessionLifetime?.arm()
    },
    log,
  })
}

function endSession() {
  return sessionEnder.endSession()
}

function setupIpc() {
  ipcMain.handle('nav:back', () => {
    signalUserActivity('nav-back')
    sessionManager?.goBack()
  })

  ipcMain.handle('nav:home', async () => {
    signalUserActivity('nav-home')
    await sessionManager?.goHome()
  })

  ipcMain.handle('nav:refresh', () => {
    signalUserActivity('nav-refresh')
    sessionManager?.refresh()
  })

  ipcMain.handle('keyboard:show', async () => {
    showKeyboard()
    return true
  })

  ipcMain.handle('keyboard:toggle', async () => {
    if (isKeyboardVisible) {
      hideKeyboard()
      return { visible: false }
    }
    showKeyboard()
    return { visible: true }
  })

  ipcMain.on('keyboard:hide', () => {
    hideKeyboard()
    const active = getActiveWebContents()
    if (active && !active.isDestroyed()) {
      active.focus()
    }
  })

  ipcMain.on('keyboard:key', (_event, { key }) => {
    const active = getActiveWebContents()
    if (!active || active.isDestroyed()) return

    if (key === '{esc}') {
      hideKeyboard()
      if (!active.isDestroyed()) {
        active.focus()
      }
      return
    }

    signalUserActivity('keyboard-key')
    active.send('keyboard:inject', { key })
  })

  ipcMain.handle('keyboard:timing', () => ({
    debounceMs: config.keyboard?.debounceMs ?? 300,
    hideOnBlurDelayMs: config.keyboard?.hideOnBlurDelayMs ?? 200,
  }))

  ipcMain.handle('keyboard:config', () => ({
    widthPercent: config.keyboard?.widthPercent ?? 65,
  }))

  ipcMain.on('keyboard:focus', () => {
    if (config.keyboard?.autoShowOnFocus !== false) {
      showKeyboard()
    }
  })

  ipcMain.on('keyboard:blur', () => {
    hideKeyboard()
  })

  ipcMain.on('ui:show-confirm', () => {
    signalUserActivity('ui-confirm')
    showOverlay('confirm')
  })

  ipcMain.on('ui:hide-overlay', () => {
    signalUserActivity('ui-hide-overlay')
    hideOverlay()
  })

  ipcMain.handle('confirm:accept', async () => {
    return endSession()
  })

  ipcMain.handle('idle:continue', () => {
    hideOverlay()
    idleTimer?.continueSession()
    sessionLifetime?.arm()
  })

  ipcMain.handle('idle:endNow', async () => {
    return endSession()
  })

  ipcMain.on('activity:ping', () => {
    signalUserActivity('toolbar')
  })

  ipcMain.on('activity:user', (_event, payload) => {
    const source = payload?.source || 'user'
    signalUserActivity(source)
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

  personalView = createBrowserView(PERSONAL_PARTITION)
  sharedView = createBrowserView(SHARED_PARTITION)

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

  workspace = createContentWorkspace({
    win,
    personalView,
    sharedView,
    homeUrl: config.homeUrl,
    sharedOrigins: config.sharedOrigins || [],
    restackChrome,
    onActiveChange: (kind) => {
      if (kind === 'shared') {
        pauseSessionTimersForShared()
      } else {
        resumeSessionTimersForPersonal()
      }
    },
    log,
  })

  workspace.setActive('personal')

  sessionManager = new SessionManager(workspace, config)
  sessionEnder = createSessionEnderInstance()

  workspace.attachRouting(personalView.webContents, 'personal')
  workspace.attachRouting(sharedView.webContents, 'shared')

  attachInputActivityTracking(personalView.webContents, 'personal-input')
  attachInputActivityTracking(sharedView.webContents, 'shared-input')
  attachInputActivityTracking(toolbarView.webContents, 'toolbar-input')

  sharedView.webContents.loadURL('about:blank').catch(() => {})

  idleTimer = new IdleTimer(config, {
    showWarning: (seconds, options = {}) => {
      showOverlay('idle', {
        seconds,
        allowContinue: options.allowContinue !== false,
      })
    },
    updateWarning: (seconds, options = {}) => {
      if (isOverlayVisible && !sessionEnder?.isEnding()) {
        overlayView.webContents.send('overlay:mode', {
          mode: 'idle',
          seconds,
          allowContinue: options.allowContinue !== false,
        })
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

  const idleLog = config.dev?.logIdleResets ? log : undefined

  userActivityGate = createUserActivityGate({
    debounceMs: config.activityDebounceMs ?? 1000,
    onActivity: () => idleTimer?.reset(),
    shouldAllowReset: () => !idleTimer?.shouldIgnoreActivity?.(),
    log: idleLog,
  })

  sessionLifetime = createSessionLifetime({
    maxSessionMs: config.idle.endAfterMs,
    warningMs: config.idle.countdownMs,
    onWarning: () => {
      log('SessionLifetime: ostrzeżenie przed twardym limitem sesji')
      idleTimer?.forceWarning()
    },
    onExpire: () => {
      log('SessionLifetime: twardy limit sesji — automatyczne kończenie')
      endSession().catch((error) => {
        log('hard cap end błąd:', error.message)
      })
    },
    log: idleLog,
  })
  sessionLifetime.arm()

  layoutViews()

  win.on('resize', layoutViews)

  toolbarView.webContents.loadFile(path.join(__dirname, 'shell', 'index.html'))
  overlayView.webContents.loadFile(path.join(__dirname, 'shell', 'overlay.html'))

  personalView.webContents.loadURL(config.homeUrl).catch((error) => {
    log('Błąd startowej strony głównej:', error.message)
  })
}

app.whenReady().then(() => {
  const { globalShortcut } = require('electron')

  setupKioskSessions()
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
  stopKeyboardAnimation()
  idleTimer?.destroy()
  userActivityGate?.destroy()
  sessionLifetime?.destroy()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
