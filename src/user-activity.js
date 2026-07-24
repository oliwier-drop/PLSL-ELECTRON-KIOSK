/**
 * Debounced gate for user-initiated activity that may reset the soft idle timer.
 * Passive page events (SPA navigate-in-page) must NOT pass through here.
 */
function createUserActivityGate({ debounceMs = 1000, onActivity, shouldAllowReset, log } = {}) {
  let cooldownUntil = 0

  function signal(source) {
    if (shouldAllowReset && !shouldAllowReset()) {
      log?.(`[idle] ignored: ${source}`)
      return false
    }

    const now = Date.now()
    if (now < cooldownUntil) {
      return false
    }

    cooldownUntil = now + debounceMs
    log?.(`[idle] reset from: ${source}`)
    onActivity?.(source)
    return true
  }

  function resetCooldown() {
    cooldownUntil = 0
  }

  function destroy() {
    cooldownUntil = 0
  }

  return { signal, resetCooldown, destroy }
}

module.exports = { createUserActivityGate }
