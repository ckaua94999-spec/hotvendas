import type { Granularity } from './format'

// Formas que a API devolve. Dinheiro sempre em centavos.

export type Finance = { grossCents: number; feeCents: number; feesMissing: number; netCents: number; refundCents: number; expenseCents: number; resultCents: number }

export type Dashboard = {
  usersStarted: number
  uniqueUsers: number
  presentationSent: number
  purchaseClicks: number
  pixGenerated: number
  pixPending: number
  pixExpired: number
  paymentsApproved: number
  paymentsRefunded: number
  deliveriesCompleted: number
  deliveriesFailed: number
  conversionPercent: number
  finance: Finance
}

export type SeriesPoint = {
  start: string
  future: boolean
  newUsers: number
  pix: number
  paid: number
  grossCents: number
  feeCents: number
  netCents: number
  refundCents: number
  expenseCents: number
  resultCents: number
}

export type Series = {
  from: string
  to: string
  granularity: Granularity
  points: SeriesPoint[]
  expensesByCategory: { category: string; amountCents: number }[]
}

export type FunnelRow = { stage: string; label: string; users: number; percentOfStart: number; percentOfPrevious: number; dropped: number; dropPercent: number }
