export type LicenseStatus = 'trial' | 'licensed' | 'grace' | 'read-only'
export type ValidationOutcome = 'valid' | 'expired' | 'invalid' | null

export interface LicenseRecord {
  machineId: string
  trialStartedAt: number | null
  licenseKey: string | null
  instanceId: string | null
  expiresAt: number | null
  email: string | null
  lastValidatedAt: number | null
  lastValidationResult: ValidationOutcome
}

export interface LicensingConfig {
  mode: 'off' | 'test' | 'live'
  apiBase: string
  storeUrl: string
  productId: string
  trialDays: number
  graceDays: number
  validationIntervalDays: number
}

export interface AccessState {
  status: LicenseStatus
  canWrite: boolean
  trialDaysLeft: number | null
  graceDaysLeft: number | null
  expiresAt: number | null
  email: string | null
  licenseKeyMasked: string | null
}

export interface LicensingInfo {
  state: AccessState
  mode: LicensingConfig['mode']
  storeUrl: string
  trialDays: number
  graceDays: number
}

export interface ProviderValidation {
  valid: boolean
  status: 'active' | 'expired' | 'invalid'
  expiresAt: number | null
  email: string | null
}

export interface LicensingProvider {
  activate(licenseKey: string, instanceName: string): Promise<{ instanceId: string; expiresAt: number | null; email: string | null }>
  validate(licenseKey: string, instanceId: string | null): Promise<ProviderValidation>
  deactivate(licenseKey: string, instanceId: string): Promise<void>
}

export const LICENSE_ERROR = 'LICENSE_REQUIRED'
export const DAY_MS = 86_400_000

export const DEFAULT_LICENSING_CONFIG: LicensingConfig = {
  mode: 'off',
  apiBase: 'https://api.lemonsqueezy.com',
  storeUrl: '',
  productId: '',
  trialDays: 14,
  graceDays: 30,
  validationIntervalDays: 7
}

export function emptyRecord(machineId: string): LicenseRecord {
  return {
    machineId,
    trialStartedAt: null,
    licenseKey: null,
    instanceId: null,
    expiresAt: null,
    email: null,
    lastValidatedAt: null,
    lastValidationResult: null
  }
}

export function maskKey(key: string | null): string | null {
  if (!key) return null
  if (key.length <= 8) return `${key.slice(0, 2)}••••`
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

export function computeAccess(
  record: LicenseRecord,
  config: Pick<LicensingConfig, 'mode' | 'trialDays' | 'graceDays' | 'validationIntervalDays'>,
  now: number
): AccessState {
  const base = {
    expiresAt: record.expiresAt,
    email: record.email,
    licenseKeyMasked: maskKey(record.licenseKey)
  }

  if (config.mode === 'off') {
    return { status: 'licensed', canWrite: true, trialDaysLeft: null, graceDaysLeft: null, ...base }
  }

  if (!record.licenseKey) {
    if (record.trialStartedAt === null) {
      return { status: 'trial', canWrite: true, trialDaysLeft: config.trialDays, graceDaysLeft: null, ...base }
    }
    const elapsed = now - record.trialStartedAt
    const left = Math.max(0, Math.ceil((config.trialDays * DAY_MS - elapsed) / DAY_MS))
    if (elapsed < config.trialDays * DAY_MS) {
      return { status: 'trial', canWrite: true, trialDaysLeft: left, graceDaysLeft: null, ...base }
    }
    return { status: 'read-only', canWrite: false, trialDaysLeft: 0, graceDaysLeft: null, ...base }
  }

  if (record.lastValidationResult === 'expired' || record.lastValidationResult === 'invalid') {
    return { status: 'read-only', canWrite: false, trialDaysLeft: null, graceDaysLeft: 0, ...base }
  }

  if (record.lastValidatedAt === null) {
    return { status: 'grace', canWrite: true, trialDaysLeft: null, graceDaysLeft: config.graceDays, ...base }
  }

  const stale = now - record.lastValidatedAt
  if (stale <= config.validationIntervalDays * DAY_MS) {
    return { status: 'licensed', canWrite: true, trialDaysLeft: null, graceDaysLeft: null, ...base }
  }
  if (stale <= config.graceDays * DAY_MS) {
    const left = Math.max(1, Math.ceil((config.graceDays * DAY_MS - stale) / DAY_MS))
    return { status: 'grace', canWrite: true, trialDaysLeft: null, graceDaysLeft: left, ...base }
  }
  return { status: 'read-only', canWrite: false, trialDaysLeft: null, graceDaysLeft: 0, ...base }
}
