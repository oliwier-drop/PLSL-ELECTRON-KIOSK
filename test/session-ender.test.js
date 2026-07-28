const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const { IdleTimer } = require('../src/idle-timer')
const {
  createSessionEnder,
  withTimeout,
  withTimeoutResolve,
} = require('../src/session-ender')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createTrackingEnder(overrides = {}) {
  const steps = []
  const ender = createSessionEnder({
    getCurrentUrl: () => 'https://app.example/page',
    stopIdleTimers: () => steps.push('stopIdle'),
    showEndingOverlay: () => steps.push('showEnding'),
    hideKeyboard: () => steps.push('hideKeyboard'),
    clearSession: async () => {
      steps.push('clearSession')
    },
    loadHome: async () => {
      steps.push('loadHome')
      return 'https://home.example'
    },
    hideOverlay: () => steps.push('hideOverlay'),
    notifySessionEnded: (url) => steps.push(`ended:${url}`),
    notifySessionError: (msg) => steps.push(`error:${msg}`),
    disarmIdleTimer: () => steps.push('disarmIdle'),
    log: () => {},
    ...overrides,
  })
  return { ender, steps }
}

describe('session-ender endSession', () => {
  it('wykonuje pełną sekwencję kończenia sesji w kolejności', async () => {
    const { ender, steps } = createTrackingEnder()

    const result = await ender.endSession()

    assert.deepEqual(result, { ok: true, url: 'https://home.example' })
    assert.deepEqual(steps, [
      'stopIdle',
      'showEnding',
      'hideKeyboard',
      'clearSession',
      'loadHome',
      'hideOverlay',
      'ended:https://home.example',
      'disarmIdle',
    ])
    assert.equal(ender.isEnding(), false)
  })

  it('równoległe endSession nie uruchamia clearSession dwa razy', async () => {
    let clears = 0
    let releaseClear
    const clearGate = new Promise((resolve) => {
      releaseClear = resolve
    })

    const { ender, steps } = createTrackingEnder({
      clearSession: async () => {
        clears += 1
        steps.push('clearSession')
        await clearGate
      },
    })

    const first = ender.endSession()
    const second = ender.endSession()

    assert.equal(ender.isEnding(), true)
    releaseClear()

    const [a, b] = await Promise.all([first, second])

    assert.equal(clears, 1)
    assert.equal(a.ok, true)
    assert.equal(b.ok, true)
    assert.equal(b.skipped, true)
    assert.equal(steps.filter((s) => s === 'clearSession').length, 1)
    assert.equal(steps.filter((s) => s === 'disarmIdle').length, 1)
  })

  it('przy błędzie clearSession chowa overlay, raportuje błąd i rozbraja idle', async () => {
    const { ender, steps } = createTrackingEnder({
      clearSession: async () => {
        steps.push('clearSession')
        throw new Error('storage locked')
      },
    })

    const result = await ender.endSession()

    assert.equal(result.ok, false)
    assert.equal(result.error, 'storage locked')
    assert.ok(steps.includes('showEnding'))
    assert.ok(steps.includes('hideOverlay'))
    assert.ok(steps.includes('error:storage locked'))
    assert.ok(steps.includes('disarmIdle'))
    assert.ok(!steps.includes('loadHome'))
    assert.equal(ender.isEnding(), false)
  })

  it('przy błędzie loadHome nadal rozbraja idle w finally', async () => {
    const { ender, steps } = createTrackingEnder({
      loadHome: async () => {
        steps.push('loadHome')
        throw new Error('dns fail')
      },
    })

    const result = await ender.endSession()

    assert.equal(result.ok, false)
    assert.equal(result.error, 'dns fail')
    assert.ok(steps.includes('clearSession'))
    assert.ok(steps.includes('disarmIdle'))
  })
})

describe('withTimeout helpers', () => {
  it('withTimeout odrzuca po limicie czasu', async () => {
    await assert.rejects(
      () => withTimeout(delay(50), 10, 'Timeout ładowania'),
      /Timeout ładowania/
    )
  })

  it('withTimeoutResolve kończy się po limicie mimo wiszącego promise', async () => {
    let settled = false
    const hung = new Promise(() => {})
    const started = Date.now()
    await withTimeoutResolve(hung, 20)
    settled = true
    assert.equal(settled, true)
    assert.ok(Date.now() - started >= 15)
  })
})

describe('IdleTimer + SessionEnder integration', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  it('po countdown onExpire uruchamia endSession mimo activity resetów', async () => {
    const { ender, steps } = createTrackingEnder()
    let expirePromise = null

    const timer = new IdleTimer(
      { idle: { warningAfterMs: 100, countdownMs: 2000 } },
      {
        showWarning: () => steps.push('warn'),
        updateWarning: (s) => steps.push(`tick:${s}`),
        hideWarning: () => steps.push('hideWarn'),
        onExpire: () => {
          steps.push('expire')
          expirePromise = ender.endSession()
        },
      }
    )
    timer.reset({ force: true })

    mock.timers.tick(100)
    assert.ok(steps.includes('warn'))

    // Symuluj agresywne pingoanie aktywności podczas odliczania
    for (let i = 0; i < 10; i += 1) {
      assert.equal(timer.reset(), false)
      mock.timers.tick(100)
    }

    mock.timers.tick(2000)
    assert.ok(steps.includes('expire'))
    assert.ok(expirePromise, 'endSession powinien być uruchomiony z onExpire')

    await expirePromise

    assert.ok(steps.includes('showEnding'))
    assert.ok(steps.includes('clearSession'))
    assert.ok(steps.includes('loadHome'))
    assert.ok(steps.includes('hideOverlay'))
    assert.ok(steps.includes('disarmIdle'))
    assert.equal(steps.filter((s) => s === 'expire').length, 1)

    timer.destroy()
  })

  it('Kontynuuj (force reset) blokuje auto endSession', async () => {
    const { ender, steps } = createTrackingEnder()

    const timer = new IdleTimer(
      { idle: { warningAfterMs: 50, countdownMs: 2000 } },
      {
        showWarning: () => {},
        updateWarning: () => {},
        hideWarning: () => {},
        onExpire: () => {
          steps.push('expire')
          ender.endSession()
        },
      }
    )
    timer.reset({ force: true })

    mock.timers.tick(50)
    timer.continueSession()
    mock.timers.tick(5000)

    assert.ok(!steps.includes('expire'))
    assert.ok(!steps.includes('clearSession'))

    timer.destroy()
  })

  it('ręczny endSession w trakcie countdown zatrzymuje timer i kończy sesję', async () => {
    let timer = null
    const { ender, steps } = createTrackingEnder({
      stopIdleTimers: () => {
        steps.push('stopIdle')
        timer?.stopTimers()
      },
    })

    timer = new IdleTimer(
      { idle: { warningAfterMs: 50, countdownMs: 5000 } },
      {
        showWarning: () => steps.push('warn'),
        updateWarning: () => {},
        hideWarning: () => {},
        onExpire: () => {
          steps.push('expire')
          ender.endSession()
        },
      }
    )
    timer.reset({ force: true })

    mock.timers.tick(50)
    const result = await ender.endSession()
    assert.equal(result.ok, true)

    mock.timers.tick(10000)
    assert.ok(!steps.includes('expire'))
    assert.equal(steps.filter((s) => s === 'clearSession').length, 1)

    timer.destroy()
  })
})
