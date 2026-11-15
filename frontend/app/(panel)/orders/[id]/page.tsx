'use client'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { ReactNode, useState } from 'react'
import { queryString, send, useApi } from '../../../../components/api'
import { Icon } from '../../../../components/icons'
import { Avatar, Badge, Copyable, ErrorState, Notice, PageLoading, Panel, Spinner, StatusBadge } from '../../../../components/kit'
import { AnimatedNumber, stagger } from '../../../../components/motion'
import { formatBRL, formatDateTime } from '../../../../lib/format'
import { deliveryStatus, eventStatus, orderStatus, reconcileResult, Tone } from '../../../../lib/status'

type Attempt = { id: string; status: string; error: string | null; createdAt: string }
type OrderDetail = {
  id: string
  status: string
  amountCents: number
  origin: string
  campaignCode: string
  createdAt: string
  user: { telegramId: string; username: string | null; firstName: string | null; lastName: string | null; blocked: boolean } | null
  product: { name: string } | null
  downsellStep?: { position: number; priceCents: number | null } | null
  payment: {
    gatewayChargeId: string | null
    status: string
    amountCents: number
    feeCents: number | null
    netCents: number | null
    feeSource: string
    environment: string
    pixCopyPaste: string | null
    qrCodeBase64: string | null
    expiresAt: string | null
    paidAt: string | null
    createdAt: string
    refund: { amountCents: number; refundedAt: string } | null
  } | null
  delivery: { status: string; attempts: number; lastError: string | null; completedAt: string | null; nextAttemptAt: string | null; attemptsLog: Attempt[] } | null
  events: { id: string; type: string; createdAt: string }[]
}

const DOT: Record<Tone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  serious: 'var(--serious)',
  bad: 'var(--bad)',
  info: 'var(--info)',
  neutral: 'var(--muted)',
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-[14px] font-medium">{children}</dd>
    </div>
  )
}

/** O que o painel mostra em "dados brutos": tudo, menos o segredo da cobrança e a imagem do QR. */
function redact(order: OrderDetail) {
  return JSON.stringify(order, (key, value) => {
    if (key === 'notificationSecret') return value ? '(oculto)' : value
    if (key === 'qrCodeBase64' && typeof value === 'string') return `(imagem, ${value.length} caracteres)`
    return value
  }, 2)
}

