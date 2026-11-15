import { customerName, parseStartPayload } from './attribution'

describe('attribution', () => {
  it('aceita o código da campanha', () => {
    expect(parseStartPayload('campanha01')).toEqual({ origin: 'campanha01', campaignCode: 'campanha01' })
  })

  it('payload inválido ou vazio vira direto', () => {
    expect(parseStartPayload('instagram ads').origin).toBe('direto')
    expect(parseStartPayload(undefined).origin).toBe('direto')
    expect(parseStartPayload('').campaignCode).toBe('direto')
  })

  it('monta o nome enviado à KavroPay', () => {
    expect(customerName()).toBe('Cliente Telegram')
    expect(customerName('Ana', 'Souza')).toBe('Ana Souza')
  })
})
