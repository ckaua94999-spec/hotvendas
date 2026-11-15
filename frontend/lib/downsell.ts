// Regras de tela do fluxo de downsell: unidades de espera, rascunho do formulário e prévia da mensagem.
// Sem importações, para os testes rodarem direto no Node.

export type DelayUnit = 'min' | 'h' | 'd'

export const UNIT_MINUTES: Record<DelayUnit, number> = { min: 1, h: 60, d: 1440 }
export const UNIT_LABEL: Record<DelayUnit, string> = { min: 'minutos', h: 'horas', d: 'dias' }
export const UNIT_SINGULAR: Record<DelayUnit, string> = { min: 'minuto', h: 'hora', d: 'dia' }

/** Nome da unidade concordando com a quantidade digitada: "1 hora", "2 horas". */
export function unitName(amount: string, unit: DelayUnit): string {
  return Number(amount.trim().replace(',', '.')) === 1 ? UNIT_SINGULAR[unit] : UNIT_LABEL[unit]
}

/** O mesmo teto do backend. */
export const MAX_STEPS = 10
export const MAX_DELAY_MINUTES = 60 * 24 * 30
export const MAX_MESSAGE = 3500

export type DownsellStepView = { id: string; position: number; delayMinutes: number; message: string; priceCents: number | null; active: boolean; sent: number; orders: number; paid: number; paidCents: number }
export type DownsellView = { enabled: boolean; productPriceCents: number | null; steps: DownsellStepView[] }

/** Um passo enquanto é editado: os números ficam como texto, do jeito que a pessoa digitou. */
export type DraftStep = { key: string; id?: string; amount: string; unit: DelayUnit; message: string; price: string; active: boolean }
export type Draft = { enabled: boolean; steps: DraftStep[] }
export type StepErrors = { delay?: string; message?: string; price?: string }

export const SAMPLE_MESSAGE = 'Oi {nome}! Vi que você gerou o PIX e não concluiu.\n\nLiberei um valor especial para você fechar agora: de {preco_cheio} por {preco}.'

function reais(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/ /g, ' ')
}

/** "67", "67,90" ou "1.234,56" viram centavos. Vazio vira null; texto que não é número vira NaN. */
export function centsFromText(text: string): number | null {
  const clean = text.trim()
  if (!clean) return null
  const value = Number(clean.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(value) ? Math.round(value * 100) : NaN
}

export function textFromCents(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}

/** Guarda a espera na maior unidade que fecha a conta: 1440 min aparece como 1 dia, 90 min como 90 minutos. */
export function splitDelay(minutes: number): { amount: string; unit: DelayUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: String(minutes / 1440), unit: 'd' }
  if (minutes > 0 && minutes % 60 === 0) return { amount: String(minutes / 60), unit: 'h' }
  return { amount: String(minutes), unit: 'min' }
}

/** Espera em minutos. Texto vazio ou quebrado vira NaN, para a validação apontar. */
export function delayMinutes(amount: string, unit: DelayUnit): number {
  const value = Number(amount.trim().replace(',', '.'))
  if (!amount.trim() || !Number.isFinite(value)) return NaN
  return value * UNIT_MINUTES[unit]
}

/** Espera por extenso e curta: "15 min", "2 h", "1 h 30 min", "1 dia", "3 dias". */
export function delayLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 dia' : `${minutes / 1440} dias`
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

let counter = 0
function nextKey() {
  counter += 1
  return `novo-${counter}`
}

export function newStep(first: boolean): DraftStep {
  return { key: nextKey(), amount: first ? '15' : '1', unit: first ? 'min' : 'h', message: first ? SAMPLE_MESSAGE : '', price: '', active: true }
}

export function draftFromView(view: DownsellView): Draft {
  return {
    enabled: view.enabled,
    steps: view.steps.map((step) => ({ key: step.id, id: step.id, ...splitDelay(step.delayMinutes), message: step.message, price: textFromCents(step.priceCents), active: step.active })),
  }
}

/** O que vai para a API: a ordem da lista é a ordem do fluxo. */
export function payloadFromDraft(draft: Draft) {
  return {
    enabled: draft.enabled,
    steps: draft.steps.map((step) => ({ id: step.id, delayMinutes: delayMinutes(step.amount, step.unit), message: step.message.trim(), priceCents: centsFromText(step.price), active: step.active })),
  }
}

/** Assinatura do rascunho para saber se há algo não salvo. */
export function draftSignature(draft: Draft): string {
  return JSON.stringify(payloadFromDraft(draft))
}

/** Um conjunto de erros por passo, na mesma ordem. Passo sem erro devolve objeto vazio. */
export function draftErrors(draft: Draft): StepErrors[] {
  return draft.steps.map((step) => {
    const errors: StepErrors = {}
    const minutes = delayMinutes(step.amount, step.unit)
    if (!Number.isInteger(minutes) || minutes < 1) errors.delay = 'Informe uma espera de pelo menos 1 minuto, em número inteiro.'
    else if (minutes > MAX_DELAY_MINUTES) errors.delay = 'A espera vai até 30 dias.'
    if (!step.message.trim()) errors.message = 'Escreva a mensagem.'
    else if (step.message.trim().length > MAX_MESSAGE) errors.message = `A mensagem passa de ${MAX_MESSAGE} caracteres.`
    const price = centsFromText(step.price)
    if (price !== null && (!Number.isInteger(price) || price < 1)) errors.price = 'Informe um valor maior que zero, como 67,00. Deixe em branco para manter o preço do produto.'
    return errors
  })
}

export function hasErrors(errors: StepErrors[]): boolean {
  return errors.some((item) => Object.keys(item).length > 0)
}

/** O texto como a pessoa recebe, com um nome de exemplo. Preço que ainda não dá para saber aparece como "R$ —". */
export function previewText(message: string, input: { priceCents: number | null; productPriceCents: number | null; name?: string }): string {
  const full = input.productPriceCents == null ? 'R$ —' : reais(input.productPriceCents)
  const price = input.priceCents != null && Number.isFinite(input.priceCents) ? reais(input.priceCents) : full
  return message.replace(/\{(nome|preco_cheio|preco)\}/g, (_match, key: string) => (key === 'nome' ? input.name ?? 'Ana' : key === 'preco' ? price : full))
}

export function buttonLabel(priceCents: number | null): string {
  return priceCents != null && Number.isFinite(priceCents) && priceCents > 0 ? `QUERO POR ${reais(priceCents)}` : 'QUERO COMPRAR AGORA'
}

/** O que dizer ao lado do preço: quanto é o desconto, ou por que aquilo não é um. */
export function discountHint(priceCents: number | null, productPriceCents: number | null): { text: string; tone: 'ok' | 'warn' | 'neutral' } {
  if (productPriceCents == null) return { text: 'Sem produto ativo. Cadastre o produto em Configurações para o fluxo funcionar.', tone: 'warn' }
  if (priceCents == null) return { text: `Em branco, o botão cobra o preço do produto: ${reais(productPriceCents)}.`, tone: 'neutral' }
  if (!Number.isFinite(priceCents) || priceCents < 1) return { text: '', tone: 'neutral' }
  if (priceCents >= productPriceCents) return { text: `Não é desconto: o produto custa ${reais(productPriceCents)}.`, tone: 'warn' }
  const off = Math.round((1 - priceCents / productPriceCents) * 100)
  return { text: `${off}% abaixo do preço do produto, ${reais(productPriceCents)}.`, tone: 'ok' }
}
