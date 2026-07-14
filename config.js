module.exports = {
  homeUrl: 'https://odpady.htpl.internal',
  allowedHosts: [
    'kiosk.htpl.internal', 'ht365.pl', 'ht365.atlassian.net',
    // Dodaj hosty Enovy, Jiry i innych portali przed wdrożeniem:
    // 'enova.example.internal',
    // 'jira.example.internal',
  ],
  idle: {
    warningAfterMs: 150_000,
    endAfterMs: 180_000,
    countdownMs: 30_000,
  },
  toolbarHeight: 80,
  dev: {
    ignoreCertificateErrors: false,
    exitShortcut: 'CommandOrControl+Shift+Q',
  },
}
