const ZONE = 'America/Sao_Paulo'

function parts(date: Date) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const map = Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]))
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) }
}

function zonedStart(year: number, month: number, day: number): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 3, 0, 0))
  const got = parts(utcGuess)
  const deltaDays = Date.UTC(year, month - 1, day) - Date.UTC(got.year, got.month - 1, got.day)
  return new Date(utcGuess.getTime() + deltaDays)
}

function addDays(date: Date, days: number): Date {
  const copy = parts(date)
  return zonedStart(copy.year, copy.month, copy.day + days)
}

export function periodRange(preset: string, now: Date, custom?: { from?: string; to?: string }): { from: Date; to: Date } {
  const today = parts(now)
  const startToday = zonedStart(today.year, today.month, today.day)
  if (preset === 'ontem') return { from: addDays(startToday, -1), to: startToday }
  if (preset === '7d') return { from: addDays(startToday, -6), to: addDays(startToday, 1) }
  if (preset === '30d') return { from: addDays(startToday, -29), to: addDays(startToday, 1) }
  if (preset === 'este_mes') return { from: zonedStart(today.year, today.month, 1), to: zonedStart(today.year, today.month + 1, 1) }
  if (preset === 'mes_anterior') return { from: zonedStart(today.year, today.month - 1, 1), to: zonedStart(today.year, today.month, 1) }
  if (preset === 'custom' && custom?.from && custom?.to) {
    const [fy, fm, fd] = custom.from.split('-').map(Number)
    const [ty, tm, td] = custom.to.split('-').map(Number)
    return { from: zonedStart(fy, fm, fd), to: addDays(zonedStart(ty, tm, td), 1) }
  }
  return { from: startToday, to: addDays(startToday, 1) }
}

export type Granularity = 'hour' | 'day' | 'month'

const HOUR_MS = 3_600_000
const MAX_BUCKETS = 2000

/**
 * Divide um período em intervalos para os gráficos: horas até dois dias,
 * dias até uns seis meses, meses daí em diante. O primeiro intervalo sempre
 * começa em `from`, então nada do período fica de fora.
 */
export function bucketStarts(from: Date, to: Date): { granularity: Granularity; starts: Date[] } {
  const hours = (to.getTime() - from.getTime()) / HOUR_MS
  if (!(hours > 0)) return { granularity: 'hour', starts: [] }
  if (hours <= 49) {
    const starts: Date[] = []
    for (let time = from.getTime(); time < to.getTime(); time += HOUR_MS) starts.push(new Date(time))
    return { granularity: 'hour', starts }
  }
  if (hours <= 24 * 185) {
    const starts: Date[] = []
    for (let day = from; day < to; day = addDays(day, 1)) starts.push(day)
    return { granularity: 'day', starts }
  }
  const starts: Date[] = [from]
  const first = parts(from)
  let year = first.year
  let month = first.month + 1
  for (let next = zonedStart(year, month, 1); next < to; next = zonedStart(year, month, 1)) {
    if (starts.length >= MAX_BUCKETS) return { granularity: 'month', starts: [from] }
    starts.push(next)
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return { granularity: 'month', starts }
}
