const CAMPAIGN = /^[A-Za-z0-9_-]{1,64}$/

export function parseStartPayload(payload: string | undefined): { origin: string; campaignCode: string } {
  const value = (payload ?? '').trim()
  if (!CAMPAIGN.test(value)) return { origin: 'direto', campaignCode: 'direto' }
  return { origin: value, campaignCode: value }
}

export function customerName(firstName?: string, lastName?: string): string {
  const name = [firstName, lastName].filter((part) => part && part.trim()).join(' ').trim()
  return name || 'Cliente Telegram'
}
