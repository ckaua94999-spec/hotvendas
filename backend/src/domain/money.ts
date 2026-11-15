export type Cents = number

export function toKavroAmount(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${frac}`
}

export function centsFromKavroAmount(amount: string | number): Cents {
  if (typeof amount === 'number') return Math.round(amount * 100)
  const trimmed = amount.trim()
  const negative = trimmed.startsWith('-')
  const body = negative ? trimmed.slice(1) : trimmed
  const [wholeRaw, fracRaw = ''] = body.split('.')
  const whole = wholeRaw === '' ? 0 : Number(wholeRaw)
  const frac = Number((fracRaw + '00').slice(0, 2))
  const cents = whole * 100 + frac
  return negative ? -cents : cents
}
