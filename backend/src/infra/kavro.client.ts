import { centsFromKavroAmount } from '../domain/money'
import { Environment } from '../domain/confirm-payment'

export function environmentFromKey(key: string): Environment {
  return key.startsWith('kvk_test_') ? 'sandbox' : 'live'
}

export function feeFromCharge(charge: { fee?: number | string | null; net?: number | string | null; amount?: number | string | null }) {
  if (charge.fee == null) return { feeCents: null as number | null, netCents: null as number | null, feeSource: 'nao_informada' as const }
  const feeCents = centsFromKavroAmount(charge.fee)
  const netCents = charge.net == null && charge.amount != null ? centsFromKavroAmount(charge.amount) - feeCents : charge.net == null ? null : centsFromKavroAmount(charge.net)
  return { feeCents, netCents, feeSource: 'gateway' as const }
}

export class KavroClient {
  constructor(private apiKey: string) {}

  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${this.apiKey}`)
    if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json')
    const response = await fetch(`https://api.kavropay.com.br/v1${path}`, { ...init, headers })
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok) {
      const message = json?.error?.message || json?.message || `KavroPay respondeu ${response.status}`
      throw new Error(message)
    }
    return json
  }

  createCharge(orderId: string, body: Record<string, unknown>) {
    return this.request('/charges', {
      method: 'POST',
      headers: { 'Idempotency-Key': orderId },
      body: JSON.stringify(body),
    })
  }

  getCharge(id: string) {
    return this.request(`/charges/${id}`)
  }
}
