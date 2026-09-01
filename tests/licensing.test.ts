import { describe, expect, it } from 'vitest'
import { computeAccess, emptyRecord, type LicenseRecord } from '@shared/licensing'

const config = { mode: 'test' as const, trialDays: 14, graceDays: 30, validationIntervalDays: 7 }
const DAY = 86_400_000
const NOW = Date.now()

function trialRecord(startedDaysAgo: number | null): LicenseRecord {
  const r = emptyRecord('m1')
  r.trialStartedAt = startedDaysAgo === null ? null : NOW - startedDaysAgo * DAY
  return r
}

function licensedRecord(opts: {
  lastValidatedDaysAgo?: number | null
  outcome?: 'valid' | 'expired' | 'invalid' | null
}): LicenseRecord {
  const r = emptyRecord('m1')
  r.trialStartedAt = NOW - 60 * DAY
  r.licenseKey = 'AAAA-BBBB-CCCC-DDDD'
  r.instanceId = 'inst-1'
  r.lastValidatedAt =
    opts.lastValidatedDaysAgo === null || opts.lastValidatedDaysAgo === undefined
      ? null
      : NOW - opts.lastValidatedDaysAgo * DAY
  r.lastValidationResult = opts.outcome ?? 'valid'
  return r
}

describe('computeAccess — mode off', () => {
  it('always grants full access', () => {
    const state = computeAccess(emptyRecord('m1'), { ...config, mode: 'off' }, NOW)
    expect(state.status).toBe('licensed')
    expect(state.canWrite).toBe(true)
  })
})

describe('computeAccess — trial', () => {
  it('shows a fresh trial when not started', () => {
    const state = computeAccess(trialRecord(null), config, NOW)
    expect(state.status).toBe('trial')
    expect(state.canWrite).toBe(true)
    expect(state.trialDaysLeft).toBe(14)
  })

  it('counts remaining trial days', () => {
    const state = computeAccess(trialRecord(3), config, NOW)
    expect(state.status).toBe('trial')
    expect(state.trialDaysLeft).toBe(11)
    expect(state.canWrite).toBe(true)
  })

  it('locks after the trial expires', () => {
    const state = computeAccess(trialRecord(15), config, NOW)
    expect(state.status).toBe('read-only')
    expect(state.canWrite).toBe(false)
  })
})

describe('computeAccess — licensed', () => {
  it('is licensed when recently validated', () => {
    const state = computeAccess(licensedRecord({ lastValidatedDaysAgo: 2 }), config, NOW)
    expect(state.status).toBe('licensed')
    expect(state.canWrite).toBe(true)
  })

  it('enters grace after the validation interval', () => {
    const state = computeAccess(licensedRecord({ lastValidatedDaysAgo: 10 }), config, NOW)
    expect(state.status).toBe('grace')
    expect(state.canWrite).toBe(true)
    expect(state.graceDaysLeft).toBeGreaterThan(0)
  })

  it('locks after the grace period lapses', () => {
    const state = computeAccess(licensedRecord({ lastValidatedDaysAgo: 35 }), config, NOW)
    expect(state.status).toBe('read-only')
    expect(state.canWrite).toBe(false)
  })

  it('treats a never-validated license as grace', () => {
    const state = computeAccess(licensedRecord({ lastValidatedDaysAgo: null }), config, NOW)
    expect(state.status).toBe('grace')
    expect(state.canWrite).toBe(true)
  })

  it('locks immediately on a definitive expired or invalid result', () => {
    expect(computeAccess(licensedRecord({ outcome: 'expired' }), config, NOW).canWrite).toBe(false)
    expect(computeAccess(licensedRecord({ outcome: 'invalid' }), config, NOW).canWrite).toBe(false)
  })

  it('masks the license key', () => {
    const state = computeAccess(licensedRecord({}), config, NOW)
    expect(state.licenseKeyMasked).toBe('AAAA••••••••DDDD')
  })
})
