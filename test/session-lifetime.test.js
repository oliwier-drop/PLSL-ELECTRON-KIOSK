const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const { createSessionLifetime } = require('../src/session-lifetime')
const { createUserActivityGate } = require('../src/user-activity')
const { IdleTimer } = require('../src/idle-timer')

describe('createSessionLifetime', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  it('wywołuje onExpire po maxSessionMs', () => {
    let expired = false
    const lifetime = createSessionLifetime({
      maxSessionMs: 5000,
      onExpire: () => {
        expired = true
      },
    })

    lifetime.arm()
    mock.timers.tick(4999)
    assert.equal(expired, false)

    mock.timers.tick(1)
    assert.equal(expired, true)
  })

  it('arm resetuje poprzedni timer', () => {
    let expires = 0
    const lifetime = createSessionLifetime({
      maxSessionMs: 3000,
      onExpire: () => {
        expires += 1
      },
    })

    lifetime.arm()
    mock.timers.tick(2000)
    lifetime.arm()
    mock.timers.tick(2000)
    assert.equal(expires, 0)

    mock.timers.tick(1000)
    assert.equal(expires, 1)
  })

  it('hard cap kończy sesję mimo ciągłych resetów soft idle', () => {
    let hardEnded = false
    let softExpired = false

    const timer = new IdleTimer(
      { idle: { warningAfterMs: 60_000, countdownMs: 30_000 } },
      {
        showWarning: () => {},
        updateWarning: () => {},
        hideWarning: () => {},
        onExpire: () => {
          softExpired = true
        },
      }
    )

    const gate = createUserActivityGate({
      debounceMs: 0,
      onActivity: () => timer.reset(),
    })

    const lifetime = createSessionLifetime({
      maxSessionMs: 3000,
      onExpire: () => {
        hardEnded = true
      },
    })

    lifetime.arm()

    for (let i = 0; i < 5; i += 1) {
      gate.signal('user-pointerdown')
      mock.timers.tick(1000)
    }

    assert.equal(hardEnded, true)
    assert.equal(softExpired, false)

    timer.destroy()
    lifetime.destroy()
  })

  it('pokazuje ostrzeżenie przed hard capem i blokuje soft reset', () => {
    let warned = false
    let hardEnded = false
    let softShows = 0
    let hides = 0

    const timer = new IdleTimer(
      { idle: { warningAfterMs: 60_000, countdownMs: 2000 } },
      {
        showWarning: () => {
          softShows += 1
        },
        updateWarning: () => {},
        hideWarning: () => {
          hides += 1
        },
        onExpire: () => {},
      }
    )

    const lifetime = createSessionLifetime({
      maxSessionMs: 5000,
      warningMs: 2000,
      onWarning: () => {
        warned = true
        timer.forceWarning()
      },
      onExpire: () => {
        hardEnded = true
      },
    })

    lifetime.arm()

    // Ciągłe soft resety jak SPA
    mock.timers.tick(1000)
    timer.reset()
    mock.timers.tick(1000)
    timer.reset()
    mock.timers.tick(1000) // = 3000 → warning at 5000-2000=3000

    assert.equal(warned, true)
    assert.equal(timer.shouldIgnoreActivity(), true)
    assert.equal(timer.reset(), false)

    const hidesAfterForce = hides
    timer.reset()
    assert.equal(hides, hidesAfterForce, 'forced warning nie chowa się soft resetem')

    mock.timers.tick(2000)
    assert.equal(hardEnded, true)

    timer.destroy()
    lifetime.destroy()
  })

  it('forceWarning da się anulować przez continueSession', () => {
    const calls = { showWarning: 0, onExpire: 0 }
    const timer = new IdleTimer(
      { idle: { warningAfterMs: 1000, countdownMs: 2000 } },
      {
        showWarning: () => {
          calls.showWarning += 1
        },
        updateWarning: () => {},
        hideWarning: () => {},
        onExpire: () => {
          calls.onExpire += 1
        },
      }
    )

    timer.forceWarning()
    assert.equal(timer.continueSession(), true)
    mock.timers.tick(2000)
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })
})
