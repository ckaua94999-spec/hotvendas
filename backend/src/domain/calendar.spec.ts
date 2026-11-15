import { periodRange } from './calendar'

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
