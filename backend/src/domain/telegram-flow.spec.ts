import { reduceTelegram } from './telegram-flow'

describe('reduceTelegram', () => {
  it('apresenta o produto em /start sem compra paga', () => {
    const result = reduceTelegram({ text: '/start', callback: null, hasPaidAccess: false, hasWaitingCharge: false })
    expect(result.effects.map((effect) => effect.type)).toEqual(['send_presentation', 'send_pitch'])
    expect(result.reply).toContain('Seja muito bem-vindo')
  })

  it('oferece o acesso em /start de quem já pagou', () => {
    const result = reduceTelegram({ text: '/start campanha01', callback: null, hasPaidAccess: true, hasWaitingCharge: false })
    expect(result.effects.map((effect) => effect.type)).toContain('send_existing_access')
  })

  it('mapeia compra, consulta, cópia, acesso, suporte e cancelamento', () => {
    expect(reduceTelegram({ text: '', callback: 'buy', hasPaidAccess: false, hasWaitingCharge: false }).effects[0].type).toBe('open_checkout')
    expect(reduceTelegram({ text: '', callback: 'paid', hasPaidAccess: false, hasWaitingCharge: true }).effects[0].type).toBe('check_status')
    expect(reduceTelegram({ text: '', callback: 'copy', hasPaidAccess: false, hasWaitingCharge: true }).effects[0].type).toBe('copy_pix')
    expect(reduceTelegram({ text: '/comprar', callback: null, hasPaidAccess: false, hasWaitingCharge: false }).effects[0].type).toBe('open_checkout')
    expect(reduceTelegram({ text: '/status', callback: null, hasPaidAccess: false, hasWaitingCharge: true }).effects[0].type).toBe('check_status')
    const denied = reduceTelegram({ text: '/meuacesso', callback: null, hasPaidAccess: false, hasWaitingCharge: false })
    expect(denied.reply).toContain('não tem uma compra paga')
    expect(reduceTelegram({ text: '/meuacesso', callback: null, hasPaidAccess: true, hasWaitingCharge: false }).effects[0].type).toBe('resend_access')
    expect(reduceTelegram({ text: '/suporte', callback: null, hasPaidAccess: false, hasWaitingCharge: false }).effects[0].type).toBe('send_support')
    expect(reduceTelegram({ text: '/cancelar', callback: null, hasPaidAccess: false, hasWaitingCharge: false }).effects[0].type).toBe('cancel_flow')
  })

  it('abre o checkout do passo quando o clique vem de um botão de downsell', () => {
    const result = reduceTelegram({ text: '', callback: 'ds:cm3passo', hasPaidAccess: false, hasWaitingCharge: true })
    expect(result.effects).toEqual([{ type: 'open_downsell', stepId: 'cm3passo' }])
  })
})
