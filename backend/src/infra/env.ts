import { createHash } from 'crypto'

export function settingsKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY || ''
  if (!raw) throw new Error('SETTINGS_ENCRYPTION_KEY ausente')
  const asBase64 = Buffer.from(raw, 'base64')
  if (asBase64.length === 32 && asBase64.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) return asBase64
  return createHash('sha256').update(raw).digest()
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
}
