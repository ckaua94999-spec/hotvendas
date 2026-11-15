import { Cents } from './money'

export type FeeSource = 'gateway' | 'nao_informada'
export type FinancePayment = {
  amountCents: Cents
  feeCents: Cents | null
  netCents: Cents | null
  feeSource: FeeSource
  status: 'pago' | 'reembolsado'
}

export function summarizeFinance(payments: FinancePayment[], expenseCents: Cents) {
  let grossCents = 0
  let feeCents = 0
  let feesMissing = 0
  let netCents = 0
  let refundCents = 0
  for (const payment of payments) {
    grossCents += payment.amountCents
    if (payment.feeSource === 'gateway' && payment.feeCents != null) feeCents += payment.feeCents
    if (payment.feeCents == null) feesMissing += 1
    if (payment.status === 'pago' && payment.netCents != null) netCents += payment.netCents
    if (payment.status === 'reembolsado') refundCents += payment.amountCents
  }
  return {
    grossCents,
    feeCents,
    feesMissing,
    netCents,
    refundCents,
    expenseCents,
    resultCents: netCents - expenseCents,
  }
}
