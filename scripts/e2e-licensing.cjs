const { execFileSync } = require('child_process')
const { join } = require('path')
const { mkdtempSync } = require('fs')
const { tmpdir } = require('os')
const electron = require('electron')

function run(scenario, env) {
  const out = execFileSync(electron, [join(__dirname, 'licensing-scenario.cjs')], {
    env: { ...process.env, ...env, SCENARIO: scenario },
    encoding: 'utf8',
    timeout: 90000,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const line = out.split('\n').find((l) => l.startsWith('RESULT '))
  if (!line) throw new Error(`No result for scenario ${scenario}:\n${out}`)
  return JSON.parse(line.slice(7))
}

const sharedDir = mkdtempSync(join(tmpdir(), 'lic-shared-'))

const trial = run('trial', { LICENSING_MODE: 'test', LICENSING_MOCK: 'valid', ACTION: 'tryCreate' })
const expiredTrial = run('expired-trial', {
  LICENSING_MODE: 'test',
  SEED: 'expired-trial',
  ACTION: 'tryCreate'
})
const activated = run('activated', {
  LICENSING_MODE: 'test',
  LICENSING_MOCK: 'valid',
  ACTION: 'activate',
  USERDATA: sharedDir
})
const lapsed = run('lapsed', {
  LICENSING_MODE: 'test',
  LICENSING_MOCK: 'expired',
  LICENSING_FORCE_VALIDATE: '1',
  USERDATA: sharedDir
})

const summary = {
  ok:
    trial.status === 'trial' &&
    trial.canWrite === true &&
    trial.mutation === 'ok' &&
    expiredTrial.status === 'read-only' &&
    expiredTrial.canWrite === false &&
    expiredTrial.mutation === 'LICENSE_REQUIRED' &&
    activated.activation === 'licensed' &&
    lapsed.status === 'read-only' &&
    lapsed.canWrite === false,
  trial,
  expiredTrial,
  activated,
  lapsed
}
console.log(JSON.stringify(summary, null, 1))
process.exit(summary.ok ? 0 : 1)
