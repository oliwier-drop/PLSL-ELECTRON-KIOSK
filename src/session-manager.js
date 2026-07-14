class SessionManager {
  constructor(browserView, config) {
    this.browserView = browserView
    this.config = config
    this.activeDownloads = new Map()
    this.childWindows = new Set()

    const session = browserView.webContents.session

    session.on('will-download', (_event, item) => {
      const id = item.getURL()
      this.activeDownloads.set(id, item)
      item.on('done', () => this.activeDownloads.delete(id))
    })
  }

  registerChildWindow(window) {
    this.childWindows.add(window)
    window.on('closed', () => this.childWindows.delete(window))
  }

  goBack() {
    const { webContents } = this.browserView
    if (webContents.canGoBack()) {
      webContents.goBack()
    }
  }

  goHome() {
    this.browserView.webContents.loadURL(this.config.homeUrl)
  }

  refresh() {
    this.browserView.webContents.reload()
  }

  async endSession() {
    for (const item of this.activeDownloads.values()) {
      item.cancel()
    }
    this.activeDownloads.clear()

    for (const childWindow of this.childWindows) {
      if (!childWindow.isDestroyed()) {
        childWindow.close()
      }
    }
    this.childWindows.clear()

    const { webContents } = this.browserView
    const session = webContents.session

    webContents.stop()
    await session.clearStorageData()
    await session.clearCache()
    session.clearAuthCache()
    await webContents.loadURL(this.config.homeUrl)
  }
}

module.exports = { SessionManager }
