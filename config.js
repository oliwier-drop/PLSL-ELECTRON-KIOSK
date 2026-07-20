module.exports = {

  homeUrl: 'http://kiosk.htpl.internal',

  idle: {

    warningAfterMs: 150_000,

    endAfterMs: 180_000,

    countdownMs: 30_000,

  },

  toolbarHeight: 80,

  logoPath: 'assets/ht_logo.png',

  keyboard: {

    autoShowOnFocus: true,

    debounceMs: 300,

  },

  dev: {

    ignoreCertificateErrors: false,

    exitShortcut: 'CommandOrControl+Shift+Q',

  },

}

