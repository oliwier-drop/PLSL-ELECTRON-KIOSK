const PERSONAL_PARTITION = 'persist:kiosk'
const SHARED_PARTITION = 'persist:kiosk-shared'

function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function isSharedUrl(url, sharedOrigins = []) {
  const origin = normalizeOrigin(url)
  if (!origin) return false

  const allowed = new Set(
    (sharedOrigins || []).map((item) => normalizeOrigin(item)).filter(Boolean)
  )
  return allowed.has(origin)
}

function isBlankUrl(url) {
  return !url || url === 'about:blank' || url.startsWith('about:blank?')
}

function matchesHomeUrl(url, homeUrl) {
  const homeOrigin = normalizeOrigin(homeUrl)
  const urlOrigin = normalizeOrigin(url)
  return Boolean(homeOrigin && urlOrigin && homeOrigin === urlOrigin)
}

/**
 * Clears only the personal kiosk partition. Shared (Jira etc.) is left intact.
 */
function createPersonalSessionCleaner({
  getPersonalSession,
  getActiveDownloads,
  withTimeoutResolve,
} = {}) {
  return async function clearPersonalSession() {
    const downloads = getActiveDownloads?.()
    if (downloads) {
      for (const item of downloads.values()) {
        item.cancel()
      }
      downloads.clear()
    }

    const personalSession = getPersonalSession?.()
    if (!personalSession) return

    await withTimeoutResolve(personalSession.clearStorageData(), 8000)
    await withTimeoutResolve(personalSession.clearCache(), 5000)
    personalSession.clearAuthCache()
  }
}

function createContentWorkspace({
  win,
  personalView,
  sharedView,
  homeUrl,
  sharedOrigins = [],
  restackChrome,
  log,
} = {}) {
  let active = 'personal'

  function getActiveKind() {
    return active
  }

  function getActiveView() {
    return active === 'shared' ? sharedView : personalView
  }

  function getActiveWebContents() {
    const view = getActiveView()
    return view?.webContents ?? null
  }

  function setContentBounds(bounds) {
    personalView?.setBounds(bounds)
    sharedView?.setBounds(bounds)
  }

  function setActive(kind) {
    if (!win || win.isDestroyed()) return

    const next = kind === 'shared' ? 'shared' : 'personal'
    const nextView = next === 'shared' ? sharedView : personalView

    try {
      win.contentView.removeChildView(personalView)
    } catch {
      // not attached
    }
    try {
      win.contentView.removeChildView(sharedView)
    } catch {
      // not attached
    }

    win.contentView.addChildView(nextView)
    active = next
    restackChrome?.()
    log?.(`content workspace: active=${active}`)
  }

  async function showPersonal(url) {
    setActive('personal')
    const webContents = personalView?.webContents
    if (!webContents || webContents.isDestroyed()) return null
    if (url) {
      await webContents.loadURL(url)
    }
    return webContents.getURL()
  }

  async function showShared(url) {
    setActive('shared')
    const webContents = sharedView?.webContents
    if (!webContents || webContents.isDestroyed()) return null
    if (url) {
      await webContents.loadURL(url)
    }
    return webContents.getURL()
  }

  function routeUrl(url) {
    if (isBlankUrl(url)) return
    if (isSharedUrl(url, sharedOrigins)) {
      showShared(url).catch((error) => {
        log?.('showShared błąd:', error.message)
      })
      return
    }
    showPersonal(url).catch((error) => {
      log?.('showPersonal błąd:', error.message)
    })
  }

  function attachRouting(webContents, mode) {
    if (!webContents) return

    webContents.on('will-navigate', (event, url) => {
      if (mode === 'personal' && isSharedUrl(url, sharedOrigins)) {
        event.preventDefault()
        showShared(url).catch((error) => log?.('route→shared:', error.message))
        return
      }

      // Z shared wracamy TYLKO na hub — SSO Atlassian (id.atlassian.com itd.)
      // musi zostać w tej samej partycji, inaczej logowanie się psuje.
      if (mode === 'shared' && !isBlankUrl(url) && matchesHomeUrl(url, homeUrl)) {
        event.preventDefault()
        showPersonal(url).catch((error) => log?.('route→personal:', error.message))
      }
    })

    webContents.setWindowOpenHandler(({ url }) => {
      if (mode === 'personal' && isSharedUrl(url, sharedOrigins)) {
        showShared(url).catch((error) => log?.('popup→shared:', error.message))
        return { action: 'deny' }
      }

      if (mode === 'shared' && !isBlankUrl(url) && matchesHomeUrl(url, homeUrl)) {
        showPersonal(url).catch((error) => log?.('popup→personal:', error.message))
        return { action: 'deny' }
      }

      if (!webContents.isDestroyed()) {
        webContents.loadURL(url).catch(() => {})
      }
      return { action: 'deny' }
    })
  }

  function matchesHome(url) {
    return matchesHomeUrl(url, homeUrl)
  }

  return {
    PERSONAL_PARTITION,
    SHARED_PARTITION,
    getActiveKind,
    getActiveView,
    getActiveWebContents,
    setContentBounds,
    setActive,
    showPersonal,
    showShared,
    routeUrl,
    attachRouting,
    matchesHome,
    isSharedUrl: (url) => isSharedUrl(url, sharedOrigins),
  }
}

module.exports = {
  PERSONAL_PARTITION,
  SHARED_PARTITION,
  normalizeOrigin,
  isSharedUrl,
  isBlankUrl,
  matchesHomeUrl,
  createPersonalSessionCleaner,
  createContentWorkspace,
}
