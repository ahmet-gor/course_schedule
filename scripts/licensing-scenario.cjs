const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const { mkdtempSync, writeFileSync, existsSync } = require('fs')
const { tmpdir } = require('os')

process.env.SMOKE = '1'

const userData = process.env.USERDATA || mkdtempSync(join(tmpdir(), 'lic-'))
app.setPath('userData', userData)

if (process.env.SEED === 'expired-trial' && !existsSync(join(userData, 'license.bin'))) {
  writeFileSync(
    join(userData, 'license.bin'),
    JSON.stringify({
      machineId: 'TEST',
      trialStartedAt: Date.now() - 20 * 86400000,
      licenseKey: null,
      instanceId: null,
      expiresAt: null,
      email: null,
      lastValidatedAt: null,
      lastValidationResult: null
    }),
    'utf-8'
  )
}

require(join(__dirname, '..', 'out', 'main', 'index.js'))

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 2500))
  const win = BrowserWindow.getAllWindows()[0]
  const call = (expr) => win.webContents.executeJavaScript(expr)
  const info = await call('window.api.licensing.getState()')

  let mutation = null
  if (process.env.ACTION === 'tryCreate') {
    mutation = await call(
      `window.api.terms.create('LicTest').then(() => 'ok').catch(e => String(e).includes('LICENSE_REQUIRED') ? 'LICENSE_REQUIRED' : 'FAIL:' + e)`
    )
  }
  let activation = null
  if (process.env.ACTION === 'activate') {
    activation = await call(
      `window.api.licensing.activate('TEST-KEY-1234').then(i => i.state.status).catch(e => 'FAIL:' + e)`
    )
  }

  console.log(
    'RESULT ' +
      JSON.stringify({
        scenario: process.env.SCENARIO,
        status: info.state.status,
        canWrite: info.state.canWrite,
        trialDaysLeft: info.state.trialDaysLeft,
        mutation,
        activation
      })
  )
  setTimeout(() => app.quit(), 200)
})
