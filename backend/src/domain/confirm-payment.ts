import { centsFromKavroAmount, Cents } from './money'
import { verifyKavroSignature } from './kavro-signature'

export type Environment = 'live' | 'sandbox'
export type OrderStatus =
  | 'criado'
  | 'aguardando_pagamento'
  | 'pago'
  | 'expirado'
  | 'cancelado'
  | 'reembolsado'
  | 'em_analise'

export type ConfirmDecision =
  | { action: 'reject_signature' }
  | { action: 'duplicate' }
  | { action: 'reject_environment' }
  | { action: 'under_review' }
  | { action: 'mark_paid'; enqueueDelivery: true }
  | { action: 'mark_expired' }
  | { action: 'mark_refunded' }
  | { action: 'still_waiting' }
  | { action: 'noop' }

export function confirmPayment(input: {
  rawBody: string
  signatureHeader: string
  secret: string
  nowEpochSeconds: number
  deliveryId: string
  processedDeliveryIds: string[]
  expectedEnvironment: Environment
  eventEnvironment: Environment
  eventName: 'payment.paid' | 'payment.confirmed' | 'payment.expired' | 'payment.refunded' | 'other'
  orderStatus: OrderStatus
  orderAmountCents: Cents
  gatewayStatus: 'waiting_payment' | 'paid' | 'expired' | 'refunded' | 'other'
  gatewayAmount: string | number
  alreadyLiquidated: boolean
}): ConfirmDecision {
  if (!verifyKavroSignature(input.rawBody, input.signatureHeader, input.secret, input.nowEpochSeconds)) {
    return { action: 'reject_signature' }
  }
  if (input.processedDeliveryIds.includes(input.deliveryId)) return { action: 'duplicate' }
  if (input.eventEnvironment !== input.expectedEnvironment) return { action: 'reject_environment' }
  return decideFromGateway(input)
}

export function decideFromGateway(input: {
  eventName: 'payment.paid' | 'payment.confirmed' | 'payment.expired' | 'payment.refunded' | 'other'
  orderStatus: OrderStatus
  orderAmountCents: Cents
  gatewayStatus: 'waiting_payment' | 'paid' | 'expired' | 'refunded' | 'other'
  gatewayAmount: string | number
  alreadyLiquidated: boolean
}): ConfirmDecision {
  if (input.gatewayStatus === 'waiting_payment') return { action: 'still_waiting' }

  const gatewayCents = centsFromKavroAmount(input.gatewayAmount)
  const paidEvent = input.eventName === 'payment.paid' || input.eventName === 'payment.confirmed'
  if (paidEvent || input.gatewayStatus === 'paid') {
    if (gatewayCents !== input.orderAmountCents) return { action: 'under_review' }
    if (input.alreadyLiquidated || input.orderStatus === 'pago' || input.orderStatus === 'reembolsado') {
      return { action: 'noop' }
    }
    if (input.gatewayStatus === 'paid') return { action: 'mark_paid', enqueueDelivery: true }
  }
  if (input.eventName === 'payment.expired' && input.gatewayStatus === 'expired' && input.orderStatus === 'aguardando_pagamento') {
    return { action: 'mark_expired' }
  }
  if (input.eventName === 'payment.refunded' && input.gatewayStatus === 'refunded' && input.orderStatus === 'pago') {
    return { action: 'mark_refunded' }
  }
  return { action: 'noop' }
}
