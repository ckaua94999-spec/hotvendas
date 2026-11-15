import { summarizeFinance } from '../domain/finance'
import { emptyFinanceSummary } from './finance-report'

describe('emptyFinanceSummary', () => {
  it('painel sem movimento mostra zero', () => {
    expect(emptyFinanceSummary()).toEqual(summarizeFinance([], 0))
  })
})
