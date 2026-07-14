function isHostAllowed(url, allowedHosts) {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') {
      return false
    }
    return allowedHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    )
  } catch {
    return false
  }
}

function attachNavigationGuard(webContents, config, onBlocked) {
  const guard = (event, url) => {
    if (!isHostAllowed(url, config.allowedHosts)) {
      event.preventDefault()
      onBlocked?.(`Nawigacja zablokowana: ${url}`)
    }
  }

  webContents.on('will-navigate', guard)
  webContents.on('will-redirect', guard)

  webContents.setWindowOpenHandler(({ url }) => {
    if (isHostAllowed(url, config.allowedHosts)) {
      webContents.loadURL(url)
    } else {
      onBlocked?.(`Otwarcie okna zablokowane: ${url}`)
    }
    return { action: 'deny' }
  })

  webContents.session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      if (details.resourceType === 'mainFrame') {
        if (!isHostAllowed(details.url, config.allowedHosts)) {
          onBlocked?.(`Żądanie zablokowane: ${details.url}`)
          callback({ cancel: true })
          return
        }
      }
      callback({ cancel: false })
    }
  )
}

module.exports = { isHostAllowed, attachNavigationGuard }
