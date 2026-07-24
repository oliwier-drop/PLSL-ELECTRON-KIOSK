const toast = document.getElementById('toast')

let toastTimeout = null
let homeUrl = ''

function showToast(message, durationMs = 8000, type = 'error') {
  toast.textContent = message
  toast.classList.remove('hidden', 'toast--success')
  if (type === 'success') {
    toast.classList.add('toast--success')
  }

  if (toastTimeout) {
    clearTimeout(toastTimeout)
  }

  if (durationMs > 0) {
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden')
    }, durationMs)
  }
}

function notifyActivity() {
  window.kiosk?.activity?.ping()
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
    case 'end-session':
      window.kiosk.session.requestEnd()
      break
  }
})

;['mousedown', 'keydown', 'touchstart'].forEach((eventName) => {
  document.addEventListener(eventName, notifyActivity, { passive: true })
})

window.kiosk?.onSessionEnded?.((data) => {
  showToast(`Sesja zakończona. Adres: ${data?.url || homeUrl}`, 6000, 'success')
})
window.kiosk?.onSessionError?.((message) => showToast(message, 15000))

async function loadConfig() {
  const logo = document.getElementById('company-logo')
  if (!window.kiosk?.config) return

  const configData = await window.kiosk.config.get()
  if (logo && configData.logoPath) {
    logo.src = configData.logoPath
  }
  if (configData.homeUrl) {
    homeUrl = configData.homeUrl
  }
}

loadConfig()
