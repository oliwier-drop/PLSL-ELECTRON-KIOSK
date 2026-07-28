const confirmModal = document.getElementById('confirm-modal')
const idleModal = document.getElementById('idle-modal')
const idleTitle = document.querySelector('#idle-modal h2')
const idleMessage = document.querySelector('#idle-modal p')
const confirmTitle = document.getElementById('confirm-title')
const confirmMessage = document.getElementById('confirm-message')
const confirmOkBtn = document.getElementById('confirm-ok')
const confirmCancelBtn = document.getElementById('confirm-cancel')
const idleContinueBtn = document.getElementById('idle-continue')
const idleEndBtn = document.getElementById('idle-end')

let isBusy = false

function setIdleBusy(busy) {
  isBusy = busy
  idleModal.classList.toggle('is-loading', busy)
  if (busy) {
    idleTitle.textContent = 'Kończenie sesji...'
    idleMessage.textContent =
      'Proszę czekać. Trwa czyszczenie danych i powrót na stronę główną.'
  } else {
    idleTitle.textContent = 'Sesja wygasa'
    idleMessage.innerHTML =
      'Sesja zostanie zakończona za <strong id="idle-countdown">30</strong> sekund.'
  }
}

function showConfirm() {
  idleModal.classList.add('hidden')
  confirmModal.classList.remove('hidden')
  setConfirmBusy(false)
  setIdleBusy(false)
}

function showIdle(seconds) {
  // Idle countdown must always be visible — clear leftover "ending" busy state.
  if (isBusy) {
    setIdleBusy(false)
  }

  confirmModal.classList.add('hidden')
  idleModal.classList.remove('hidden')
  idleContinueBtn.classList.remove('hidden')
  document.getElementById('idle-countdown').textContent = String(seconds ?? 30)
}

function showEnding() {
  if (!confirmModal.classList.contains('hidden')) {
    setConfirmBusy(true)
    return
  }

  idleModal.classList.remove('hidden')
  setIdleBusy(true)
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
  try {
    const result = await window.overlay.confirm.accept()
    if (!result?.ok) {
      setConfirmBusy(false)
    }
  } catch {
    setConfirmBusy(false)
  }
})

idleContinueBtn.addEventListener('click', async () => {
  await window.overlay.idle.continue()
})

idleEndBtn.addEventListener('click', async () => {
  if (isBusy) return
  setIdleBusy(true)
  try {
    const result = await window.overlay.idle.endNow()
    if (!result?.ok) {
      setIdleBusy(false)
    }
  } catch {
    setIdleBusy(false)
  }
})

window.overlay.onMode((data) => {
  if (data.mode === 'confirm') {
    showConfirm()
  } else if (data.mode === 'idle') {
    showIdle(data.seconds)
  } else if (data.mode === 'ending') {
    showEnding()
  }
})
