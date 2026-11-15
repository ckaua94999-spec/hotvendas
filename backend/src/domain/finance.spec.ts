import { summarizeFinance } from './finance'

describe('summarizeFinance', () => {
  it('separa bruto, taxa, líquido atual, reembolso e despesa', () => {
    const summary = summarizeFinance(
      [
        { amountCents: 10000, feeCents: 100, netCents: 9900, feeSource: 'gateway', status: 'pago' },
        { amountCents: 5000, feeCents: 50, netCents: 4950, feeSource: 'gateway', status: 'reembolsado' },
      ],
      1000,
    )
    expect(summary).toEqual({
      grossCents: 15000,
      feeCents: 150,
      feesMissing: 0,
      netCents: 9900,
      refundCents: 5000,
      expenseCents: 1000,
      resultCents: 8900,
    })
  })

  it('não trata taxa ausente como zero no resultado', () => {
    const summary = summarizeFinance(
      [{ amountCents: 8000, feeCents: null, netCents: null, feeSource: 'nao_informada', status: 'pago' }],
      0,
    )
    expect(summary.feesMissing).toBe(1)
    expect(summary.feeCents).toBe(0)
    expect(summary.netCents).toBe(0)
    expect(summary.grossCents).toBe(8000)
    expect(summary.resultCents).toBe(0)
  })

  it('lista vazia devolve zero', () => {
    expect(summarizeFinance([], 0)).toEqual({
      grossCents: 0,
      feeCents: 0,
      feesMissing: 0,
      netCents: 0,
      refundCents: 0,
      expenseCents: 0,
      resultCents: 0,
    })
  })
})
