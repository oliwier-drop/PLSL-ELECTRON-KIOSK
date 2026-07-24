const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const { IdleTimer } = require('../src/idle-timer')

function createTimer(overrides = {}) {
  const calls = {
    showWarning: [],
    updateWarning: [],
    hideWarning: 0,
    onExpire: 0,
  }

  const callbacks = {
    showWarning: (seconds) => calls.showWarning.push(seconds),
    updateWarning: (seconds) => calls.updateWarning.push(seconds),
    hideWarning: () => {
      calls.hideWarning += 1
    },
    onExpire: () => {
      calls.onExpire += 1
    },
    ...overrides.callbacks,
  }

  const timer = new IdleTimer(
    {
      idle: {
        warningAfterMs: overrides.warningAfterMs ?? 100,
        countdownMs: overrides.countdownMs ?? 2000,
      },
    },
    callbacks
  )

  return { timer, calls }
}

describe('IdleTimer', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  it('pokazuje ostrzeżenie po warningAfterMs', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 100, countdownMs: 3000 })

    mock.timers.tick(99)
    assert.equal(calls.showWarning.length, 0)

    mock.timers.tick(1)
    assert.deepEqual(calls.showWarning, [3])
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })

  it('aktualizuje odliczanie co sekundę', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 3000 })

    mock.timers.tick(50)
    assert.deepEqual(calls.showWarning, [3])

    mock.timers.tick(1000)
    mock.timers.tick(1000)
    assert.deepEqual(calls.updateWarning, [2, 1])
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })

  it('wywołuje onExpire dokładnie raz po countdownMs', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 2000 })

    mock.timers.tick(50)
    mock.timers.tick(2000)

    assert.equal(calls.onExpire, 1)

    // dodatkowy tick nie powinien ponowić expire
    mock.timers.tick(5000)
    assert.equal(calls.onExpire, 1)

    timer.destroy()
  })

  it('continueSession anuluje odliczanie i nie kończy sesji', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 2000 })

    mock.timers.tick(50)
    assert.equal(calls.showWarning.length, 1)

    timer.continueSession()
    assert.equal(calls.hideWarning, 2) // reset w konstruktorze + continue/reset

    mock.timers.tick(2000)
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })

  it('reset bez force nie przerywa odliczania — expire i tak następuje', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 2000 })

    mock.timers.tick(50)
    assert.equal(timer.shouldIgnoreActivity(), true)

    assert.equal(timer.reset(), false)
    assert.equal(timer.reset(), false)
    assert.equal(calls.onExpire, 0)

    mock.timers.tick(2000)
    assert.equal(calls.onExpire, 1)

    timer.destroy()
  })

  it('reset({ force: true }) przerywa odliczanie', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 2000 })

    mock.timers.tick(50)
    assert.equal(timer.reset({ force: true }), true)
    assert.equal(calls.onExpire, 0)

    mock.timers.tick(2000)
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })

  it('stopTimers nie chowa ostrzeżenia', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 2000 })

    mock.timers.tick(50)
    const hidesBefore = calls.hideWarning

    timer.stopTimers()
    assert.equal(calls.hideWarning, hidesBefore)
    assert.equal(calls.onExpire, 0)

    mock.timers.tick(5000)
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })

  it('interval aktualizuje do 0 ale expire tylko z setTimeout', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 3000 })

    mock.timers.tick(50)
    mock.timers.tick(2000)

    assert.equal(calls.onExpire, 0)
    assert.ok(calls.updateWarning.includes(1))

    mock.timers.tick(1000)
    assert.equal(calls.onExpire, 1)

    timer.destroy()
  })

  it('forceWarning blokuje soft reset, ale continueSession przedłuża sesję', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 5000, countdownMs: 2000 })

    timer.forceWarning()
    assert.deepEqual(calls.showWarning, [2])
    assert.equal(timer.reset(), false)
    assert.equal(timer.continueSession(), true)

    mock.timers.tick(2000)
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })

  it('cancelWarning chowa overlay i blokuje expire', () => {
    const { timer, calls } = createTimer({ warningAfterMs: 50, countdownMs: 2000 })

    mock.timers.tick(50)
    const hidesBefore = calls.hideWarning

    timer.cancelWarning()
    assert.equal(calls.hideWarning, hidesBefore + 1)

    mock.timers.tick(5000)
    assert.equal(calls.onExpire, 0)

    timer.destroy()
  })
})
