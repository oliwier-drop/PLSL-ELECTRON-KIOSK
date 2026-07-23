const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  LAYOUT,
  DISPLAY,
  PL_MAP,
  INTERNAL_KEYS,
  getLayoutName,
  getActiveButtons,
  layoutHasPlButton,
  tokensInLayout,
  createKeyboardController,
} = require('../shell/keyboard-logic')

describe('keyboard-logic getLayoutName', () => {
  it('zwraca default / shift bez PL', () => {
    assert.equal(
      getLayoutName({ symbolsActive: false, plActive: false, shiftActive: false, capsActive: false }),
      'default'
    )
    assert.equal(
      getLayoutName({ symbolsActive: false, plActive: false, shiftActive: true, capsActive: false }),
      'shift'
    )
    assert.equal(
      getLayoutName({ symbolsActive: false, plActive: false, shiftActive: false, capsActive: true }),
      'shift'
    )
    assert.equal(
      getLayoutName({ symbolsActive: false, plActive: false, shiftActive: true, capsActive: true }),
      'default'
    )
  })

  it('zwraca defaultPl / shiftPl gdy PL włączony', () => {
    assert.equal(
      getLayoutName({ symbolsActive: false, plActive: true, shiftActive: false, capsActive: false }),
      'defaultPl'
    )
    assert.equal(
      getLayoutName({ symbolsActive: false, plActive: true, shiftActive: true, capsActive: false }),
      'shiftPl'
    )
  })

  it('symbole mają pierwszeństwo przed PL i shiftem', () => {
    assert.equal(
      getLayoutName({ symbolsActive: true, plActive: true, shiftActive: true, capsActive: false }),
      'symbols'
    )
  })
})

describe('keyboard-logic layouty PL', () => {
  it('każdy layout ma przycisk {pl} między symbols a spacją', () => {
    for (const name of Object.keys(LAYOUT)) {
      assert.equal(layoutHasPlButton(name), true, `${name} should include {pl}`)
      const bottom = LAYOUT[name][LAYOUT[name].length - 1]
      assert.match(bottom, /\{symbols\} \{pl\} \{space\}/)
    }
  })

  it('DISPLAY zawiera etykietę PL', () => {
    assert.equal(DISPLAY['{pl}'], 'PL')
  })

  it('defaultPl podmienia litery zgodnie z PL_MAP', () => {
    const base = tokensInLayout('default')
    const pl = tokensInLayout('defaultPl')
    assert.equal(base.length, pl.length)

    for (let i = 0; i < base.length; i += 1) {
      const from = base[i]
      const to = pl[i]
      if (from.startsWith('{')) {
        assert.equal(to, from)
        continue
      }
      const mapped = PL_MAP[from]
      if (mapped) {
        assert.equal(to, mapped, `${from} should map to ${mapped}`)
      } else {
        assert.equal(to, from, `${from} should stay unchanged`)
      }
    }
  })

  it('shiftPl podmienia wielkie litery zgodnie z PL_MAP', () => {
    const base = tokensInLayout('shift')
    const pl = tokensInLayout('shiftPl')
    assert.equal(base.length, pl.length)

    for (let i = 0; i < base.length; i += 1) {
      const from = base[i]
      const to = pl[i]
      if (from.startsWith('{')) {
        assert.equal(to, from)
        continue
      }
      const lower = from.toLowerCase()
      const mapped = PL_MAP[lower]
      if (mapped) {
        assert.equal(to, mapped.toUpperCase(), `${from} should map to ${mapped.toUpperCase()}`)
      } else {
        assert.equal(to, from)
      }
    }
  })
})

describe('keyboard-logic controller', () => {
  it('toggle PL zmienia layout i nie wysyła znaku', () => {
    const sent = []
    const layouts = []
    const controller = createKeyboardController({
      onSendKey: (key) => sent.push(key),
      onLayoutChange: (name) => layouts.push(name),
    })

    controller.handleKeyPress('{pl}')
    assert.equal(controller.getLayoutName(), 'defaultPl')
    assert.deepEqual(sent, [])
    assert.ok(layouts.includes('defaultPl'))

    controller.handleKeyPress('{pl}')
    assert.equal(controller.getLayoutName(), 'default')
  })

  it('w trybie PL wysyła polskie znaki z layoutu', () => {
    const sent = []
    const controller = createKeyboardController({
      onSendKey: (key) => sent.push(key),
    })

    controller.handleKeyPress('{pl}')
    controller.handleKeyPress('ą')
    controller.handleKeyPress('ł')
    assert.deepEqual(sent, ['ą', 'ł'])
  })

  it('shift jest jednorazowy po znaku', () => {
    const controller = createKeyboardController()
    controller.handleKeyPress('{w11shift}')
    assert.equal(controller.getLayoutName(), 'shift')

    controller.handleKeyPress('A')
    assert.equal(controller.getState().shiftActive, false)
    assert.equal(controller.getLayoutName(), 'default')
  })

  it('symbole wyłączają shift, ale zachowują PL', () => {
    const controller = createKeyboardController()
    controller.handleKeyPress('{pl}')
    controller.handleKeyPress('{w11shift}')
    controller.handleKeyPress('{symbols}')

    assert.equal(controller.getState().symbolsActive, true)
    assert.equal(controller.getState().shiftActive, false)
    assert.equal(controller.getState().plActive, true)
    assert.equal(controller.getLayoutName(), 'symbols')

    controller.handleKeyPress('{symbols}')
    assert.equal(controller.getLayoutName(), 'defaultPl')
  })

  it('modyfikatory nie idą do onSendKey', () => {
    const sent = []
    const controller = createKeyboardController({
      onSendKey: (key) => sent.push(key),
    })

    for (const key of INTERNAL_KEYS) {
      controller.handleKeyPress(key)
    }
    assert.deepEqual(sent, [])
  })

  it('getActiveButtons zawiera PL gdy aktywny', () => {
    assert.deepEqual(
      getActiveButtons({ shiftActive: false, capsActive: false, symbolsActive: false, plActive: true }),
      ['{pl}']
    )
  })
})
