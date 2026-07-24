const fs = require('node:fs')
const path = require('node:path')
const defaults = require('../config')

const CONFIG_DIR = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'PLSL Kiosk')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function getConfigPath() {
  return CONFIG_FILE
}

function loadConfig() {
  const config = JSON.parse(JSON.stringify(defaults))

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const runtime = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))

      for (const [key, value] of Object.entries(runtime)) {
        if (value === undefined || value === null) continue

        if (key === 'sharedOrigins' && Array.isArray(value)) {
          config.sharedOrigins = value.filter((item) => typeof item === 'string')
          continue
        }

        if (typeof value !== 'object') {
          config[key] = value
        }
      }
    }
  } catch (error) {
    console.warn('[kiosk] Nie udało się wczytać konfiguracji runtime:', error.message)
  }

  return config
}

module.exports = { loadConfig, getConfigPath, CONFIG_DIR, CONFIG_FILE }
