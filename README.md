# PLSL Electron Kiosk

Firmowy kiosk pracowniczy oparty na [Electron](https://www.electronjs.org/docs/latest/).

## Wymagania

- Node.js 18+
- npm
- Windows 10/11 (klawiatura ekranowa TabTip)

## Instalacja

```bash
npm install
```

## Uruchomienie

```bash
npm start
```

W trybie deweloperskim aplikację można zamknąć skrótem `Ctrl+Shift+Q`.

## Funkcje

| Przycisk | Działanie |
|----------|-----------|
| **Wstecz** | Wraca do poprzedniej strony w historii |
| **Strona główna** | Otwiera stronę startową bez wylogowywania |
| **Odśwież** | Odświeża aktualną stronę |
| **Klawiatura** | Otwiera systemową klawiaturę ekranową Windows |
| **Zakończ sesję** | Czyści cookies, cache, storage i wraca na stronę startową |

Po **2 minutach 30 sekundach** bezczynności pojawia się ostrzeżenie z 30-sekundowym odliczaniem. Brak reakcji uruchamia tę samą procedurę co przycisk „Zakończ sesję”.

## Konfiguracja

Plik [`config.js`](config.js):

```javascript
module.exports = {
  homeUrl: 'http://dev.local',
  idle: {
    warningAfterMs: 150_000,  // 2 min 30 s
    endAfterMs: 180_000,      // 3 min
    countdownMs: 30_000,      // 30 s na reakcję
  },
  toolbarHeight: 80,
  dev: {
    ignoreCertificateErrors: false,  // true tylko w dev przy self-signed cert
    exitShortcut: 'CommandOrControl+Shift+Q',
  },
}
```

### Certyfikaty wewnętrzne

Na produkcji zainstaluj firmowy certyfikat CA w systemie Windows. W środowisku deweloperskim możesz tymczasowo ustawić `dev.ignoreCertificateErrors: true`.

## Struktura projektu

```
├── main.js                  # Proces główny, BrowserView, IPC
├── preload.js               # Bezpieczne API dla powłoki
├── config.js                # Konfiguracja URL, domen, timeoutów
├── src/
│   ├── session-manager.js   # Czyszczenie sesji
│   ├── navigation-guard.js  # Obsługa popupów w tym samym oknie
│   ├── idle-timer.js        # Timeout bezczynności
│   └── keyboard.js          # Klawiatura ekranowa Windows
└── shell/
    ├── index.html           # Pasek sterowania i modale
    ├── shell.css
    └── shell.js
```

## Wdrożenie na stanowisku kioskowym

1. Zainstaluj Node.js i zależności (`npm install`).
2. Ustaw `homeUrl` w `config.js`.
3. Zainstaluj firmowy certyfikat CA (jeśli witryny używają HTTPS wewnętrznego).
4. Uruchom aplikację w trybie kiosk (`npm start`).
5. Skonfiguruj autostart Windows (np. skrót w folderze Startup lub harmonogram zadań).

## Rozszerzenia na później

- Osobny timeout dla stron odcinków płacowych (wzorzec URL w `config.js`)
- Automatyczne wysuwanie klawiatury po focus na polu tekstowym
- Pakowanie instalatora (Electron Forge / electron-builder)