export default function OrderPage() {
  const params = useParams<{ id: string }>()
  const query = queryString(useSearchParams())
  const { data, error, reload } = useApi<OrderDetail>(`/api/orders/${params.id}`)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ text: string; tone: Tone } | null>(null)

  const back = (
    <Link href={`/orders?${query}`} className="reveal mb-5 inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink">
      <Icon name="arrow-left" size={15} />Pedidos
    </Link>
  )
  if (error) return <div>{back}<ErrorState message={error === 'Não encontrado.' ? 'Este pedido não existe.' : error} onRetry={reload} /></div>
  if (!data) return <PageLoading title="Pedido" />

  async function reconcile() {
    setBusy(true)
    const response = await send(`/api/orders/${params.id}/reconcile`, 'POST')
    const outcome = response.json ? reconcileResult(response.json.decision, response.json.error) : { text: 'A reconciliação não respondeu. Tente de novo em instantes.', tone: 'bad' as Tone }
    setResult(outcome)
    setBusy(false)
    reload()
  }

  const { user, payment, delivery } = data
  const name = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : ''
  const events = [...(data.events || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const qr = payment?.qrCodeBase64 ? (payment.qrCodeBase64.startsWith('data:') ? payment.qrCodeBase64 : `data:image/png;base64,${payment.qrCodeBase64}`) : null

  return (
    <div>
      {back}
      <header className="reveal mb-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow">Pedido</p>
            <StatusBadge status={orderStatus(data.status)} />
            {data.downsellStep && <Badge tone="info">Veio do downsell {data.downsellStep.position}</Badge>}
          </div>
          <h1 className="mt-2 font-sans text-[46px] font-semibold leading-none tracking-[-0.03em] md:text-[54px]"><AnimatedNumber value={data.amountCents} format={formatBRL} /></h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-2">
            <Copyable value={data.id} />
            <span className="text-muted">·</span>
            <span>Criado em {formatDateTime(data.createdAt)}</span>
            {data.product?.name && <><span className="text-muted">·</span><span>{data.product.name}</span></>}
          </p>
        </div>
        <button type="button" onClick={reconcile} disabled={busy} className="btn btn-primary">
          {busy ? <Spinner /> : <Icon name="refresh" size={15} />}
          {busy ? 'Consultando a KavroPay' : 'Reconciliar com a KavroPay'}
        </button>
      </header>

      {result && <div className="mb-4"><Notice tone={result.tone}>{result.text}</Notice></div>}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-4 self-start xl:col-span-7">
          <Panel index={1} title="Cobrança" subtitle="O que a KavroPay informou sobre este PIX">
            {!payment ? <p className="text-[13.5px] text-muted">Este pedido ainda não gerou cobrança.</p> : (
              <>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                  <Item label="Estado"><StatusBadge status={orderStatus(payment.status)} /></Item>
                  <Item label="Valor">{formatBRL(payment.amountCents)}</Item>
                  <Item label="Taxa">{payment.feeCents != null ? formatBRL(payment.feeCents) : payment.paidAt ? <span className="text-warn">não informada</span> : '—'}</Item>
                  <Item label="Líquido">{payment.netCents == null ? '—' : formatBRL(payment.netCents)}</Item>
                  <Item label="Ambiente">{payment.environment === 'live' ? 'Produção' : payment.environment === 'sandbox' ? 'Teste' : payment.environment}</Item>
                  <Item label="ID na KavroPay">{payment.gatewayChargeId ? <Copyable value={payment.gatewayChargeId} /> : '—'}</Item>
                  <Item label="Criada em">{formatDateTime(payment.createdAt)}</Item>
                  <Item label="Expira em">{formatDateTime(payment.expiresAt)}</Item>
                  <Item label="Paga em">{formatDateTime(payment.paidAt)}</Item>
                  {payment.refund && <Item label="Reembolso">{formatBRL(payment.refund.amountCents)} em {formatDateTime(payment.refund.refundedAt)}</Item>}
                </dl>
                {payment.pixCopyPaste && (
                  <details className="group mt-6 rounded-2xl border border-line">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink">
                      <Icon name="qr" size={15} />PIX copia e cola{qr ? ' e QR code' : ''}
                      <Icon name="chevron-down" size={15} className="ml-auto transition-transform duration-300 group-open:rotate-180" />
                    </summary>
                    <div className="anim-fade flex flex-wrap items-start gap-4 border-t border-line p-4">
                      {qr && <img src={qr} alt="QR code do PIX" className="h-36 w-36 flex-none rounded-xl bg-white p-2" />}
                      <p className="min-w-0 flex-1 break-all rounded-xl bg-[var(--neutral-soft)] p-3 font-mono text-[12px] text-ink-2">{payment.pixCopyPaste}</p>
                    </div>
                  </details>
                )}
              </>
            )}
          </Panel>

          <Panel index={2} title="Entrega" subtitle="O envio do conteúdo depois do pagamento confirmado">
            {!delivery ? <p className="text-[13.5px] text-muted">Sem entrega. Ela só nasce quando o pagamento é confirmado.</p> : (
              <>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                  <Item label="Estado"><StatusBadge status={deliveryStatus(delivery.status)} /></Item>
                  <Item label="Tentativas">{delivery.attempts}</Item>
                  <Item label="Concluída em">{formatDateTime(delivery.completedAt)}</Item>
                  <Item label="Próxima tentativa">{formatDateTime(delivery.nextAttemptAt)}</Item>
                </dl>
                {delivery.lastError && <div className="mt-5"><Notice tone="bad">Último erro: {delivery.lastError}</Notice></div>}
                {delivery.attemptsLog?.length > 0 && (
                  <ul className="mt-5 grid gap-2">
                    {[...delivery.attemptsLog].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((attempt, index) => (
                      <li key={attempt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--neutral-soft)] px-3.5 py-2.5 text-[13px]">
                        <span className="tnum font-semibold text-muted">{index + 1}</span>
                        <StatusBadge status={deliveryStatus(attempt.status)} />
                        <span className="text-ink-2">{formatDateTime(attempt.createdAt)}</span>
                        {attempt.error && <span className="w-full text-[12.5px] text-muted">{attempt.error}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
        </div>

        <div className="grid gap-4 self-start xl:col-span-5">
          <Panel index={3} title="Cliente">
            {!user ? <p className="text-[13.5px] text-muted">Sem dados do cliente.</p> : (
              <>
                <div className="flex items-center gap-3">
                  <Avatar name={name || user.username || '?'} seed={user.telegramId} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{name || '—'}</p>
                    <p className="truncate text-[13px] text-muted">{user.username ? `@${user.username}` : 'sem username'}</p>
                  </div>
                  {user.blocked && <Badge tone="bad">Bloqueou o bot</Badge>}
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
                  <Item label="Telegram ID"><Copyable value={user.telegramId} /></Item>
                  <Item label="Origem"><span className="chip"><Icon name="tag" size={12} />{data.origin}</span></Item>
                  <Item label="Campanha"><span className="font-mono text-[13px]">{data.campaignCode}</span></Item>
                </dl>
              </>
            )}
          </Panel>

          <Panel index={4} title="Linha do tempo" subtitle="Cada evento gravado para este pedido">
            {events.length === 0 ? <p className="text-[13.5px] text-muted">Nenhum evento gravado.</p> : (
              <ol className="relative grid gap-5 pl-6">
                <span className="absolute bottom-2 left-[5px] top-2 w-px bg-[var(--line-2)]" aria-hidden="true" />
                {events.map((event, index) => {
                  const view = eventStatus(event.type)
                  return (
                    <li key={event.id} className="reveal relative" style={stagger(index + 5)}>
                      <span className="absolute -left-6 top-1 h-[11px] w-[11px] rounded-full" style={{ background: DOT[view.tone], boxShadow: '0 0 0 3px var(--surface)' }} aria-hidden="true" />
                      <p className="text-[13.5px] font-semibold">{view.label}</p>
                      <p className="tnum mt-0.5 text-[12.5px] text-muted">{formatDateTime(event.createdAt)}</p>
                    </li>
                  )
                })}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <details className="reveal group mt-4 rounded-[20px] border border-line" style={stagger(6)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-4 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink">
          Dados brutos do pedido
          <Icon name="chevron-down" size={15} className="ml-auto transition-transform duration-300 group-open:rotate-180" />
        </summary>
        <pre className="anim-fade max-h-[420px] overflow-auto border-t border-line p-6 font-mono text-[12px] leading-relaxed text-ink-2">{redact(data)}</pre>
      </details>
    </div>
  )
}
