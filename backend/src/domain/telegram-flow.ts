import { downsellStepFromCallback } from './downsell'

export type BotEffect =
  | { type: 'send_presentation' }
  | { type: 'send_pitch' }
  | { type: 'open_checkout' }
  | { type: 'send_existing_access' }
  | { type: 'check_status' }
  | { type: 'resend_access' }
  | { type: 'send_support' }
  | { type: 'cancel_flow' }
  | { type: 'copy_pix' }
  | { type: 'open_downsell'; stepId: string }

const PITCH =
  'Olá! Seja muito bem-vindo!\n\nPreparamos um conteúdo exclusivo para você.\n\nAssista à apresentação e descubra tudo o que está esperando por você.\n\nQuando estiver pronto, clique no botão abaixo para garantir seu acesso.'

function command(text: string): string {
  return text.trim().split(/\s+/)[0].split('@')[0].toLowerCase()
}

export function reduceTelegram(input: {
  text: string
  callback: string | null
  hasPaidAccess: boolean
  hasWaitingCharge: boolean
}): { effects: BotEffect[]; reply: string } {
  if (input.callback === 'buy') return { effects: [{ type: 'open_checkout' }], reply: '' }
  if (input.callback === 'paid') return { effects: [{ type: 'check_status' }], reply: '' }
  if (input.callback === 'copy') return { effects: [{ type: 'copy_pix' }], reply: '' }
  if (input.callback === 'access') return { effects: [{ type: 'resend_access' }], reply: '' }
  const downsellStepId = downsellStepFromCallback(input.callback)
  if (downsellStepId) return { effects: [{ type: 'open_downsell', stepId: downsellStepId }], reply: '' }

  const cmd = command(input.text)
  if (cmd === '/start') {
    const effects: BotEffect[] = [{ type: 'send_presentation' }, { type: 'send_pitch' }]
    if (input.hasPaidAccess) effects.push({ type: 'send_existing_access' })
    return { effects, reply: PITCH }
  }
  if (cmd === '/comprar') return { effects: [{ type: 'open_checkout' }], reply: '' }
  if (cmd === '/status') return { effects: [{ type: 'check_status' }], reply: '' }
  if (cmd === '/meuacesso') {
    if (!input.hasPaidAccess) return { effects: [], reply: 'Você ainda não tem uma compra paga.' }
    return { effects: [{ type: 'resend_access' }], reply: '' }
  }
  if (cmd === '/suporte') return { effects: [{ type: 'send_support' }], reply: '' }
  if (cmd === '/cancelar') return { effects: [{ type: 'cancel_flow' }], reply: 'Fluxo de compra cancelado.' }
  return { effects: [], reply: 'Use /start para ver o conteúdo.' }
}

export { PITCH }
