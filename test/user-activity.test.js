const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const { createUserActivityGate } = require('../src/user-activity')
const { IdleTimer } = require('../src/idle-timer')

describe('createUserActivityGate', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  it('woła onActivity z debounce cooldown', () => {
    const sources = []
    const gate = createUserActivityGate({
      debounceMs: 1000,
      onActivity: (source) => sources.push(source),
    })

    assert.equal(gate.signal('keyboard'), true)
    assert.equal(gate.signal('keyboard'), false)
    assert.deepEqual(sources, ['keyboard'])

    mock.timers.tick(1000)
    assert.equal(gate.signal('pointer'), true)
    assert.deepEqual(sources, ['keyboard', 'pointer'])
  })

  it('ignoruje aktywność gdy shouldAllowReset zwraca false', () => {
    let calls = 0
    const gate = createUserActivityGate({
      debounceMs: 0,
      shouldAllowReset: () => false,
      onActivity: () => {
        calls += 1
      },
    })

    assert.equal(gate.signal('keyboard'), false)
    assert.equal(calls, 0)
  })
})

describe('UserActivityGate + IdleTimer', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  it('user activity resetuje soft idle', () => {
    const calls = { showWarning: 0 }
    const timer = new IdleTimer(
      { idle: { warningAfterMs: 100, countdownMs: 2000 } },
      {
        showWarning: () => {
          calls.showWarning += 1
        },
        updateWarning: () => {},
        hideWarning: () => {},
        onExpire: () => {},
      }
    )

    const gate = createUserActivityGate({
      debounceMs: 0,
      onActivity: () => timer.reset(),
      shouldAllowReset: () => !timer.shouldIgnoreActivity(),
    })

    mock.timers.tick(80)
    gate.signal('user-pointerdown')
    mock.timers.tick(80)
    assert.equal(calls.showWarning, 0)

    mock.timers.tick(30)
    assert.equal(calls.showWarning, 1)

    timer.destroy()
  })

  it('symulacja navigate-in-page nie resetuje soft idle', () => {
    const calls = { showWarning: 0 }
    const timer = new IdleTimer(
      { idle: { warningAfterMs: 100, countdownMs: 2000 } },
      {
        showWarning: () => {
          calls.showWarning += 1
        },
        updateWarning: () => {},
        hideWarning: () => {},
        onExpire: () => {},
      }
    )
    timer.reset({ force: true })

    const gate = createUserActivityGate({
      debounceMs: 0,
      onActivity: () => timer.reset(),
      shouldAllowReset: () => !timer.shouldIgnoreActivity(),
    })

    mock.timers.tick(80)
    // SPA navigate-in-page nie przechodzi przez gate — brak sygnału
    for (let i = 0; i < 10; i += 1) {
      mock.timers.tick(5)
    }

    mock.timers.tick(25)
    assert.equal(calls.showWarning, 1)
    assert.equal(gate.signal('user-pointerdown'), false)

    timer.destroy()
  })
})
