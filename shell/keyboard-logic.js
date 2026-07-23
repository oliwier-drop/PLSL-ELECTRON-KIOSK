(function (root) {
  const LAYOUT = {
    default: [
      '{esc} q w e r t y u i o p {bksp}',
      '{caps} a s d f g h j k l {enter}',
      '{w11shift} z x c v b n m , . {w11shift}',
      '{symbols} {pl} {space} {arrowleft} {arrowright}',
    ],
    shift: [
      '{esc} Q W E R T Y U I O P {bksp}',
      '{caps} A S D F G H J K L {enter}',
      '{w11shift} Z X C V B N M , . {w11shift}',
      '{symbols} {pl} {space} {arrowleft} {arrowright}',
    ],
    defaultPl: [
      '{esc} q w ę r t y u i ó p {bksp}',
      '{caps} ą ś d f g h j k ł {enter}',
      '{w11shift} ź ż ć v b ń m , . {w11shift}',
      '{symbols} {pl} {space} {arrowleft} {arrowright}',
    ],
    shiftPl: [
      '{esc} Q W Ę R T Y U I Ó P {bksp}',
      '{caps} Ą Ś D F G H J K Ł {enter}',
      '{w11shift} Ź Ż Ć V B Ń M , . {w11shift}',
      '{symbols} {pl} {space} {arrowleft} {arrowright}',
    ],
    symbols: [
      '1 2 3 4 5 6 7 8 9 0 {bksp}',
      '@ # $ & * ( ) - _ {enter}',
      '{w11shift} ! ? ; : \' " , . {w11shift}',
      '{symbols} {pl} {space} {arrowleft} {arrowright}',
    ],
  }

  const DISPLAY = {
    '{esc}': 'Esc',
    '{bksp}': '⌫',
    '{enter}': '↵',
    '{w11shift}': '⇧',
    '{caps}': '⇪ Caps',
    '{symbols}': '&123',
    '{pl}': 'PL',
    '{space}': 'Spacja',
    '{arrowleft}': '←',
    '{arrowright}': '→',
  }

  const INTERNAL_KEYS = new Set(['{w11shift}', '{caps}', '{symbols}', '{pl}'])

  const BUTTON_THEME = [
    { class: 'hg-key-esc', buttons: '{esc}' },
    { class: 'hg-key-bksp', buttons: '{bksp}' },
    { class: 'hg-key-caps', buttons: '{caps}' },
    { class: 'hg-key-enter', buttons: '{enter}' },
    { class: 'hg-key-shift', buttons: '{w11shift}' },
    { class: 'hg-key-pl', buttons: '{pl}' },
    { class: 'hg-key-space', buttons: '{space}' },
    { class: 'hg-key-mod', buttons: '{symbols} {arrowleft} {arrowright}' },
  ]

  /** Expected PL substitutions relative to the base letter layouts. */
  const PL_MAP = {
    a: 'ą',
    c: 'ć',
    e: 'ę',
    l: 'ł',
    n: 'ń',
    o: 'ó',
    s: 'ś',
    x: 'ż',
    z: 'ź',
  }

  function getLayoutName({ symbolsActive, plActive, shiftActive, capsActive }) {
    if (symbolsActive) return 'symbols'

    const shifted = Boolean(shiftActive) !== Boolean(capsActive)
    if (plActive) return shifted ? 'shiftPl' : 'defaultPl'
    return shifted ? 'shift' : 'default'
  }

  function getActiveButtons({ shiftActive, capsActive, symbolsActive, plActive }) {
    const activeButtons = []
    if (shiftActive) activeButtons.push('{w11shift}')
    if (capsActive) activeButtons.push('{caps}')
    if (symbolsActive) activeButtons.push('{symbols}')
    if (plActive) activeButtons.push('{pl}')
    return activeButtons
  }

  function layoutHasPlButton(layoutName) {
    const rows = LAYOUT[layoutName]
    if (!rows) return false
    return rows.some((row) => row.split(/\s+/).includes('{pl}'))
  }

  function tokensInLayout(layoutName) {
    const rows = LAYOUT[layoutName]
    if (!rows) return []
    return rows.flatMap((row) => row.split(/\s+/).filter(Boolean))
  }

  function createKeyboardController({ onSendKey, onLayoutChange } = {}) {
    let shiftActive = false
    let capsActive = false
    let symbolsActive = false
    let plActive = false

    function getState() {
      return { shiftActive, capsActive, symbolsActive, plActive }
    }

    function notifyLayout() {
      const state = getState()
      onLayoutChange?.(getLayoutName(state), state)
    }

    function handleKeyPress(button) {
      if (button === '{w11shift}') {
        shiftActive = !shiftActive
        notifyLayout()
        return { type: 'modifier', state: getState() }
      }

      if (button === '{caps}') {
        capsActive = !capsActive
        notifyLayout()
        return { type: 'modifier', state: getState() }
      }

      if (button === '{symbols}') {
        symbolsActive = !symbolsActive
        if (symbolsActive) {
          shiftActive = false
        }
        notifyLayout()
        return { type: 'modifier', state: getState() }
      }

      if (button === '{pl}') {
        plActive = !plActive
        notifyLayout()
        return { type: 'modifier', state: getState() }
      }

      if (INTERNAL_KEYS.has(button)) {
        return { type: 'ignored', state: getState() }
      }

      onSendKey?.(button)

      if (shiftActive) {
        shiftActive = false
        notifyLayout()
      }

      return { type: 'input', key: button, state: getState() }
    }

    return {
      handleKeyPress,
      getState,
      getLayoutName: () => getLayoutName(getState()),
    }
  }

  const api = {
    LAYOUT,
    DISPLAY,
    INTERNAL_KEYS,
    BUTTON_THEME,
    PL_MAP,
    getLayoutName,
    getActiveButtons,
    layoutHasPlButton,
    tokensInLayout,
    createKeyboardController,
  }

  root.KioskKeyboardLogic = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
