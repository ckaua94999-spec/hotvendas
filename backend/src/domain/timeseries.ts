import { bucketStarts, Granularity } from './calendar'
import { FinancePayment, summarizeFinance } from './finance'
import { Cents } from './money'

export type SeriesPayment = FinancePayment & { paidAt: Date | null; refundedAt: Date | null }

export type SeriesInput = {
  /** Primeiro acesso de cada usuário novo no período. */
  users: Date[]
  /** Criação de cada cobrança PIX no período. */
  pix: Date[]
  /** Confirmação de cada pagamento no período, reembolsado depois ou não. */
  paid: Date[]
  /** Os mesmos pagamentos que entram no resumo financeiro do período. */
  payments: SeriesPayment[]
  expenses: { occurredOn: Date; amountCents: Cents }[]
}

export type SeriesPoint = {
  start: string
  /** Intervalo que ainda não começou: o gráfico não desenha linha aqui. */
  future: boolean
  newUsers: number
  pix: number
  paid: number
  grossCents: Cents
  feeCents: Cents
  netCents: Cents
  refundCents: Cents
  expenseCents: Cents
  resultCents: Cents
}

function indexOf(starts: Date[], end: Date, date: Date): number {
  const time = date.getTime()
  if (starts.length === 0 || time < starts[0].getTime() || time >= end.getTime()) return -1
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (starts[middle].getTime() <= time) low = middle
    else high = middle - 1
  }
  return low
}

/**
 * Distribui o movimento do período em intervalos. Cada pagamento entra uma vez
 * só: no intervalo em que foi pago ou, se foi pago antes do período e
 * reembolsado dentro dele, no intervalo do reembolso. Assim a soma dos
 * intervalos bate com o resumo financeiro do mesmo período.
 */
export function buildSeries(range: { from: Date; to: Date }, input: SeriesInput, now: Date): { granularity: Granularity; points: SeriesPoint[] } {
  const { granularity, starts } = bucketStarts(range.from, range.to)
  const counts = starts.map(() => ({ newUsers: 0, pix: 0, paid: 0, expenseCents: 0, payments: [] as FinancePayment[] }))
  const at = (date: Date | null) => (date ? indexOf(starts, range.to, date) : -1)

  for (const date of input.users) { const index = at(date); if (index >= 0) counts[index].newUsers += 1 }
  for (const date of input.pix) { const index = at(date); if (index >= 0) counts[index].pix += 1 }
  for (const date of input.paid) { const index = at(date); if (index >= 0) counts[index].paid += 1 }
  for (const expense of input.expenses) { const index = at(expense.occurredOn); if (index >= 0) counts[index].expenseCents += expense.amountCents }
  for (const payment of input.payments) {
    const paidIndex = at(payment.paidAt)
    const index = paidIndex >= 0 ? paidIndex : at(payment.refundedAt)
    if (index >= 0) counts[index].payments.push(payment)
  }

  const points = starts.map((start, index) => {
    const bucket = counts[index]
    const finance = summarizeFinance(bucket.payments, bucket.expenseCents)
    return {
      start: start.toISOString(),
      future: start.getTime() > now.getTime(),
      newUsers: bucket.newUsers,
      pix: bucket.pix,
      paid: bucket.paid,
      grossCents: finance.grossCents,
      feeCents: finance.feeCents,
      netCents: finance.netCents,
      refundCents: finance.refundCents,
      expenseCents: finance.expenseCents,
      resultCents: finance.resultCents,
    }
  })
  return { granularity, points }
}
