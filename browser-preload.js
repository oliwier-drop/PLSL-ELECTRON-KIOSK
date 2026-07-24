const { ipcRenderer } = require('electron')

const INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  'textarea',
].join(', ')

const RICH_SELECTOR = [
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
].join(', ')

/** Listy select / autocomplete (Jira, Atlaskit, react-select) — nie chować klawiatury przy wyborze. */
const DROPDOWN_UI_SELECTOR = [
  '[role="option"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="tree"]',
  '[role="treeitem"]',
  '[role="combobox"]',
  '[aria-autocomplete]',
  '[class*="select__menu"]',
  '[class*="Select-menu"]',
  '[class*="-menu-"]',
  '[id*="react-select"]',
  '[data-testid*="select-options"]',
  '[data-testid*="select-option"]',
  '[data-testid*="dropdown"]',
].join(', ')

let debounceTimer = null
let blurTimer = null
let debounceMs = 300
let hideOnBlurDelayMs = 200
let lastTextInput = null
let lastSelection = { start: 0, end: 0 }
let lastEditableRange = null

ipcRenderer.invoke('keyboard:timing').then((timing) => {
  if (!timing || typeof timing !== 'object') return
  if (typeof timing.debounceMs === 'number') debounceMs = timing.debounceMs
  if (typeof timing.hideOnBlurDelayMs === 'number') hideOnBlurDelayMs = timing.hideOnBlurDelayMs
}).catch(() => {})

function isNativeTextField(element) {
  if (!element || !(element instanceof Element)) return false
  return element.matches(INPUT_SELECTOR) || element.tagName === 'TEXTAREA'
}

function isRichTextField(element) {
  if (!element || !(element instanceof Element)) return false
  if (element.isContentEditable) return true
  const role = element.getAttribute?.('role')
  if (role === 'textbox') return true
  return element.matches(RICH_SELECTOR)
}

function isSelectDropdownUi(node) {
  let element = node
  if (element && element.nodeType === 3) {
    element = element.parentElement
  }
  if (!element || !(element instanceof Element)) return false
  return Boolean(element.closest(DROPDOWN_UI_SELECTOR))
}

/** Znajdź pole edycji — input/textarea albo host WYSIWYG (Jira/ProseMirror). */
function findEditable(node) {
  let element = node
  if (element && element.nodeType === 3) {
    element = element.parentElement
  }
  if (!element || !(element instanceof Element)) return null

  if (isNativeTextField(element)) return element

  const rich = element.closest(RICH_SELECTOR)
  if (rich) return rich

  if (element.isContentEditable) return element
  return null
}

function isTextInput(element) {
  return Boolean(findEditable(element))
}

function rememberSelection(element) {
  if (!element) return

  if (isNativeTextField(element) && typeof element.selectionStart === 'number') {
    try {
      lastSelection = {
        start: element.selectionStart,
        end: element.selectionEnd,
      }
    } catch {
      // password / unsupported selection
    }
    return
  }

  if (isRichTextField(element)) {
    rememberEditableRange(element)
  }
}

function rememberEditableRange(editableHost) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return

  const anchor = sel.anchorNode
  const anchorEl = anchor?.nodeType === 3 ? anchor.parentElement : anchor
  if (!anchorEl || !editableHost.contains(anchorEl)) return

  try {
    lastEditableRange = sel.getRangeAt(0).cloneRange()
  } catch {
    // ignore
  }
}

function restoreEditableRange(editableHost) {
  if (!editableHost) return false

  try {
    if (lastEditableRange) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(lastEditableRange)
      return true
    }
  } catch {
    // range invalidated by DOM update
  }

  try {
    editableHost.focus({ preventScroll: true })
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editableHost)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    lastEditableRange = range.cloneRange()
    return true
  } catch {
    return false
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
    return findEditable(lastTextInput) || lastTextInput
  }
  const active = findEditable(document.activeElement)
  if (active) return active
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

function insertIntoRichText(el, text) {
  restoreEditableRange(el)

  let inserted = false
  try {
    inserted = document.execCommand('insertText', false, text)
  } catch {
    inserted = false
  }

  if (!inserted) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const node = document.createTextNode(text)
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      inserted = true
    }
  }

  if (inserted) {
    dispatchInput(el, 'insertText', text)
    rememberEditableRange(el)
  }
}

