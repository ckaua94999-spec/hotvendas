import { OrderStatus } from './confirm-payment'

const DELAYS = [60_000, 300_000, 900_000, 3_600_000]

export function nextDeliveryDelayMs(failedAttempts: number): number | null {
  return DELAYS[failedAttempts - 1] ?? null
}

export function canReprocess(orderStatus: OrderStatus): boolean {
  return orderStatus === 'pago'
}
