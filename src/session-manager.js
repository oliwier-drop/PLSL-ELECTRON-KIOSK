class SessionManager {
  constructor(contentView, config) {
    this.contentView = contentView
    this.config = config
  }

  goBack() {
    const { webContents } = this.contentView
    if (webContents.isDestroyed()) return

    const history = webContents.navigationHistory
    if (history?.canGoBack()) {
      history.goBack()
    }
  }

  async goHome() {
    const { webContents } = this.contentView
    if (webContents.isDestroyed()) return
    await webContents.loadURL(this.config.homeUrl)
  }

  refresh() {
    const { webContents } = this.contentView
    if (webContents.isDestroyed()) return
    webContents.reload()
  }
}

module.exports = { SessionManager }
