;(function () {
  const logic = globalThis.KioskKeyboardLogic
  if (!logic) {
    console.error('keyboard-logic nie załadował się poprawnie')
    return
  }

  const {
    LAYOUT,
    DISPLAY,
    BUTTON_THEME,
    getActiveButtons,
    createKeyboardController,
  } = logic

  let keyboard = null
  let controller = null

  function getKeyboardConstructor() {
    const exported = window.SimpleKeyboard
    if (!exported) return null
    if (typeof exported === 'function') return exported
    if (typeof exported.default === 'function') return exported.default
    if (typeof exported.SimpleKeyboard === 'function') return exported.SimpleKeyboard
    return null
  }

  function updateLayout() {
    if (!keyboard || !controller) return

    const activeButtons = getActiveButtons(controller.getState())
    const themes = [...BUTTON_THEME]
    if (activeButtons.length) {
      themes.push({ class: 'w11-active', buttons: activeButtons.join(' ') })
    }

    keyboard.setOptions({
      layoutName: controller.getLayoutName(),
      buttonTheme: themes,
    })
  }

  function sendKey(key) {
    window.kioskKeyboard?.sendKey(key)
  }

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

  const KeyboardCtor = getKeyboardConstructor()
  const keyboardContainer = document.querySelector('.simple-keyboard')

  if (!KeyboardCtor || !keyboardContainer) {
    console.error('simple-keyboard nie załadował się poprawnie')
    return
  }

  controller = createKeyboardController({
    onSendKey: sendKey,
    onLayoutChange: () => updateLayout(),
  })

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
    onKeyPress: (button) => controller.handleKeyPress(button),
  })

  document.getElementById('keyboard-close')?.addEventListener('click', () => {
    window.kioskKeyboard?.hide()
  })
})()
