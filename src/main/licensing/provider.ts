import type { LicensingProvider, ProviderValidation } from '@shared/licensing'
import { DAY_MS } from '@shared/licensing'

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

export class LemonSqueezyProvider implements LicensingProvider {
  constructor(private apiBase: string) {}

  private async call(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok && !('error' in json)) {
      throw new Error(`LemonSqueezy API error ${res.status}`)
    }
    return json
  }

  async activate(licenseKey: string, instanceName: string) {
    const json = await this.call('/v1/licenses/activate', { license_key: licenseKey, instance_name: instanceName })
    if (json['activated'] !== true) {
      throw new Error(String(json['error'] ?? 'license_activation_failed'))
    }
    const instance = json['instance'] as { id?: number | string } | undefined
    const key = json['license_key'] as { expires_at?: unknown } | undefined
    return {
      instanceId: String(instance?.id ?? ''),
      expiresAt: parseDate(key?.expires_at),
      email: (json['meta'] as { store_email?: string } | undefined)?.store_email ?? null
    }
  }

  async validate(licenseKey: string, instanceId: string | null): Promise<ProviderValidation> {
    const body: Record<string, string> = { license_key: licenseKey }
    if (instanceId) body['instance_id'] = instanceId
    const json = await this.call('/v1/licenses/validate', body)
    const valid = json['valid'] === true
    const key = json['license_key'] as { status?: unknown; expires_at?: unknown } | undefined
    const status = valid ? 'active' : key?.status === 'expired' ? 'expired' : 'invalid'
    return {
      valid,
      status,
      expiresAt: parseDate(key?.expires_at),
      email: (json['meta'] as { store_email?: string } | undefined)?.store_email ?? null
    }
  }

  async deactivate(licenseKey: string, instanceId: string) {
    await this.call('/v1/licenses/deactivate', { license_key: licenseKey, instance_id: instanceId })
  }
}

export class MockProvider implements LicensingProvider {
  constructor(private behavior: 'valid' | 'expired' | 'invalid' | 'unreachable') {}

  private get email(): string | null {
    return 'test-user@example.com'
  }

  async activate(licenseKey: string) {
    if (this.behavior === 'unreachable') throw new Error('network_unreachable')
    if (this.behavior !== 'valid') throw new Error('license_activation_failed')
    void licenseKey
    return { instanceId: 'mock-instance-1', expiresAt: Date.now() + 30 * DAY_MS, email: this.email }
  }

  async validate(): Promise<ProviderValidation> {
    if (this.behavior === 'unreachable') throw new Error('network_unreachable')
    if (this.behavior === 'expired') {
      return { valid: false, status: 'expired', expiresAt: Date.now() - DAY_MS, email: this.email }
    }
    if (this.behavior === 'invalid') {
      return { valid: false, status: 'invalid', expiresAt: null, email: null }
    }
    return { valid: true, status: 'active', expiresAt: Date.now() + 30 * DAY_MS, email: this.email }
  }

  async deactivate(): Promise<void> {
    if (this.behavior === 'unreachable') throw new Error('network_unreachable')
  }
}
