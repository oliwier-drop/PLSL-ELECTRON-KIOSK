const { spawn } = require('node:child_process')
const fs = require('node:fs')

const TAB_TIP_PATH =
  'C:\\Program Files\\Common Files\\microsoft shared\\ink\\TabTip.exe'

function showOnScreenKeyboard() {
  if (process.platform !== 'win32') {
    return
  }

  if (fs.existsSync(TAB_TIP_PATH)) {
    spawn(TAB_TIP_PATH, { detached: true, stdio: 'ignore' }).unref()
    return
  }

  spawn('osk.exe', { detached: true, stdio: 'ignore' }).unref()
}

module.exports = { showOnScreenKeyboard }
