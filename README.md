# PLSL Electron Kiosk

Firmowy kiosk pracowniczy oparty na [Electron](https://www.electronjs.org/docs/latest/).

## Wymagania

- Node.js 18+
- npm
- Windows 10/11 (własna klawiatura ekranowa uruchamiana w kiosku)

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
| **Zakończ sesję** | Czyści cookies, cache, storage i wraca na stronę startową |

Po **2 minutach 30 sekundach** bezczynności pojawia się ostrzeżenie z 30-sekundowym odliczaniem. Brak reakcji uruchamia tę samą procedurę co przycisk „Zakończ sesję”.

Klawiatura ekranowa pojawia się automatycznie po fokusie w polu tekstowym (`input` / `textarea`) jako osobny widok Electron na dole okna — bez systemowego TabTip. Widok strony jest wtedy zmniejszany, żeby pole nie chowało się pod klawiaturą.

## Konfiguracja

### Konfiguracja przy instalacji

Instalator NSIS (`npm run build`) pyta o **adres strony głównej** kiosku. Wartość jest zapisywana do:

```
%PROGRAMDATA%\PLSL Kiosk\config.json
```

Przykład pliku:

```json
{
  "homeUrl": "https://kiosk.firma.pl"
}
```

- **Świeża instalacja** — instalator wyświetla stronę z polem URL (wymagany adres `http://` lub `https://`).
- **Aktualizacja** — istniejący `config.json` jest zachowany, strona konfiguracji nie jest pokazywana ponownie.
- **Zmiana URL po instalacji** — edytuj plik w ProgramData i uruchom kiosk ponownie.

Instalacja jest zawsze **per-machine** (dla wszystkich użytkowników) i wymaga uprawnień administratora.

### Domyślna konfiguracja deweloperska

Plik [`config.js`](config.js) zawiera wartości domyślne używane przy `npm start`, gdy plik w ProgramData nie istnieje:

```javascript
module.exports = {
  homeUrl: 'http://dev.local',
  idle: {
    warningAfterMs: 150_000,  // 2 min 30 s
    endAfterMs: 180_000,      // 3 min
    countdownMs: 30_000,      // 30 s na reakcję
  },
  toolbarHeight: 80,
  keyboard: {
    autoShowOnFocus: true,
    debounceMs: 300,
    height: 270,
    widthPercent: 65,
    hideOnBlurDelayMs: 200,
  },
  dev: {
    ignoreCertificateErrors: false,  // true tylko w dev przy self-signed cert
    exitShortcut: 'CommandOrControl+Shift+Q',
  },
}
```

Klucze `keyboard.*`:

| Klucz | Znaczenie |
|-------|-----------|
| `autoShowOnFocus` | Pokazuj klawiaturę po fokusie w polu tekstowym |
| `debounceMs` | Opóźnienie przed pokazaniem po fokusie |
| `hideOnBlurDelayMs` | Opóźnienie przed ukryciem po blur |
| `height` | Wysokość panelu klawiatury (px) |
| `widthPercent` | Szerokość panelu klawiatury (% okna) |

### Testowanie konfiguracji runtime lokalnie

Aby przetestować wczytywanie z ProgramData bez instalatora, utwórz ręcznie:

```
C:\ProgramData\PLSL Kiosk\config.json
```

z własnym `homeUrl`, a następnie uruchom `npm start`.

### Wersja portable

Build portable (`npm run build:portable`) nie zawiera instalatora — używa `config.js` lub ręcznie skopiowanego pliku `config.json` w ProgramData.

### Certyfikaty wewnętrzne

Na produkcji zainstaluj firmowy certyfikat CA w systemie Windows. W środowisku deweloperskim możesz tymczasowo ustawić `dev.ignoreCertificateErrors: true`.

## Struktura projektu

```
├── main.js                  # Proces główny, WebContentsView, IPC
├── preload.js               # API powłoki (toolbar)
├── browser-preload.js       # Detekcja focusu pól → klawiatura
├── keyboard-preload.js      # API widoku klawiatury
├── overlay-preload.js       # API overlay (idle / confirm)
├── config.js                # Konfiguracja URL, timeoutów, klawiatury
├── src/
│   ├── session-manager.js   # Czyszczenie sesji
│   ├── navigation-guard.js  # Obsługa popupów w tym samym oknie
│   ├── idle-timer.js        # Timeout bezczynności
│   └── runtime-config.js    # Wczytywanie config.json z ProgramData
├── build/
│   └── installer.nsh        # Niestandardowa strona instalatora NSIS
└── shell/
    ├── index.html           # Pasek sterowania i modale
    ├── shell.css
    ├── shell.js
    ├── overlay.html
    ├── keyboard.html        # UI klawiatury ekranowej
    ├── keyboard.js
    ├── keyboard.css
    └── vendor/simple-keyboard/
```

