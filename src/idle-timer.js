class IdleTimer {
  constructor(config, mainWindow, onEndSession) {
    this.config = config
    this.mainWindow = mainWindow
    this.onEndSession = onEndSession
    this.warningTimer = null
    this.endTimer = null
    this.countdownInterval = null
    this.remainingSeconds = 0
    this.reset()
  }

  clearTimers() {
    if (this.warningTimer) {
      clearTimeout(this.warningTimer)
      this.warningTimer = null
    }
    if (this.endTimer) {
      clearTimeout(this.endTimer)
      this.endTimer = null
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = null
    }
  }

  hideWarning() {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('idle:hide')
    }
  }

  showWarning() {
    this.remainingSeconds = Math.floor(this.config.idle.countdownMs / 1000)

    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('idle:warning', {
        seconds: this.remainingSeconds,
      })
    }

    this.countdownInterval = setInterval(() => {
      this.remainingSeconds -= 1
      if (this.remainingSeconds <= 0) {
        clearInterval(this.countdownInterval)
        this.countdownInterval = null
        return
      }
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('idle:warning', {
          seconds: this.remainingSeconds,
        })
      }
    }, 1000)

    this.endTimer = setTimeout(() => {
      this.clearTimers()
      this.hideWarning()
      this.onEndSession()
    }, this.config.idle.countdownMs)
  }

  reset() {
    this.clearTimers()
    this.hideWarning()

    this.warningTimer = setTimeout(() => {
      this.showWarning()
    }, this.config.idle.warningAfterMs)
  }

  continueSession() {
    this.reset()
  }

  endNow() {
    this.clearTimers()
    this.hideWarning()
    this.onEndSession()
  }

  destroy() {
    this.clearTimers()
  }
}

module.exports = { IdleTimer }
