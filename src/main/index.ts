import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { initDb } from './db/client'
import { registerIpc } from './ipc'
import { initLicensing } from './licensing'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Course Scheduler',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDb(join(app.getPath('userData'), 'scheduler.db'))
  initLicensing()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
