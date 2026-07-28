module.exports = {
  homeUrl: 'http://kiosk.htpl.internal',
  // Origin(y) otwierane w partition shared (cookies niekasowane).
  // Atlassian Cloud: portal + domeny logowania SSO muszą być razem.
  sharedOrigins: [
    'https://ht365.atlassian.net',
    'https://id.atlassian.com',
    'https://auth.atlassian.com',
  ],
  idle: {
    warningAfterMs: 150_000,
    // Nieużywane — zachowane dla kompatybilności ze starym config.json w ProgramData.
    // Auto-koniec sesji robi wyłącznie soft-idle (warningAfterMs + countdownMs).
    endAfterMs: 180_000,
    countdownMs: 30_000,
  },
  activityDebounceMs: 1000,
  toolbarHeight: 80,
  logoPath: 'assets/ht_logo.png',
  keyboard: {
    autoShowOnFocus: true,
    debounceMs: 300,
    height: 270,
    widthPercent: 65,
    hideOnBlurDelayMs: 200,
    animationMs: 280,
  },
  dev: {
    ignoreCertificateErrors: false,
    exitShortcut: 'CommandOrControl+Shift+Q',
    logIdleResets: false, // true → log [idle] reset from: … (diagnostyka)
  },
}
