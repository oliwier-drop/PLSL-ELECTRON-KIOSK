const { ipcRenderer } = require('electron')

const INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  'textarea',
  'select',
  '[contenteditable="true"]',
].join(', ')

let debounceTimer = null

function isTextInput(element) {
  if (!element || !(element instanceof Element)) {
    return false
  }

  if (element.matches(INPUT_SELECTOR)) {
    return true
  }

  return Boolean(element.closest('[contenteditable="true"]'))
}

document.addEventListener(
  'focusin',
  (event) => {
    if (!isTextInput(event.target)) {
      return
    }

    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      ipcRenderer.send('keyboard:focus')
    }, 300)
  },
  true
)

document.addEventListener(
  'click',
  (event) => {
    if (!isTextInput(event.target)) {
      return
    }

    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      ipcRenderer.send('keyboard:focus')
    }, 300)
  },
  true
)
