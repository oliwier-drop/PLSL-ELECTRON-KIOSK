const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const TAB_TIP_PATH = path.join(
  process.env['ProgramFiles'] || 'C:\\Program Files',
  'Common Files',
  'microsoft shared',
  'ink',
  'TabTip.exe'
)

const OSK_PATH = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'osk.exe')

function runDetached(command, args = [], options = {}) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        ...options,
      })

      child.on('error', () => resolve(false))
      child.unref()
      resolve(true)
    } catch {
      resolve(false)
    }
  })
}

async function showViaComInterface() {
  const script = [
    '$tip = New-Object -ComObject UIHostNoLaunch',
    '$tip.GetTipInvocation().Toggle([System.IntPtr]::Zero)',
  ].join('; ')

  return runDetached('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ])
}

async function showViaTabTipStart() {
  if (!fs.existsSync(TAB_TIP_PATH)) {
    return false
  }

  return runDetached('cmd.exe', ['/c', 'start', '""', TAB_TIP_PATH])
}

async function showViaOsk() {
  if (fs.existsSync(OSK_PATH)) {
    return runDetached('cmd.exe', ['/c', 'start', '""', OSK_PATH])
  }

  return runDetached('cmd.exe', ['/c', 'start', 'osk.exe'])
}

async function showOnScreenKeyboard() {
  if (process.platform !== 'win32') {
    return false
  }

  const methods = [showViaComInterface, showViaTabTipStart, showViaOsk]

  for (const method of methods) {
    const ok = await method()
    if (ok) {
      return true
    }
  }

  return false
}

module.exports = { showOnScreenKeyboard }
