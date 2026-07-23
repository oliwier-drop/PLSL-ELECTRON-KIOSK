async function showOnScreenKeyboard(contentView) {
  if (!contentView || contentView.webContents.isDestroyed()) {
    return false
  }

  contentView.webContents.send('keyboard:show')
  return true
}

module.exports = { showOnScreenKeyboard }
