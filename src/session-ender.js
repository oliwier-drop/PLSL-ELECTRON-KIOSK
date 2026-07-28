/**
 * Orchestrates kiosk session teardown. Dependencies are injected so the flow
 * can be tested without Electron.
 */
function createSessionEnder(deps = {}) {
  let isEndingSession = false

  function isEnding() {
    return isEndingSession
  }

  async function endSession() {
    if (isEndingSession) {
      return {
        ok: true,
        skipped: true,
        url: deps.getCurrentUrl?.() ?? null,
      }
    }

    isEndingSession = true
    deps.stopIdleTimers?.()
    deps.showEndingOverlay?.()
    deps.log?.('endSession: start (overlay ending)')

    try {
      deps.log?.('Zakończenie sesji, obecny URL:', deps.getCurrentUrl?.())
      deps.hideKeyboard?.()

      await deps.clearSession?.()
      const afterUrl = await deps.loadHome?.()

      deps.hideOverlay?.()
      deps.notifySessionEnded?.(afterUrl)
      deps.log?.('Reset sesji zakończony, adres:', afterUrl)

      return { ok: true, url: afterUrl }
    } catch (error) {
      const message = error?.message || String(error)
      deps.log?.('endSession błąd:', message)
      deps.hideOverlay?.()
      deps.notifySessionError?.(message)
      return { ok: false, error: message }
    } finally {
      isEndingSession = false
      deps.disarmIdleTimer?.()
    }
  }

  return { endSession, isEnding }
}

/**
 * Resolves with the first settled promise, or rejects on timeout.
 */
function withTimeout(promise, timeoutMs, timeoutMessage = 'Timeout') {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Like Promise.race, but timeout resolves (does not reject) — used for
 * clearStorageData / clearCache best-effort cleanup.
 */
function withTimeoutResolve(promise, timeoutMs) {
  let timer = null
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

module.exports = {
  createSessionEnder,
  withTimeout,
  withTimeoutResolve,
}
