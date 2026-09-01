import { ipcMain, app, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { hostname } from 'os'
import {
  computeAccess,
  DEFAULT_LICENSING_CONFIG,
  emptyRecord,
  LICENSE_ERROR,
  type AccessState,
  type LicensingConfig,
  type LicensingInfo,
  type LicensingProvider,
  type LicenseRecord
} from '@shared/licensing'
import { LemonSqueezyProvider, MockProvider } from './provider'
import { machineFingerprint } from './fingerprint'

let config: LicensingConfig = { ...DEFAULT_LICENSING_CONFIG }
let record: LicenseRecord = emptyRecord('init')
let provider: LicensingProvider | null = null
let revalidateTimer: ReturnType<typeof setInterval> | null = null

function configPath(): string {
  if (process.env['LICENSING_CONFIG']) return process.env['LICENSING_CONFIG']
  if (app.isPackaged) return join(process.resourcesPath, 'licensing.config.json')
  return join(app.getAppPath(), 'licensing.config.json')
}

function loadConfig(): LicensingConfig {
  try {
    const raw = readFileSync(configPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    const merged: LicensingConfig = {
      ...DEFAULT_LICENSING_CONFIG,
      ...parsed,
      mode: parsed.mode === 'test' || parsed.mode === 'live' ? parsed.mode : 'off'
    }
    if (merged.mode === 'live' && !merged.productId) {
      console.warn('[licensing] live mode without productId — falling back to off')
      merged.mode = 'off'
    }
    return merged
  } catch {
    if (app.isPackaged) console.warn('[licensing] config missing — licensing disabled')
    return { ...DEFAULT_LICENSING_CONFIG }
  }
}

function recordPath(): string {
  return join(app.getPath('userData'), 'license.bin')
}

function saveRecord(): void {
  const json = JSON.stringify(record)
  if (config.mode !== 'test' && safeStorage.isEncryptionAvailable()) {
    writeFileSync(recordPath(), safeStorage.encryptString(json))
  } else {
    writeFileSync(recordPath(), json, 'utf-8')
  }
}

function loadRecord(machineId: string): LicenseRecord {
  const path = recordPath()
  if (!existsSync(path)) return emptyRecord(machineId)
  try {
    const buf = readFileSync(path)
    const head = buf.subarray(0, 1).toString('utf-8')
    const json = head === '{' ? buf.toString('utf-8') : safeStorage.decryptString(buf)
    const parsed = JSON.parse(json) as LicenseRecord
    if (
      parsed.machineId === machineId ||
      (config.mode === 'test' && parsed.machineId === 'TEST')
    ) {
      return { ...emptyRecord(machineId), ...parsed, machineId: parsed.machineId }
    }
    return emptyRecord(machineId)
  } catch {
    return emptyRecord(machineId)
  }
}

export function getAccessState(): AccessState {
  return computeAccess(record, config, Date.now())
}

export function getLicensingInfo(): LicensingInfo {
  const state = getAccessState()
  return { state, mode: config.mode, storeUrl: config.storeUrl, trialDays: config.trialDays, graceDays: config.graceDays }
}

export function assertWritable(): void {
  if (!getAccessState().canWrite) {
    throw new Error(LICENSE_ERROR)
  }
}

export function guardedHandle(channel: string, listener: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertWritable()
    return (listener as (event: unknown, ...args: unknown[]) => unknown)(event, ...args)
  })
}

async function revalidate(force = false): Promise<void> {
  if (!provider || !record.licenseKey) return
  const stale = record.lastValidatedAt === null ? Infinity : Date.now() - record.lastValidatedAt
  const intervalMs = config.validationIntervalDays * 86_400_000
  if (!force && stale <= intervalMs) return
  try {
    const result = await provider.validate(record.licenseKey, record.instanceId)
    record.lastValidatedAt = Date.now()
    record.lastValidationResult = result.valid ? 'valid' : result.status === 'expired' ? 'expired' : 'invalid'
    record.expiresAt = result.expiresAt
    record.email = result.email
    saveRecord()
  } catch {
    /* network unreachable — grace logic handles staleness */
  }
}

export function initLicensing(): void {
  config = loadConfig()
  if (process.env['LICENSING_MODE'] === 'off' || process.env['LICENSING_MODE'] === 'test' || process.env['LICENSING_MODE'] === 'live') {
    config.mode = process.env['LICENSING_MODE']
  }
  record = loadRecord(machineFingerprint())
  if (config.mode === 'test' && !existsSync(recordPath())) {
    record = { ...record, machineId: 'TEST' }
  }
  if (record.trialStartedAt === null && config.mode !== 'off') {
    record.trialStartedAt = Date.now()
    saveRecord()
  } else if (config.mode === 'off') {
    saveRecordIfMissing()
  }
  provider =
    config.mode === 'live'
      ? new LemonSqueezyProvider(config.apiBase)
      : config.mode === 'test'
        ? new MockProvider((process.env['LICENSING_MOCK'] as 'valid' | 'expired' | 'invalid' | 'unreachable') ?? 'valid')
        : null

  void revalidate(process.env['LICENSING_FORCE_VALIDATE'] === '1')
  revalidateTimer = setInterval(() => void revalidate(true), 24 * 60 * 60 * 1000)
  revalidateTimer.unref?.()

  ipcMain.handle('licensing:getState', () => getLicensingInfo())

  ipcMain.handle('licensing:activate', async (_e, key: string) => {
    assertProvider()
    const trimmed = String(key ?? '').trim()
    if (!trimmed) throw new Error('invalid_key')
    const result = await provider!.activate(trimmed, hostname())
    record.licenseKey = trimmed
    record.instanceId = result.instanceId
    record.expiresAt = result.expiresAt
    record.email = result.email
    record.lastValidatedAt = Date.now()
    record.lastValidationResult = 'valid'
    saveRecord()
    return getLicensingInfo()
  })

  ipcMain.handle('licensing:deactivate', async () => {
    assertProvider()
    if (record.licenseKey && record.instanceId) {
      try {
        await provider!.deactivate(record.licenseKey, record.instanceId)
      } catch {
        /* free the seat locally even if the API call fails */
      }
    }
    record.licenseKey = null
    record.instanceId = null
    record.expiresAt = null
    record.email = null
    record.lastValidatedAt = null
    record.lastValidationResult = null
    saveRecord()
    return getLicensingInfo()
  })

  ipcMain.handle('licensing:refresh', async () => {
    await revalidate(true)
    return getLicensingInfo()
  })

  ipcMain.handle('licensing:openStore', () => {
    if (config.storeUrl) void shell.openExternal(config.storeUrl)
  })
}

function saveRecordIfMissing(): void {
  if (!existsSync(recordPath())) saveRecord()
}

function assertProvider(): void {
  if (!provider) throw new Error('licensing_disabled')
}
