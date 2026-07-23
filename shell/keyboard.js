const LAYOUT = {
  default: [
    '{esc} q w e r t y u i o p {bksp}',
    '{caps} a s d f g h j k l {enter}',
    '{w11shift} z x c v b n m , . {w11shift}',
    '{symbols} {space} {arrowleft} {arrowright}',
  ],
  shift: [
    '{esc} Q W E R T Y U I O P {bksp}',
    '{caps} A S D F G H J K L {enter}',
    '{w11shift} Z X C V B N M , . {w11shift}',
    '{symbols} {space} {arrowleft} {arrowright}',
  ],
  symbols: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    '@ # $ & * ( ) - _ {enter}',
    '{w11shift} ! ? ; : \' " , . {w11shift}',
    '{symbols} {space} {arrowleft} {arrowright}',
  ],
}

const DISPLAY = {
  '{esc}': 'Esc',
  '{bksp}': '⌫',
  '{enter}': '↵',
  '{w11shift}': '⇧',
  '{caps}': '⇪ Caps',
  '{symbols}': '&123',
  '{space}': 'Spacja',
  '{arrowleft}': '←',
  '{arrowright}': '→',
}

const INTERNAL_KEYS = new Set(['{w11shift}', '{caps}', '{symbols}'])

const POLISH_ALTS = {
  a: ['ą'],
  c: ['ć'],
  e: ['ę'],
  l: ['ł'],
  n: ['ń'],
  o: ['ó'],
  s: ['ś'],
  z: ['ż', 'ź'],
}

const NUMBER_ALTS = {
  q: '1',
  w: '2',
  e: '3',
  r: '4',
  t: '5',
  y: '6',
  u: '7',
  i: '8',
  o: '9',
  p: '0',
}

const HOLD_MS = 450

const BUTTON_THEME = [
  { class: 'hg-key-esc', buttons: '{esc}' },
  { class: 'hg-key-bksp', buttons: '{bksp}' },
  { class: 'hg-key-caps', buttons: '{caps}' },
  { class: 'hg-key-enter', buttons: '{enter}' },
  { class: 'hg-key-shift', buttons: '{w11shift}' },
  { class: 'hg-key-space', buttons: '{space}' },
  { class: 'hg-key-mod', buttons: '{symbols} {arrowleft} {arrowright}' },
]

let holdTimer = null
let ignoreNextPress = false
let popupEl = null
let keyboard = null
let shiftActive = false
let capsActive = false
let symbolsActive = false
let holdButton = null
let popupOpen = false

function getKeyboardConstructor() {
  const exported = window.SimpleKeyboard
  if (!exported) return null
  if (typeof exported === 'function') return exported
  if (typeof exported.default === 'function') return exported.default
  if (typeof exported.SimpleKeyboard === 'function') return exported.SimpleKeyboard
  return null
}

function getLayoutName() {
  if (symbolsActive) return 'symbols'
  if (shiftActive !== capsActive) return 'shift'
  return 'default'
}

function updateLayout() {
  if (!keyboard) return

  const activeButtons = []
  if (shiftActive) activeButtons.push('{w11shift}')
  if (capsActive) activeButtons.push('{caps}')
  if (symbolsActive) activeButtons.push('{symbols}')

  const themes = [...BUTTON_THEME]
  if (activeButtons.length) {
    themes.push({ class: 'w11-active', buttons: activeButtons.join(' ') })
  }

  keyboard.setOptions({
    layoutName: getLayoutName(),
    buttonTheme: themes,
  })
}

function getAlternates(key) {
  if (!key || key.length !== 1 || key.startsWith('{')) return null

  const lower = key.toLowerCase()
  const options = new Set([key])
  const isUpper = key !== lower

  const polish = POLISH_ALTS[lower]
  if (polish) {
    for (const variant of polish) {
      options.add(isUpper ? variant.toUpperCase() : variant)
    }
  }

  const digit = NUMBER_ALTS[lower]
  if (digit) {
    options.add(digit)
  }

  if (options.size <= 1) return null
  return [...options]
}

function sendKey(key) {
  window.kioskKeyboard?.sendKey(key)
}

function hidePopup() {
  if (!popupEl) return
  popupEl.classList.add('hidden')
  popupEl.innerHTML = ''
  popupEl.setAttribute('aria-hidden', 'true')
  popupOpen = false

  if (holdButton) {
    holdButton.classList.remove('w11-hold')
    holdButton = null
  }
}

function highlightOptionAt(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)
  const option = target && target.closest ? target.closest('.key-alt-option') : null

  popupEl.querySelectorAll('.key-alt-option').forEach((node) => {
    node.classList.toggle('hot', node === option)
  })

  return option
}

