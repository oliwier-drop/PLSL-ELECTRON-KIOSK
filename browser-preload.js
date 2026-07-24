const { ipcRenderer } = require('electron')

const INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  'textarea',
].join(', ')

let debounceTimer = null
let blurTimer = null
let debounceMs = 300
let hideOnBlurDelayMs = 200
let lastTextInput = null
let lastSelection = { start: 0, end: 0 }

ipcRenderer.invoke('keyboard:timing').then((timing) => {
  if (!timing || typeof timing !== 'object') return
  if (typeof timing.debounceMs === 'number') debounceMs = timing.debounceMs
  if (typeof timing.hideOnBlurDelayMs === 'number') hideOnBlurDelayMs = timing.hideOnBlurDelayMs
}).catch(() => {})

function isTextInput(element) {
  if (!element || !(element instanceof Element)) {
    return false
  }
  return element.matches(INPUT_SELECTOR) || element.tagName === 'TEXTAREA'
}

function rememberSelection(element) {
  if (!element || typeof element.selectionStart !== 'number') return
  try {
    lastSelection = {
      start: element.selectionStart,
      end: element.selectionEnd,
    }
  } catch {
    // password / unsupported selection
  }
}

function setNativeValue(element, value) {
  const proto = element.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value)
  } else {
    element.value = value
  }
}

function getTargetInput() {
  if (lastTextInput && lastTextInput.isConnected && isTextInput(lastTextInput)) {
    return lastTextInput
  }
  if (isTextInput(document.activeElement)) {
    return document.activeElement
  }
  return null
}

function dispatchInput(element, inputType, data) {
  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType,
      data: data ?? null,
    })
  )
}

function applySelection(element, start, end) {
  lastSelection = { start, end }
  try {
    // Nie wywołuj focus() — Enova przy focus robi select-all i miga zaznaczenie.
    element.setSelectionRange(start, end)
  } catch {
    // ignore
  }
}

function insertText(text) {
  const el = getTargetInput()
  if (!el) return

  const start = lastSelection.start
  const end = lastSelection.end
  const value = el.value ?? ''
  const next = value.slice(0, start) + text + value.slice(end)

  setNativeValue(el, next)
  applySelection(el, start + text.length, start + text.length)
  dispatchInput(el, 'insertText', text)
}

function deleteBackward() {
  const el = getTargetInput()
  if (!el) return

  let start = lastSelection.start
  let end = lastSelection.end
  const value = el.value ?? ''

  if (start === end) {
    if (start === 0) return
    start -= 1
  }

  setNativeValue(el, value.slice(0, start) + value.slice(end))
  applySelection(el, start, start)
  dispatchInput(el, 'deleteContentBackward', null)
}

function moveCaret(delta) {
  const el = getTargetInput()
  if (!el) return

  const value = el.value ?? ''
  const next = Math.max(0, Math.min(value.length, lastSelection.start + delta))
  applySelection(el, next, next)
}

function handleEnter() {
  const el = getTargetInput()
  if (!el) return

  const enterOpts = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  }
  const keydown = new KeyboardEvent('keydown', enterOpts)
  const cancelled = !el.dispatchEvent(keydown) || keydown.defaultPrevented
  el.dispatchEvent(new KeyboardEvent('keypress', enterOpts))
  el.dispatchEvent(new KeyboardEvent('keyup', enterOpts))
  if (cancelled) return

  if (el.tagName === 'TEXTAREA') {
    insertText('\n')
    return
  }

  const form = el.closest('form')
  if (!form) return

  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit()
    return
  }

  const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
  form.dispatchEvent(submitEvent)
  if (!submitEvent.defaultPrevented) {
    form.submit()
  }
}

function injectKey(key) {
  // Anuluj ukrywanie — fokus „poszedł” w widok klawiatury, nie w inne pole strony.
  clearTimeout(blurTimer)

  if (key === '{bksp}') {
    deleteBackward()
    return
  }
  if (key === '{space}') {
    insertText(' ')
    return
  }
  if (key === '{enter}') {
    handleEnter()
    return
  }
  if (key === '{arrowleft}') {
    moveCaret(-1)
    return
  }
  if (key === '{arrowright}') {
    moveCaret(1)
    return
  }
  if (key === '{tab}') {
    return
  }
  if (key && key.length === 1) {
    insertText(key)
  }
}

function scheduleShow() {
  clearTimeout(blurTimer)
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    ipcRenderer.send('keyboard:focus')
  }, debounceMs)
}

function scheduleHide() {
  clearTimeout(debounceTimer)
  blurTimer = setTimeout(() => {
    if (document.activeElement && isTextInput(document.activeElement)) return
    ipcRenderer.send('keyboard:blur')
  }, hideOnBlurDelayMs)
}

/** Ukryj klawiaturę po kliknięciu poza polem — nawet gdy SPA zostawia fokus w inpucie. */
function hideKeyboardOutsideField() {
  clearTimeout(debounceTimer)
  clearTimeout(blurTimer)

  if (lastTextInput && typeof lastTextInput.blur === 'function') {
    try {
      lastTextInput.blur()
    } catch {
      // ignore
    }
  }
  if (document.activeElement && isTextInput(document.activeElement)) {
    try {
      document.activeElement.blur()
    } catch {
      // ignore
    }
  }

  lastTextInput = null
  lastSelection = { start: 0, end: 0 }
  ipcRenderer.send('keyboard:blur')
}

document.addEventListener(
  'focusin',
  (event) => {
    if (isTextInput(event.target)) {
      lastTextInput = event.target
      rememberSelection(event.target)
      scheduleShow()
    } else {
      scheduleHide()
    }
  },
  true
)

document.addEventListener(
  'focusout',
  (event) => {
    if (isTextInput(event.target)) {
      rememberSelection(event.target)
      scheduleHide()
    }
  },
  true
)

document.addEventListener(
  'selectionchange',
  () => {
    if (isTextInput(document.activeElement)) {
      rememberSelection(document.activeElement)
    }
  }
)

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!event.isTrusted) return

    const target = event.target
    if (isTextInput(target)) {
      lastTextInput = target
      rememberSelection(target)
      scheduleShow()
      return
    }

    // Klik poza polem tekstowym — schowaj nawet gdy SPA nie robi blur.
    if (lastTextInput || isTextInput(document.activeElement)) {
      hideKeyboardOutsideField()
    }
  },
  true
)

ipcRenderer.on('keyboard:inject', (_event, payload) => {
  if (!payload || typeof payload.key !== 'string') return
  injectKey(payload.key)
})

ipcRenderer.on('blur-active-element', () => {
  lastTextInput = null
  lastSelection = { start: 0, end: 0 }
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur()
  }
})

const USER_ACTIVITY_KINDS = ['pointerdown', 'touchstart', 'keydown']

for (const kind of USER_ACTIVITY_KINDS) {
  document.addEventListener(
    kind,
    (event) => {
      // Ignoruj zdarzenia syntetyczne SPA (Enova itd.) — tylko realny input użytkownika.
      if (!event.isTrusted) return
      ipcRenderer.send('activity:user', { source: `user-${kind}` })
    },
    { capture: true, passive: true }
  )
}
