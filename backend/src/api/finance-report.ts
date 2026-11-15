import { summarizeFinance } from '../domain/finance'

export function emptyFinanceSummary() {
  return summarizeFinance([], 0)
}
