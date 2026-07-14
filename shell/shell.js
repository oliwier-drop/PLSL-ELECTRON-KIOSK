const confirmModal = document.getElementById('confirm-modal')
const idleModal = document.getElementById('idle-modal')
const idleCountdown = document.getElementById('idle-countdown')
const toast = document.getElementById('toast')

let toastTimeout = null

function showToast(message) {
  toast.textContent = message
  toast.classList.remove('hidden')

  if (toastTimeout) {
    clearTimeout(toastTimeout)
  }

  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden')
  }, 4000)
}

function notifyActivity() {
  window.kiosk?.activity?.ping()
}

function showConfirmModal() {
  confirmModal.classList.remove('hidden')
}

function hideConfirmModal() {
  confirmModal.classList.add('hidden')
}

function showIdleModal(seconds) {
  idleCountdown.textContent = String(seconds)
  idleModal.classList.remove('hidden')
}

function hideIdleModal() {
  idleModal.classList.add('hidden')
}

document.getElementById('toolbar').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]')
  if (!button || !window.kiosk) return

  notifyActivity()

  switch (button.dataset.action) {
    case 'back':
      await window.kiosk.nav.back()
      break
    case 'home':
      await window.kiosk.nav.home()
      break
    case 'refresh':
      await window.kiosk.nav.refresh()
      break
    case 'keyboard':
      await window.kiosk.keyboard.show()
      break
    case 'end-session':
      showConfirmModal()
      break
  }
})

confirmModal.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-confirm]')
  if (!button) return

  if (button.dataset.confirm === 'ok') {
    notifyActivity()
    await window.kiosk.session.end()
  }

  hideConfirmModal()
})

idleModal.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-idle]')
  if (!button || !window.kiosk) return

  if (button.dataset.idle === 'continue') {
    await window.kiosk.idle.continue()
    hideIdleModal()
    return
  }

  if (button.dataset.idle === 'end') {
    await window.kiosk.idle.endNow()
    hideIdleModal()
  }
})

;['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach((eventName) => {
  document.addEventListener(eventName, notifyActivity, { passive: true })
})

window.kiosk?.onNavBlocked?.((message) => showToast(message))
window.kiosk?.onIdleWarning?.((data) => showIdleModal(data.seconds))
window.kiosk?.onIdleHide?.(() => hideIdleModal())
