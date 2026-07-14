const confirmModal = document.getElementById('confirm-modal')
const idleModal = document.getElementById('idle-modal')
const idleCountdown = document.getElementById('idle-countdown')
const confirmTitle = document.getElementById('confirm-title')
const confirmMessage = document.getElementById('confirm-message')
const confirmOkBtn = document.getElementById('confirm-ok')
const confirmCancelBtn = document.getElementById('confirm-cancel')
const idleContinueBtn = document.getElementById('idle-continue')
const idleEndBtn = document.getElementById('idle-end')

let isBusy = false

function showConfirm() {
  idleModal.classList.add('hidden')
  confirmModal.classList.remove('hidden')
  setConfirmBusy(false)
}

function showIdle(seconds) {
  confirmModal.classList.add('hidden')
  idleModal.classList.remove('hidden')
  idleCountdown.textContent = String(seconds ?? 30)
}

function setConfirmBusy(busy) {
  isBusy = busy
  confirmModal.classList.toggle('is-loading', busy)
  if (busy) {
    confirmTitle.textContent = 'Kończenie sesji...'
    confirmMessage.textContent =
      'Proszę czekać. Trwa czyszczenie danych i powrót na stronę główną.'
  } else {
    confirmTitle.textContent = 'Zakończyć sesję?'
    confirmMessage.textContent =
      'Wszystkie dane sesji zostaną usunięte. Użytkownik zostanie wylogowany z Enovy, Jiry i innych portali.'
  }
}

confirmCancelBtn.addEventListener('click', () => {
  if (isBusy) return
  window.overlay.confirm.cancel()
})

confirmOkBtn.addEventListener('click', async () => {
  if (isBusy) return
  setConfirmBusy(true)
  await window.overlay.confirm.accept()
})

idleContinueBtn.addEventListener('click', async () => {
  await window.overlay.idle.continue()
})

idleEndBtn.addEventListener('click', async () => {
  if (isBusy) return
  isBusy = true
  await window.overlay.idle.endNow()
})

window.overlay.onMode((data) => {
  if (data.mode === 'confirm') {
    showConfirm()
  } else if (data.mode === 'idle') {
    showIdle(data.seconds)
  }
})
