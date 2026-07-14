function attachWebContentsGuard(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    webContents.loadURL(url)
    return { action: 'deny' }
  })
}

module.exports = { attachWebContentsGuard }
