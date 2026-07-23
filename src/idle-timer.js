class IdleTimer {
  constructor(config, callbacks) {
    this.config = config
    this.callbacks = callbacks
    this.warningTimer = null
    this.endTimer = null
    this.countdownInterval = null
    this.remainingSeconds = 0
    this.isExpiring = false
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

  /** Stop timers without hiding the warning overlay (used while ending session). */
  stopTimers() {
    this.clearTimers()
  }

  showWarning() {
    this.isExpiring = false
    this.remainingSeconds = Math.floor(this.config.idle.countdownMs / 1000)
    this.callbacks.showWarning?.(this.remainingSeconds)

    this.countdownInterval = setInterval(() => {
      this.remainingSeconds -= 1
      if (this.remainingSeconds <= 0) {
        this.expire()
        return
      }
      this.callbacks.updateWarning?.(this.remainingSeconds)
    }, 1000)

    this.endTimer = setTimeout(() => {
      this.expire()
    }, this.config.idle.countdownMs)
  }

  expire() {
    if (this.isExpiring) return
    this.isExpiring = true
    this.clearTimers()
    try {
      this.callbacks.onExpire?.()
    } catch (error) {
      this.isExpiring = false
      throw error
    }
  }

  cancelWarning() {
    this.isExpiring = false
    this.clearTimers()
    this.callbacks?.hideWarning?.()
  }

  reset() {
    this.isExpiring = false
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
    this.isExpiring = false
    this.clearTimers()
  }
}

module.exports = { IdleTimer }
