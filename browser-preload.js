const { ipcRenderer } = require('electron')

const INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  'textarea',
  'select',
  '[contenteditable="true"]',
].join(', ')

const IGNORED_KEYS = new Set(['{w11shift}', '{caps}', '{symbols}'])

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

let lastActiveEl = null

function isTextInput(element) {
  if (!element || !(element instanceof Element)) {
    return false
  }

  if (element.matches(INPUT_SELECTOR)) {
    return true
  }

  return Boolean(element.closest('[contenteditable="true"]'))
}

function isContentEditable(element) {
  return Boolean(
    element &&
      (element.isContentEditable || element.getAttribute('contenteditable') === 'true')
  )
}

function rememberTarget(element) {
  if (isTextInput(element)) {
    lastActiveEl = element
  }
}

function getTarget() {
  if (lastActiveEl && lastActiveEl.isConnected && isTextInput(lastActiveEl)) {
    return lastActiveEl
  }

  const active = document.activeElement
  return isTextInput(active) ? active : null
}

function getFieldValue(element) {
  if (!element) return ''

  if (isContentEditable(element)) {
    return element.textContent ?? ''
  }

  if ('value' in element) {
    return element.value ?? ''
  }

  return ''
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function dispatchKeyEvent(el, key, code) {
  el.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code,
      bubbles: true,
      cancelable: true,
    })
  )
}

function moveCursor(el, delta) {
  if (!('value' in el)) return

  const start = el.selectionStart ?? el.value.length
  const next = Math.max(0, Math.min(el.value.length, start + delta))
  el.selectionStart = el.selectionEnd = next
}

function focusNextField(el) {
  const nodes = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (node) => node === el || node.offsetParent !== null || node.getClientRects().length > 0
  )

  const index = nodes.indexOf(el)
  if (index === -1) {
    return
  }

  const next = nodes[(index + 1) % nodes.length]
  if (next) {
    next.focus()
    if ('select' in next && typeof next.select === 'function') {
      try {
        next.select()
      } catch {
        /* ignore */
      }
    }
  }
}

function injectIntoContentEditable(el, key) {
  el.focus()

  if (key === '{bksp}') {
    document.execCommand('delete', false, null)
    return
  }

  if (key === '{enter}') {
    document.execCommand('insertLineBreak', false, null)
    return
  }

  if (key === '{space}') {
    document.execCommand('insertText', false, ' ')
    return
  }

  if (key === '{esc}') {
    dispatchKeyEvent(el, 'Escape', 'Escape')
    return
  }

  if (key === '{arrowleft}') {
    dispatchKeyEvent(el, 'ArrowLeft', 'ArrowLeft')
    return
  }

  if (key === '{arrowright}') {
    dispatchKeyEvent(el, 'ArrowRight', 'ArrowRight')
    return
  }

  if (!key.startsWith('{')) {
    document.execCommand('insertText', false, key)
  }
}

function injectIntoInput(el, key) {
  if (!('value' in el)) return

  el.focus()

  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const val = el.value

  if (key === '{bksp}') {
    if (start === end && start > 0) {
      el.value = val.slice(0, start - 1) + val.slice(end)
      el.selectionStart = el.selectionEnd = start - 1
    } else if (start !== end) {
      el.value = val.slice(0, start) + val.slice(end)
      el.selectionStart = el.selectionEnd = start
    }
    dispatchInputEvents(el)
    return
  }

  if (key === '{enter}') {
    if (el.tagName === 'TEXTAREA') {
      el.value = val.slice(0, start) + '\n' + val.slice(end)
      el.selectionStart = el.selectionEnd = start + 1
      dispatchInputEvents(el)
      return
    }

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(enterEvent)

    if (!enterEvent.defaultPrevented && el.form) {
      if (typeof el.form.requestSubmit === 'function') {
        el.form.requestSubmit()
      } else {
        el.form.submit()
      }
    }
    return
  }

  if (key === '{space}') {
    el.value = val.slice(0, start) + ' ' + val.slice(end)
    el.selectionStart = el.selectionEnd = start + 1
    dispatchInputEvents(el)
    return
  }

  if (key === '{esc}') {
    dispatchKeyEvent(el, 'Escape', 'Escape')
    return
  }

  if (key === '{arrowleft}') {
    moveCursor(el, -1)
    return
  }

  if (key === '{arrowright}') {
    moveCursor(el, 1)
    return
  }

  if (key.startsWith('{')) {
    return
  }

  el.value = val.slice(0, start) + key + val.slice(end)
  el.selectionStart = el.selectionEnd = start + key.length
  dispatchInputEvents(el)
}

function injectKey(key) {
  if (IGNORED_KEYS.has(key)) return

  const el = getTarget()
  if (!el) return

  if (key === '{tab}') {
    focusNextField(el)
    return
  }

  if (isContentEditable(el)) {
    injectIntoContentEditable(el, key)
    return
  }

  injectIntoInput(el, key)
}

function requestShowKeyboard() {
  ipcRenderer.send('keyboard:focus')
}

function requestHideKeyboard() {
  ipcRenderer.send('keyboard:hide')
}

document.addEventListener(
  'focusin',
  (event) => {
    if (!isTextInput(event.target)) {
      return
    }

    rememberTarget(event.target)
    requestShowKeyboard()
  },
  true
)

document.addEventListener(
  'click',
  (event) => {
    if (!isTextInput(event.target)) {
      return
    }

    rememberTarget(event.target)
    requestShowKeyboard()
  },
  true
)

document.addEventListener(
  'mousedown',
  (event) => {
    if (isTextInput(event.target)) {
      return
    }

    requestHideKeyboard()
  },
  true
)

ipcRenderer.on('keyboard:inject', (_event, { key }) => {
  injectKey(key)
})
