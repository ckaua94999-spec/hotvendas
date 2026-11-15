import { Cents } from './money'

/** O que o fluxo precisa saber de um passo para decidir se está na hora. */
export type DownsellRule = { id: string; position: number; delayMinutes: number; active: boolean }

/** Um passo como chega da tela de configuração. */
export type DownsellInput = { id?: string; delayMinutes: number; message: string; priceCents: Cents | null; active: boolean }

export const DOWNSELL_MAX_STEPS = 10
export const DOWNSELL_MAX_DELAY_MINUTES = 60 * 24 * 30
/** O Telegram corta mensagens acima de 4096 caracteres; a folga cobre nome e preços. */
export const DOWNSELL_MAX_MESSAGE = 3500

/**
 * Próximo passo do fluxo que já venceu para uma pessoa, ou null.
 *
 * O fluxo vale para quem gerou PIX e não pagou. A espera do primeiro passo
 * conta do PIX mais recente; a dos seguintes, do último downsell recebido.
 * Se a pessoa gerar outro PIX no meio do caminho, a espera recomeça dele:
 * ninguém recebe oferta mais barata enquanto ainda está tentando pagar.
 * Cada passo chega no máximo uma vez, e tudo para quando a pessoa paga
 * ou bloqueia o bot.
 */
export function downsellDue(input: {
  enabled: boolean
  /** Já pagou, foi reembolsada ou tem pagamento em análise. */
  settled: boolean
  blocked: boolean
  /** Quando gerou o PIX mais recente ainda não pago. */
  pixGeneratedAt: Date | null
  steps: DownsellRule[]
  sent: { stepId: string; sentAt: Date }[]
  now: Date
}): DownsellRule | null {
  if (!input.enabled || input.settled || input.blocked || !input.pixGeneratedAt) return null
  const received = new Set(input.sent.map((item) => item.stepId))
  const next = input.steps
    .filter((step) => step.active)
    .sort((a, b) => a.position - b.position)
    .find((step) => !received.has(step.id))
  if (!next) return null
  let reference = input.pixGeneratedAt
  for (const item of input.sent) if (item.sentAt > reference) reference = item.sentAt
  const elapsedMinutes = (input.now.getTime() - reference.getTime()) / 60000
  return elapsedMinutes >= next.delayMinutes ? next : null
}

/**
 * Confere o fluxo que veio da tela. Devolve os passos limpos, na ordem em que
 * chegaram, ou a primeira coisa errada, dita de um jeito que dá para corrigir.
 */
export function validateDownsell(raw: unknown): { ok: true; steps: DownsellInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'O fluxo precisa ser uma lista de passos.' }
  if (raw.length > DOWNSELL_MAX_STEPS) return { ok: false, error: `O fluxo aceita até ${DOWNSELL_MAX_STEPS} downsells.` }
  const steps: DownsellInput[] = []
  for (const [index, item] of raw.entries()) {
    const name = `Downsell ${index + 1}`
    const step = (item ?? {}) as Record<string, unknown>
    const delayMinutes = Number(step.delayMinutes)
    if (!Number.isInteger(delayMinutes) || delayMinutes < 1) return { ok: false, error: `${name}: a espera precisa ser de pelo menos 1 minuto.` }
    if (delayMinutes > DOWNSELL_MAX_DELAY_MINUTES) return { ok: false, error: `${name}: a espera vai até 30 dias.` }
    const message = typeof step.message === 'string' ? step.message.trim() : ''
    if (!message) return { ok: false, error: `${name}: escreva a mensagem.` }
    if (message.length > DOWNSELL_MAX_MESSAGE) return { ok: false, error: `${name}: a mensagem passa de ${DOWNSELL_MAX_MESSAGE} caracteres.` }
    let priceCents: Cents | null = null
    if (step.priceCents !== null && step.priceCents !== undefined && step.priceCents !== '') {
      priceCents = Number(step.priceCents)
      if (!Number.isInteger(priceCents) || priceCents < 1) return { ok: false, error: `${name}: o preço precisa ser maior que zero. Deixe em branco para manter o preço do produto.` }
    }
    steps.push({ id: typeof step.id === 'string' && step.id ? step.id : undefined, delayMinutes, message, priceCents, active: step.active !== false })
  }
  return { ok: true, steps }
}

export function formatReais(cents: Cents): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/ /g, ' ')
}

/**
 * Monta o texto que a pessoa recebe. {nome} vira o primeiro nome, {preco} o
 * preço deste downsell e {preco_cheio} o preço normal do produto.
 */
export function renderDownsell(template: string, input: { firstName: string | null; priceCents: Cents; fullPriceCents: Cents }): string {
  const name = (input.firstName || '').trim()
  const text = template.replace(/\{(nome|preco_cheio|preco)\}/g, (_match, key: string) => {
    if (key === 'nome') return name
    return formatReais(key === 'preco' ? input.priceCents : input.fullPriceCents)
  })
  // Sem nome, "Oi {nome}, tudo bem?" não pode virar "Oi , tudo bem?".
  return name ? text : text.replace(/[ \t]+([,.!?])/g, '$1')
}

/** O botão que vai junto da mensagem. O clique abre o PIX já com o preço do passo. */
export function downsellButton(step: { id: string; priceCents: Cents | null }): { text: string; callback_data: string } {
  return { text: step.priceCents == null ? 'QUERO COMPRAR AGORA' : `QUERO POR ${formatReais(step.priceCents)}`, callback_data: `ds:${step.id}` }
}

/** Lê o clique de um botão de downsell. Devolve o id do passo ou null se o clique é de outra coisa. */
export function downsellStepFromCallback(callback: string | null): string | null {
  return callback && callback.startsWith('ds:') && callback.length > 3 ? callback.slice(3) : null
}