function deleteFromRichText(el) {
  restoreEditableRange(el)

  let deleted = false
  try {
    deleted = document.execCommand('delete', false)
  } catch {
    deleted = false
  }

  if (!deleted) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      if (range.collapsed) {
        sel.modify('extend', 'backward', 'character')
      }
      if (!sel.isCollapsed) {
        range.deleteContents()
        deleted = true
      }
    }
  }

  if (deleted) {
    dispatchInput(el, 'deleteContentBackward', null)
    rememberEditableRange(el)
  }
}

function moveCaretInRichText(el, delta) {
  restoreEditableRange(el)
  const sel = window.getSelection()
  if (!sel) return
  sel.modify('move', delta < 0 ? 'backward' : 'forward', 'character')
  rememberEditableRange(el)
}

function insertText(text) {
  const el = getTargetInput()
  if (!el) return

  if (isRichTextField(el)) {
    insertIntoRichText(el, text)
    return
  }

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

  if (isRichTextField(el)) {
    deleteFromRichText(el)
    return
  }

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

  if (isRichTextField(el)) {
    moveCaretInRichText(el, delta)
    return
  }

  const value = el.value ?? ''
  const next = Math.max(0, Math.min(value.length, lastSelection.start + delta))
  applySelection(el, next, next)
}

function handleEnter() {
  const el = getTargetInput()
  if (!el) return

  if (isRichTextField(el)) {
    restoreEditableRange(el)
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
    if (cancelled) {
      rememberEditableRange(el)
      return
    }

    try {
      if (!document.execCommand('insertParagraph')) {
        document.execCommand('insertLineBreak')
      }
    } catch {
      insertIntoRichText(el, '\n')
    }
    rememberEditableRange(el)
    return
  }

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
    if (findEditable(document.activeElement)) return
    if (isSelectDropdownUi(document.activeElement)) return
    // Lista select często zostawia fokus na body, a popup nadal otwarty.
    if (document.querySelector('[role="listbox"], [role="menu"], [class*="select__menu"]')) {
      return
    }
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
  const activeEditable = findEditable(document.activeElement)
  if (activeEditable && typeof activeEditable.blur === 'function') {
    try {
      activeEditable.blur()
    } catch {
      // ignore
    }
  }

  lastTextInput = null
  lastSelection = { start: 0, end: 0 }
  lastEditableRange = null
  ipcRenderer.send('keyboard:blur')
}

document.addEventListener(
  'focusin',
  (event) => {
    const editable = findEditable(event.target)
    if (editable) {
      lastTextInput = editable
      rememberSelection(editable)
      scheduleShow()
      return
    }

    // Fokus w liście selecta — nie chowaj klawiatury (użytkownik wybiera opcję).
    if (isSelectDropdownUi(event.target)) {
      clearTimeout(blurTimer)
      clearTimeout(debounceTimer)
      return
    }

    scheduleHide()
  },
  true
)

document.addEventListener(
  'focusout',
  (event) => {
    const editable = findEditable(event.target)
    if (!editable) return

    rememberSelection(editable)

    const next = event.relatedTarget
    if (isSelectDropdownUi(next) || findEditable(next)) {
      clearTimeout(blurTimer)
      return
    }

    scheduleHide()
  },
  true
)

document.addEventListener(
  'selectionchange',
  () => {
    const editable = findEditable(document.activeElement) || lastTextInput
    if (editable && editable.isConnected) {
      rememberSelection(editable)
    }
  }
)

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!event.isTrusted) return

    const target = event.target
    const editable = findEditable(target)
    if (editable) {
      lastTextInput = editable
      rememberSelection(editable)
      scheduleShow()
      return
    }

    // Klik w pozycję listy (Jira select) — NIE bluruj pola, inaczej lista znika.
    if (isSelectDropdownUi(target)) {
      clearTimeout(blurTimer)
      clearTimeout(debounceTimer)
      return
    }

    // Klik poza polem tekstowym — schowaj nawet gdy SPA nie robi blur.
    if (lastTextInput || findEditable(document.activeElement)) {
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
  lastEditableRange = null
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
