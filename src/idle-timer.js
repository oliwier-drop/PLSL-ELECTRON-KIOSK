class IdleTimer {
  constructor(config, callbacks) {
    this.config = config
    this.callbacks = callbacks
    this.warningTimer = null
    this.endTimer = null
    this.countdownInterval = null
    this.remainingSeconds = 0
    this.isExpiring = false
    this.warningActive = false
    this.reset({ force: true })
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

  /** True while idle warning is on screen or session is expiring — ignore activity resets. */
  shouldIgnoreActivity() {
    return this.warningActive || this.isExpiring
  }

  /** Stop timers without hiding the warning overlay (used while ending session). */
  stopTimers() {
    this.clearTimers()
  }

  showWarning() {
    this.isExpiring = false
    this.warningActive = true
    this.remainingSeconds = Math.max(1, Math.floor(this.config.idle.countdownMs / 1000))
    this.callbacks.showWarning?.(this.remainingSeconds)

    this.countdownInterval = setInterval(() => {
      this.remainingSeconds -= 1
      if (this.remainingSeconds <= 0) {
        this.callbacks.updateWarning?.(0)
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
    this.warningActive = false
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
    this.warningActive = false
    this.clearTimers()
    this.callbacks?.hideWarning?.()
  }

  /**
   * @param {{ force?: boolean }} [options]
   * Without force, ignores resets while warning/expire is active so SPA
   * navigation or toolbar pings cannot cancel the countdown.
   */
  reset(options = {}) {
    const force = options.force === true
    if (!force && this.shouldIgnoreActivity()) {
      return false
    }

    this.isExpiring = false
    this.warningActive = false
    this.clearTimers()
    this.callbacks?.hideWarning?.()

    this.warningTimer = setTimeout(() => {
      this.showWarning()
    }, this.config.idle.warningAfterMs)

    return true
  }

  continueSession() {
    return this.reset({ force: true })
  }

  destroy() {
    this.isExpiring = false
    this.warningActive = false
    this.clearTimers()
  }
}

module.exports = { IdleTimer }
