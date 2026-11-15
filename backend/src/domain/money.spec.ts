import { centsFromKavroAmount, toKavroAmount } from './money'

describe('money', () => {
  it('formata centavos como string da KavroPay', () => {
    expect(toKavroAmount(14990)).toBe('149.90')
    expect(toKavroAmount(50)).toBe('0.50')
    expect(toKavroAmount(1000)).toBe('10.00')
  })

  it('lê string decimal e número da KavroPay em centavos', () => {
    expect(centsFromKavroAmount('149.90')).toBe(14990)
    expect(centsFromKavroAmount('10.00')).toBe(1000)
    expect(centsFromKavroAmount(10)).toBe(1000)
  })
})
