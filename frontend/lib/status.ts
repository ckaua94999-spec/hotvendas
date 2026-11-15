// Nome que a operação lê e o tom de cada estado gravado pelo backend.
// Estado que não está na lista aparece com o próprio nome, em tom neutro.

export type Tone = 'ok' | 'warn' | 'serious' | 'bad' | 'info' | 'neutral'
export type StatusView = { label: string; tone: Tone; live?: boolean }

function humanize(value: string) {
  const text = (value || '').replace(/_/g, ' ').trim()
  return text ? text[0].toUpperCase() + text.slice(1) : '—'
}

function lookup(map: Record<string, StatusView>, value: string | null | undefined): StatusView {
  return map[value || ''] || { label: humanize(value || ''), tone: 'neutral' }
}

const ORDER: Record<string, StatusView> = {
  criado: { label: 'Criado', tone: 'neutral' },
  aguardando_pagamento: { label: 'Aguardando pagamento', tone: 'warn', live: true },
  pago: { label: 'Pago', tone: 'ok' },
  expirado: { label: 'Expirado', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
  reembolsado: { label: 'Reembolsado', tone: 'bad' },
  em_analise: { label: 'Em análise', tone: 'serious', live: true },
}

const DELIVERY: Record<string, StatusView> = {
  pendente: { label: 'Pendente', tone: 'warn', live: true },
  concluida: { label: 'Concluída', tone: 'ok' },
  falha: { label: 'Falha', tone: 'bad' },
  sem_entrega: { label: 'Sem entrega', tone: 'neutral' },
}

const STAGE: Record<string, StatusView> = {
  nenhuma: { label: 'Nenhuma', tone: 'neutral' },
  bot_started: { label: 'Iniciou o bot', tone: 'neutral' },
  presentation_sent: { label: 'Apresentação enviada', tone: 'neutral' },
  purchase_clicked: { label: 'Clicou em comprar', tone: 'info' },
  pix_generated: { label: 'Gerou PIX', tone: 'warn' },
  payment_approved: { label: 'Pagou', tone: 'ok' },
  delivery_completed: { label: 'Recebeu o conteúdo', tone: 'ok' },
}

export const STAGE_ORDER = ['bot_started', 'presentation_sent', 'purchase_clicked', 'pix_generated', 'payment_approved', 'delivery_completed']

const EVENT: Record<string, StatusView> = {
  bot_started: { label: 'Iniciou o bot', tone: 'neutral' },
  presentation_sent: { label: 'Apresentação enviada', tone: 'neutral' },
  purchase_clicked: { label: 'Clicou em comprar', tone: 'info' },
  pix_generated: { label: 'PIX gerado', tone: 'info' },
  payment_pending: { label: 'Aguardando pagamento', tone: 'warn' },
  payment_approved: { label: 'Pagamento aprovado', tone: 'ok' },
  payment_expired: { label: 'PIX expirou', tone: 'neutral' },
  payment_refunded: { label: 'Pagamento reembolsado', tone: 'bad' },
  delivery_started: { label: 'Entrega iniciada', tone: 'info' },
  delivery_completed: { label: 'Conteúdo entregue', tone: 'ok' },
  delivery_failed: { label: 'Falha na entrega', tone: 'bad' },
  recovery_sent: { label: 'Mensagem de recuperação enviada', tone: 'info' },
  downsell_sent: { label: 'Downsell enviado', tone: 'info' },
  downsell_clicked: { label: 'Clicou no botão do downsell', tone: 'info' },
}

const RECOVERY_STAGE: Record<string, string> = {
  no_pix: 'Sem PIX',
  pix_unpaid: 'PIX em aberto',
  pix_expired: 'PIX expirado',
}

const RECONCILE: Record<string, { text: string; tone: Tone }> = {
  mark_paid: { text: 'A KavroPay confirmou o pagamento. O pedido foi marcado como pago e a entrega entrou na fila.', tone: 'ok' },
  mark_expired: { text: 'A cobrança expirou na KavroPay. O pedido foi marcado como expirado.', tone: 'neutral' },
  mark_refunded: { text: 'A KavroPay registrou o reembolso. O pedido foi marcado como reembolsado.', tone: 'bad' },
  still_waiting: { text: 'A KavroPay ainda aguarda o pagamento. Nada mudou.', tone: 'warn' },
  under_review: { text: 'O valor pago não bate com o do pedido. O pedido ficou em análise e nada foi entregue.', tone: 'serious' },
  noop: { text: 'O pedido já está igual à KavroPay. Nada mudou.', tone: 'neutral' },
}

export const orderStatus = (value: string | null | undefined) => lookup(ORDER, value)
export const deliveryStatus = (value: string | null | undefined) => lookup(DELIVERY, value)
export const stageStatus = (value: string | null | undefined) => lookup(STAGE, value)
export const eventStatus = (value: string | null | undefined) => lookup(EVENT, value)
export const recoveryStage = (value: string) => RECOVERY_STAGE[value] || humanize(value)
export const reconcileResult = (decision: string | undefined, error: string | undefined) =>
  error ? { text: error, tone: 'bad' as Tone } : RECONCILE[decision || ''] || { text: decision ? humanize(decision) : 'Reconciliação feita.', tone: 'neutral' as Tone }

export const CATEGORY_LABEL: Record<string, string> = {
  hospedagem: 'Hospedagem',
  vps: 'VPS',
  ferramentas: 'Ferramentas',
  servicos: 'Serviços',
  marketing: 'Marketing',
  outras: 'Outras',
}
export const EXPENSE_CATEGORIES = Object.keys(CATEGORY_LABEL)
