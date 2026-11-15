import { bucketStarts, periodRange } from './calendar'
import { summarizeFinance } from './finance'
import { buildSeries, SeriesPayment } from './timeseries'

const now = new Date('2026-11-15T15:00:00.000Z')

function payment(over: Partial<SeriesPayment>): SeriesPayment {
  return { amountCents: 9900, feeCents: 300, netCents: 9600, feeSource: 'gateway', status: 'pago', paidAt: null, refundedAt: null, ...over }
}

const empty = { users: [], pix: [], paid: [], payments: [], expenses: [] }

describe('bucketStarts', () => {
  it('hoje vira 24 horas a partir da meia-noite de São Paulo', () => {
    const { from, to } = periodRange('hoje', now)
    const { granularity, starts } = bucketStarts(from, to)
    expect(granularity).toBe('hour')
    expect(starts).toHaveLength(24)
    expect(starts[0].toISOString()).toBe('2026-11-15T03:00:00.000Z')
    expect(starts[23].toISOString()).toBe('2026-11-16T02:00:00.000Z')
  })

  it('7 dias vira sete dias locais', () => {
    const { from, to } = periodRange('7d', now)
    const { granularity, starts } = bucketStarts(from, to)
    expect(granularity).toBe('day')
    expect(starts.map((start) => start.toISOString())).toEqual([
      '2026-11-09T03:00:00.000Z', '2026-11-10T03:00:00.000Z', '2026-11-11T03:00:00.000Z', '2026-11-12T03:00:00.000Z',
      '2026-11-13T03:00:00.000Z', '2026-11-14T03:00:00.000Z', '2026-11-15T03:00:00.000Z',
    ])
  })

  it('período longo vira meses e começa no primeiro dia pedido', () => {
    const { from, to } = periodRange('custom', now, { from: '2026-01-10', to: '2026-11-15' })
    const { granularity, starts } = bucketStarts(from, to)
    expect(granularity).toBe('month')
    expect(starts[0].toISOString()).toBe('2026-01-10T03:00:00.000Z')
    expect(starts[1].toISOString()).toBe('2026-02-01T03:00:00.000Z')
    expect(starts.at(-1)?.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(starts).toHaveLength(11)
  })

  it('intervalo invertido não gera intervalos', () => {
    const { from, to } = periodRange('custom', now, { from: '2026-11-15', to: '2026-11-01' })
    expect(bucketStarts(from, to).starts).toEqual([])
  })

  it('intervalo absurdo cai num intervalo só em vez de milhares', () => {
    const { from, to } = periodRange('custom', now, { from: '1000-01-01', to: '9000-01-01' })
    expect(bucketStarts(from, to).starts).toEqual([from])
  })
})

describe('buildSeries', () => {
  const range = periodRange('hoje', now)

  it('período sem movimento mostra zero em todos os intervalos', () => {
    const { points } = buildSeries(range, empty, now)
    expect(points).toHaveLength(24)
    for (const point of points) {
      expect(point).toMatchObject({ newUsers: 0, pix: 0, paid: 0, grossCents: 0, feeCents: 0, netCents: 0, refundCents: 0, expenseCents: 0, resultCents: 0 })
    }
  })

  it('coloca cada coisa na hora local em que aconteceu', () => {
    const { points } = buildSeries(range, {
      users: [new Date('2026-11-15T03:00:00.000Z'), new Date('2026-11-15T03:59:59.000Z')],
      pix: [new Date('2026-11-15T14:10:00.000Z')],
      paid: [new Date('2026-11-15T14:40:00.000Z')],
      payments: [payment({ paidAt: new Date('2026-11-15T14:40:00.000Z') })],
      expenses: [{ occurredOn: new Date('2026-11-15T12:00:00.000Z'), amountCents: 5000 }],
    }, now)
    expect(points[0].newUsers).toBe(2)
    expect(points[11]).toMatchObject({ pix: 1, paid: 1, grossCents: 9900, feeCents: 300, netCents: 9600 })
    expect(points[9]).toMatchObject({ expenseCents: 5000, resultCents: -5000 })
  })

  it('ignora o que está fora do período', () => {
    const { points } = buildSeries(range, {
      users: [new Date('2026-11-15T02:59:59.000Z'), new Date('2026-11-16T03:00:00.000Z')],
      pix: [new Date('2026-11-14T10:00:00.000Z')],
      paid: [],
      payments: [],
      expenses: [{ occurredOn: new Date('2026-11-16T03:00:00.000Z'), amountCents: 100 }],
    }, now)
    expect(points.reduce((sum, point) => sum + point.newUsers + point.pix + point.expenseCents, 0)).toBe(0)
  })

  it('marca como futuro só o que ainda não começou', () => {
    const { points } = buildSeries(range, empty, now)
    expect(points[12].future).toBe(false)
    expect(points[13].future).toBe(true)
    expect(points.filter((point) => point.future)).toHaveLength(11)
  })

  it('a soma dos intervalos bate com o resumo financeiro do período', () => {
    const week = periodRange('7d', now)
    const payments = [
      payment({ paidAt: new Date('2026-11-10T13:00:00.000Z') }),
      payment({ paidAt: new Date('2026-11-12T22:00:00.000Z'), feeCents: null, netCents: null, feeSource: 'nao_informada' }),
      payment({ paidAt: new Date('2026-11-13T05:00:00.000Z'), refundedAt: new Date('2026-11-14T12:00:00.000Z'), status: 'reembolsado' }),
      // Pago antes do período, reembolsado dentro: entra no dia do reembolso.
      payment({ paidAt: new Date('2026-11-01T12:00:00.000Z'), refundedAt: new Date('2026-11-11T12:00:00.000Z'), status: 'reembolsado', amountCents: 4900 }),
    ]
    const expenses = [
      { occurredOn: new Date('2026-11-09T03:00:00.000Z'), amountCents: 2500 },
      { occurredOn: new Date('2026-11-15T20:00:00.000Z'), amountCents: 1000 },
    ]
    const { granularity, points } = buildSeries(week, { ...empty, payments, expenses }, now)
    const total = summarizeFinance(payments, 3500)
    const sum = (key: 'grossCents' | 'feeCents' | 'netCents' | 'refundCents' | 'expenseCents' | 'resultCents') => points.reduce((acc, point) => acc + point[key], 0)

    expect(granularity).toBe('day')
    expect(points).toHaveLength(7)
    expect(sum('grossCents')).toBe(total.grossCents)
    expect(sum('feeCents')).toBe(total.feeCents)
    expect(sum('netCents')).toBe(total.netCents)
    expect(sum('refundCents')).toBe(total.refundCents)
    expect(sum('expenseCents')).toBe(total.expenseCents)
    expect(sum('resultCents')).toBe(total.resultCents)
    expect(points[2]).toMatchObject({ grossCents: 4900, refundCents: 4900, netCents: 0 })
  })

  it('taxa ausente não vira zero inventado no líquido', () => {
    const { points } = buildSeries(range, {
      ...empty,
      payments: [payment({ paidAt: new Date('2026-11-15T14:40:00.000Z'), feeCents: null, netCents: null, feeSource: 'nao_informada' })],
    }, now)
    expect(points[11]).toMatchObject({ grossCents: 9900, feeCents: 0, netCents: 0 })
  })
})
