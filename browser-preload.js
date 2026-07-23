const { ipcRenderer } = require('electron')

const INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  'textarea',
].join(', ')

let debounceTimer = null
let blurTimer = null

function isTextInput(element) {
  if (!element || !(element instanceof Element)) {
    return false
  }
  return element.matches(INPUT_SELECTOR) || element.tagName === 'TEXTAREA'
}

function scheduleShow(target) {
  clearTimeout(blurTimer)
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    ipcRenderer.send('keyboard:focus')
  }, 300)
}

function scheduleHide() {
  clearTimeout(debounceTimer)
  blurTimer = setTimeout(() => {
    if (document.activeElement && isTextInput(document.activeElement)) return
    ipcRenderer.send('keyboard:blur')
  }, 200)
}

document.addEventListener(
  'focusin',
  (event) => {
    if (isTextInput(event.target)) {
      scheduleShow(event.target)
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
      scheduleHide()
    }
  },
  true
)

document.addEventListener(
  'click',
  (event) => {
    if (isTextInput(event.target)) {
      scheduleShow(event.target)
    }
  },
  true
)

// Listen for blur command from main process
ipcRenderer.on('blur-active-element', () => {
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur()
  }
})

