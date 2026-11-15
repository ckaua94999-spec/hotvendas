// O painel filtra por America/Sao_Paulo, então as datas aparecem nesse fuso, onde quer que a aba esteja aberta.
const ZONE = 'America/Sao_Paulo'

export type Granularity = 'hour' | 'day' | 'month'

export function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100)
}

export function formatPercent(value: number) {
  return `${(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function formatInt(value: number) {
  return Math.round(value || 0).toLocaleString('pt-BR')
}

/** Reais curtos para eixo de gráfico: R$ 950, R$ 1,5 mil, R$ 2,25 mil. */
export function formatCompactBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 2 }).format((cents || 0) / 100)
}

/** "1.234,56" digitado num campo vira centavos. Texto que não é número vira zero. */
export function parseReais(text: string) {
  const value = Number(String(text || '').trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

function zoned(value: string | Date, options: Intl.DateTimeFormatOptions) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, hourCycle: 'h23', ...options }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>
}

export function formatDate(value: string | Date | null | undefined) {
  const parts = value ? zoned(value, { day: '2-digit', month: '2-digit', year: 'numeric' }) : null
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : '—'
}

export function formatDateTime(value: string | Date | null | undefined) {
  const parts = value ? zoned(value, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null
  return parts ? `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}` : '—'
}

export function formatShortDateTime(value: string | Date | null | undefined) {
  const parts = value ? zoned(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null
  return parts ? `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}` : '—'
}

/** Data de calendário gravada sem hora (despesas): mostra o dia como foi digitado. */
export function formatCalendarDate(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—'
}

export function formatRelative(value: string | Date | null | undefined, now: number = Date.now()) {
  if (!value) return '—'
  const time = (value instanceof Date ? value : new Date(value)).getTime()
  if (Number.isNaN(time)) return '—'
  const seconds = Math.round((now - time) / 1000)
  if (seconds < 0) return formatShortDateTime(value)
  if (seconds < 60) return 'agora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days} d`
  return formatDate(value)
}

/** Rótulo curto de um intervalo do gráfico: 14h, 15/11, nov/26. */
export function bucketLabel(start: string, granularity: Granularity) {
  if (granularity === 'hour') return `${zoned(start, { hour: '2-digit' })?.hour ?? ''}h`
  if (granularity === 'day') {
    const parts = zoned(start, { day: '2-digit', month: '2-digit' })
    return parts ? `${parts.day}/${parts.month}` : ''
  }
  const parts = zoned(start, { month: 'short', year: '2-digit' })
  return parts ? `${parts.month.replace('.', '')}/${parts.year}` : ''
}

/** Rótulo por extenso do mesmo intervalo, para a dica do gráfico e a tabela. */
export function bucketTitle(start: string, granularity: Granularity) {
  if (granularity === 'hour') {
    const parts = zoned(start, { day: '2-digit', month: '2-digit', hour: '2-digit' })
    if (!parts) return ''
    const next = String((Number(parts.hour) + 1) % 24).padStart(2, '0')
    return `${parts.day}/${parts.month}, ${parts.hour}h às ${next}h`
  }
  if (granularity === 'day') {
    const parts = zoned(start, { weekday: 'long', day: '2-digit', month: '2-digit' })
    return parts ? `${parts.weekday}, ${parts.day}/${parts.month}` : ''
  }
  const parts = zoned(start, { month: 'long', year: 'numeric' })
  return parts ? `${parts.month} de ${parts.year}` : ''
}

export function initials(name: string) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}
