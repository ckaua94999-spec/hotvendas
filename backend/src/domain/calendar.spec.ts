import { calendarDay, periodRange } from './calendar'

describe('calendarDay', () => {
  const now = new Date('2026-11-15T15:00:00.000Z')
  const inside = (date: Date, range: { from: Date; to: Date }) => date >= range.from && date < range.to

  it('despesa com a data de hoje entra no período de hoje, não no de ontem', () => {
    const day = calendarDay('2026-11-15')
    expect(day?.toISOString()).toBe('2026-11-15T03:00:00.000Z')
    expect(inside(day!, periodRange('hoje', now))).toBe(true)
    expect(inside(day!, periodRange('ontem', now))).toBe(false)
  })

  it('primeiro dia do mês entra neste mês, não no anterior', () => {
    const day = calendarDay('2026-11-01')!
    expect(inside(day, periodRange('este_mes', now))).toBe(true)
    expect(inside(day, periodRange('mes_anterior', now))).toBe(false)
  })

  it('recebendo a data completa, usa só o dia', () => {
    expect(calendarDay('2026-11-15T00:00:00.000Z')?.toISOString()).toBe('2026-11-15T03:00:00.000Z')
    expect(calendarDay('2026-11-15T03:00:00.000Z')?.toISOString()).toBe('2026-11-15T03:00:00.000Z')
  })

  it('recusa data que não existe e texto que não é data', () => {
    expect(calendarDay('2026-02-31')).toBeNull()
    expect(calendarDay('2026-13-01')).toBeNull()
    expect(calendarDay('15/11/2026')).toBeNull()
    expect(calendarDay('')).toBeNull()
    expect(calendarDay(null)).toBeNull()
    expect(calendarDay(undefined)).toBeNull()
  })
})

describe('periodRange', () => {
  const now = new Date('2026-11-15T15:00:00.000Z')

  it('hoje em São Paulo começa à meia-noite local', () => {
    const range = periodRange('hoje', now)
    expect(range.from.toISOString()).toBe('2026-11-15T03:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-11-16T03:00:00.000Z')
  })

  it('este mês cobre novembro no fuso de São Paulo', () => {
    const range = periodRange('este_mes', now)
    expect(range.from.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-12-01T03:00:00.000Z')
  })
})
