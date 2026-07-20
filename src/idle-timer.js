class IdleTimer {
  constructor(config, callbacks) {
    this.config = config
    this.callbacks = callbacks
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

  showWarning() {
    this.remainingSeconds = Math.floor(this.config.idle.countdownMs / 1000)
    this.callbacks.showWarning?.(this.remainingSeconds)

    this.countdownInterval = setInterval(() => {
      this.remainingSeconds -= 1
      if (this.remainingSeconds <= 0) {
        clearInterval(this.countdownInterval)
        this.countdownInterval = null
        return
      }
      this.callbacks.updateWarning?.(this.remainingSeconds)
    }, 1000)

    this.endTimer = setTimeout(() => {
      this.clearTimers()
      this.callbacks.onExpire?.()
    }, this.config.idle.countdownMs)
  }

  cancelWarning() {
    this.clearTimers()
    this.callbacks?.hideWarning?.()
  }

  reset() {
    this.clearTimers()
    this.callbacks?.hideWarning?.()

    this.warningTimer = setTimeout(() => {
      this.showWarning()
    }, this.config.idle.warningAfterMs)
  }

  continueSession() {
    this.reset()
  }

  destroy() {
    this.clearTimers()
  }
}

module.exports = { IdleTimer }