function showPopup(anchorButton, options) {
  if (!popupEl || !anchorButton) return

  popupEl.innerHTML = options
    .map(
      (char) =>
        `<button type="button" class="key-alt-option" data-alt-char="${char}">${char}</button>`
    )
    .join('')

  const panel = document.querySelector('.keyboard-panel')
  const panelRect = panel?.getBoundingClientRect()
  const anchorRect = anchorButton.getBoundingClientRect()
  if (!panelRect) return

  popupEl.classList.remove('hidden')
  popupEl.setAttribute('aria-hidden', 'false')

  const popupWidth = popupEl.offsetWidth
  const left = anchorRect.left - panelRect.left + anchorRect.width / 2 - popupWidth / 2
  const clampedLeft = Math.max(4, Math.min(left, panelRect.width - popupWidth - 4))
  const top = anchorRect.top - panelRect.top - popupEl.offsetHeight - 8

  popupEl.style.left = `${clampedLeft}px`
  popupEl.style.top = `${Math.max(4, top)}px`
}

function clearHoldTimer() {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
}

function resetShiftAfterInput() {
  if (!shiftActive) return
  shiftActive = false
  updateLayout()
}

function handleKeyPress(button) {
  // Modyfikatory reagują natychmiast (na naciśnięcie) dla szybkiego feedbacku.
  if (button === '{w11shift}') {
    shiftActive = !shiftActive
    updateLayout()
    return
  }

  if (button === '{caps}') {
    capsActive = !capsActive
    updateLayout()
    return
  }

  if (button === '{symbols}') {
    symbolsActive = !symbolsActive
    if (symbolsActive) {
      shiftActive = false
    }
    updateLayout()
    return
  }
}

function handleKeyReleased(button) {
  // Znaki wysyłamy przy puszczeniu, aby long-press mógł przechwycić naciśnięcie.
  if (INTERNAL_KEYS.has(button)) {
    return
  }

  if (ignoreNextPress) {
    ignoreNextPress = false
    return
  }

  if (popupOpen) {
    return
  }

  sendKey(button)
  resetShiftAfterInput()
}

function bindHoldHandlers(container) {
  container.addEventListener(
    'pointerdown',
    (event) => {
      hidePopup()
      ignoreNextPress = false

      const button = event.target.closest('.hg-button')
      if (!button) return

      const key = button.getAttribute('data-skbtn')
      if (!key || INTERNAL_KEYS.has(key) || key.startsWith('{')) return

      const alternates = getAlternates(key)
      if (!alternates) return

      clearHoldTimer()
      holdButton = button
      holdTimer = setTimeout(() => {
        holdTimer = null
        ignoreNextPress = true
        popupOpen = true
        button.classList.add('w11-hold')
        showPopup(button, alternates)
      }, HOLD_MS)
    },
    true
  )

  container.addEventListener(
    'pointermove',
    (event) => {
      if (!popupOpen) return
      highlightOptionAt(event.clientX, event.clientY)
    },
    true
  )

  container.addEventListener(
    'pointerup',
    (event) => {
      clearHoldTimer()

      if (!popupOpen) return

      const hot = highlightOptionAt(event.clientX, event.clientY)
      if (hot) {
        sendKey(hot.getAttribute('data-alt-char'))
        resetShiftAfterInput()
      }

      hidePopup()
      // Zablokuj nadchodzące onKeyReleased dla trzymanego klawisza,
      // aby nie dosłać znaku bazowego po long-press.
      ignoreNextPress = true
    },
    true
  )

  container.addEventListener(
    'pointercancel',
    () => {
      clearHoldTimer()
      hidePopup()
    },
    true
  )

  popupEl?.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
}

const KeyboardCtor = getKeyboardConstructor()
const keyboardContainer = document.querySelector('.simple-keyboard')
popupEl = document.getElementById('key-alts-popup')

async function applyKeyboardConfig() {
  try {
    const cfg = await window.kioskKeyboard?.getConfig?.()
    if (cfg && typeof cfg.widthPercent === 'number') {
      document.documentElement.style.setProperty('--keyboard-width', `${cfg.widthPercent}%`)
    }
  } catch {
    // Keep CSS defaults when config IPC is unavailable.
  }
}

applyKeyboardConfig()

if (!KeyboardCtor || !keyboardContainer) {
  console.error('simple-keyboard nie załadował się poprawnie')
} else {
  keyboard = new KeyboardCtor(keyboardContainer, {
    layout: LAYOUT,
    layoutName: 'default',
    display: DISPLAY,
    theme: 'hg-theme-default hg-layout-default hg-theme-w11',
    buttonTheme: BUTTON_THEME,
    physicalKeyboardHighlight: false,
    syncInstanceInputs: false,
    preventMouseDownDefault: true,
    disableButtonHold: true,
    onKeyPress: handleKeyPress,
    onKeyReleased: handleKeyReleased,
  })

  bindHoldHandlers(keyboardContainer)

  document.addEventListener('pointerdown', (event) => {
    if (popupEl?.classList.contains('hidden')) return
    if (event.target.closest('#key-alts-popup') || event.target.closest('.hg-button')) return
    hidePopup()
    ignoreNextPress = false
  })

  document.getElementById('keyboard-close')?.addEventListener('click', () => {
    hidePopup()
    window.kioskKeyboard?.hide()
  })
}
