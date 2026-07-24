/**
 * Hard session cap — ends the session after maxSessionMs regardless of soft idle resets.
 * Optional warningMs shows a countdown before the hard end.
 */
function createSessionLifetime({ maxSessionMs, warningMs = 0, onWarning, onExpire, log } = {}) {
  let warningTimer = null
  let endTimer = null

  function disarm() {
    if (warningTimer) {
      clearTimeout(warningTimer)
      warningTimer = null
    }
    if (endTimer) {
      clearTimeout(endTimer)
      endTimer = null
    }
  }

  function arm() {
    disarm()
    if (!maxSessionMs || maxSessionMs <= 0) return

    const warnLead = warningMs > 0 && warningMs < maxSessionMs ? warningMs : 0
    if (warnLead > 0 && typeof onWarning === 'function') {
      warningTimer = setTimeout(() => {
        warningTimer = null
        const seconds = Math.max(1, Math.floor(warnLead / 1000))
        log?.('[idle] hard session warning')
        onWarning(seconds)
      }, maxSessionMs - warnLead)
    }

    endTimer = setTimeout(() => {
      endTimer = null
      log?.('[idle] hard session cap reached')
      onExpire?.()
    }, maxSessionMs)
  }

  function destroy() {
    disarm()
  }

  return { arm, disarm, destroy }
}

module.exports = { createSessionLifetime }
