import { canReprocess, nextDeliveryDelayMs } from './delivery'

describe('delivery', () => {
  it('espaça as tentativas e para na quinta falha', () => {
    expect(nextDeliveryDelayMs(1)).toBe(60_000)
    expect(nextDeliveryDelayMs(2)).toBe(300_000)
    expect(nextDeliveryDelayMs(3)).toBe(900_000)
    expect(nextDeliveryDelayMs(4)).toBe(3_600_000)
    expect(nextDeliveryDelayMs(5)).toBeNull()
  })

  it('só reprocessa pedido pago', () => {
    expect(canReprocess('pago')).toBe(true)
    expect(canReprocess('reembolsado')).toBe(false)
    expect(canReprocess('aguardando_pagamento')).toBe(false)
  })
})
