class SessionManager {
  constructor(workspace, config) {
    this.workspace = workspace
    this.config = config
  }

  goBack() {
    const webContents = this.workspace.getActiveWebContents()
    if (!webContents || webContents.isDestroyed()) return

    const history = webContents.navigationHistory
    if (history?.canGoBack()) {
      history.goBack()
    }
  }

  async goHome() {
    await this.workspace.showPersonal(this.config.homeUrl)
  }

  refresh() {
    const webContents = this.workspace.getActiveWebContents()
    if (!webContents || webContents.isDestroyed()) return
    webContents.reload()
  }
}

module.exports = { SessionManager }
