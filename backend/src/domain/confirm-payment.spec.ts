import { createHmac } from 'crypto'
import { confirmPayment } from './confirm-payment'

const SECRET = 'whsec_test'
const BODY = '{"event":"payment.paid"}'

function signed(now = 1700000000) {
  const hex = createHmac('sha256', SECRET).update(`${now}.${BODY}`).digest('hex')
  return `t=${now},v1=${hex}`
}

function base(over: Record<string, unknown> = {}) {
  return {
    rawBody: BODY,
    signatureHeader: signed(),
    secret: SECRET,
    nowEpochSeconds: 1700000000,
    deliveryId: 'del_1',
    processedDeliveryIds: [] as string[],
    expectedEnvironment: 'live' as const,
    eventEnvironment: 'live' as const,
    eventName: 'payment.paid' as const,
    orderStatus: 'aguardando_pagamento' as const,
    orderAmountCents: 1000,
    gatewayStatus: 'paid' as const,
    gatewayAmount: '10.00',
    alreadyLiquidated: false,
    ...over,
  }
}

describe('confirmPayment', () => {
  it('rejeita assinatura inválida', () => {
    expect(confirmPayment(base({ signatureHeader: 't=1700000000,v1=00' })).action).toBe('reject_signature')
  })

  it('não reliquida o mesmo delivery id', () => {
    expect(confirmPayment(base({ processedDeliveryIds: ['del_1'] })).action).toBe('duplicate')
  })

  it('não liquida sandbox com chave live', () => {
    expect(confirmPayment(base({ eventEnvironment: 'sandbox' })).action).toBe('reject_environment')
  })

  it('manda para análise quando o valor diverge', () => {
    expect(confirmPayment(base({ gatewayAmount: '10.01' })).action).toBe('under_review')
  })

  it('marca pago quando a releitura confirma o valor', () => {
    expect(confirmPayment(base())).toEqual({ action: 'mark_paid', enqueueDelivery: true })
  })

  it('ignora payment.confirmed depois de liquidado', () => {
    expect(
      confirmPayment(base({ eventName: 'payment.confirmed', alreadyLiquidated: true, orderStatus: 'pago' })).action,
    ).toBe('noop')
  })

  it('expira pedido que ainda aguarda', () => {
    expect(
      confirmPayment(base({ eventName: 'payment.expired', gatewayStatus: 'expired' })).action,
    ).toBe('mark_expired')
  })

  it('reembolsa pedido pago', () => {
    expect(
      confirmPayment(base({ eventName: 'payment.refunded', gatewayStatus: 'refunded', orderStatus: 'pago' })).action,
    ).toBe('mark_refunded')
  })

  it('consulta waiting_payment sem entregar', () => {
    expect(confirmPayment(base({ gatewayStatus: 'waiting_payment' })).action).toBe('still_waiting')
  })

  it('não entrega se o evento diz pago e a releitura ainda espera', () => {
    expect(
      confirmPayment(base({ eventName: 'payment.paid', gatewayStatus: 'waiting_payment' })).action,
    ).toBe('still_waiting')
  })
})
