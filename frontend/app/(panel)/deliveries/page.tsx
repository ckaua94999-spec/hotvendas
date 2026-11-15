'use client'
import Link from 'next/link'
import { useState } from 'react'
import { send, useApi } from '../../../components/api'
import { Icon } from '../../../components/icons'
import { EmptyState, ErrorState, PageHeader, PageLoading, Panel, Part, Segmented, Segments, Spinner, StatTile, StatusBadge, useToast } from '../../../components/kit'
import { formatInt, formatShortDateTime } from '../../../lib/format'
import { deliveryStatus } from '../../../lib/status'

type Attempt = { id: string; status: string; error: string | null; createdAt: string }
type Delivery = { id: string; orderId: string; status: string; attempts: number; lastError: string | null; completedAt: string | null; nextAttemptAt: string | null; attemptsLog?: Attempt[]; order: { user: { telegramId: string; username: string | null; firstName?: string | null; lastName?: string | null } } }

const STATUS_COLOR: Record<string, string> = { concluida: 'var(--st-good)', pendente: 'var(--st-warn)', falha: 'var(--st-critical)' }
const STATUS_ORDER = ['concluida', 'pendente', 'falha']

/** Uma marca por tentativa gravada: verde chegou, vermelha falhou. */
function Attempts({ delivery }: { delivery: Delivery }) {
  const log = [...(delivery.attemptsLog || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return (
    <div className="flex items-center gap-2">
      <span className="tnum w-4 font-semibold">{delivery.attempts}</span>
      <span className="flex gap-1">
        {log.slice(-8).map((attempt) => (
          <span
            key={attempt.id}
            title={`${deliveryStatus(attempt.status).label} em ${formatShortDateTime(attempt.createdAt)}${attempt.error ? `: ${attempt.error}` : ''}`}
            className="h-2 w-2 rounded-full"
            style={{ background: attempt.status === 'concluida' ? 'var(--st-good)' : 'var(--st-critical)' }}
          />
        ))}
      </span>
    </div>
  )
}

export default function DeliveriesPage() {
  const { data, error, reload } = useApi<Delivery[]>('/api/deliveries')
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState('todas')

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageLoading title="Entregas" />

  const count = (status: string) => data.filter((item) => item.status === status).length
  const statuses = [...STATUS_ORDER, ...[...new Set(data.map((item) => item.status))].filter((status) => !STATUS_ORDER.includes(status))]
  const parts: Part[] = statuses.map((status) => ({ key: status, label: deliveryStatus(status).label, value: count(status), color: STATUS_COLOR[status] || 'var(--st-neutral)' }))
  const active = filter !== 'todas' && statuses.includes(filter) ? filter : 'todas'
  const rows = active === 'todas' ? data : data.filter((item) => item.status === active)

  async function reprocess(id: string) {
    setBusy(id)
    const response = await send(`/api/deliveries/${id}/reprocess`, 'POST')
    if (response.ok) toast('ok', 'Entrega de volta na fila. O bot tenta enviar de novo agora.')
    else toast('bad', response.json?.error || (response.status === 403 ? 'Seu acesso não permite reprocessar.' : 'Não foi possível reprocessar.'))
    await reload()
    setBusy('')
  }

  return (
    <div>
      <PageHeader eyebrow="Vendas" title="Entregas" subtitle="O envio do conteúdo depois que a KavroPay confirma o pagamento. Depois de quatro falhas, a entrega para e espera um reprocesso." />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-7">
          <StatTile index={1} label="Total" icon="send" value={data.length} hint={data.length >= 200 ? 'As 200 mais recentes' : undefined} />
          <StatTile index={2} label="Concluídas" icon="check-circle" value={count('concluida')} />
          <StatTile index={3} label="Pendentes" icon="clock" value={count('pendente')} hint={count('pendente') > 0 ? 'Na fila ou aguardando nova tentativa' : undefined} />
          <StatTile index={4} strong={count('falha') > 0} label="Falhas" icon="alert" value={count('falha')} hint={count('falha') > 0 ? 'Esperando reprocesso' : undefined} hintTone="bad" />
        </div>
        <Panel index={5} className="xl:col-span-5" title="Entregas por estado">
          {data.length === 0 ? <p className="text-[13.5px] text-muted">0 entregas.</p> : <Segments parts={parts} />}
        </Panel>
      </div>

      <Panel index={6} className="mt-4" title="Fila" subtitle={`${formatInt(rows.length)} ${rows.length === 1 ? 'entrega' : 'entregas'}`} flush>
        {data.length > 0 && (
          <div className="no-scrollbar overflow-x-auto px-5 pt-4 md:px-6">
            <Segmented label="Filtrar por estado" value={active} onChange={setFilter} options={[{ value: 'todas', label: 'Todas', count: data.length }, ...statuses.map((status) => ({ value: status, label: deliveryStatus(status).label, count: count(status) }))]} />
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState icon="send" title="0 entregas" text={data.length === 0 ? 'A primeira entrega nasce junto com o primeiro pagamento confirmado.' : 'Nenhuma entrega neste estado.'} />
        ) : (
          <div className="max-h-[70vh] overflow-auto pb-2 pt-3">
            <table className="tbl">
              <thead>
                <tr><th>Cliente</th><th>Estado</th><th>Tentativas</th><th>Erro</th><th>Concluída em</th><th><span className="sr-only">Ações</span></th></tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const user = item.order.user
                  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
                  return (
                    <tr key={item.id}>
                      <td>
                        <p className="font-medium">{name || (user.username ? `@${user.username}` : user.telegramId)}</p>
                        <p className="font-mono text-[12px] text-muted">{user.telegramId}</p>
                      </td>
                      <td><StatusBadge status={deliveryStatus(item.status)} /></td>
                      <td><Attempts delivery={item} /></td>
                      <td className="max-w-[320px] text-ink-2">{item.lastError ? <span className="line-clamp-2" title={item.lastError}>{item.lastError}</span> : '—'}</td>
                      <td className="whitespace-nowrap text-ink-2">{formatShortDateTime(item.completedAt)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {item.orderId && <Link href={`/orders/${item.orderId}`} className="btn btn-ghost btn-sm">Pedido</Link>}
                          <button type="button" onClick={() => reprocess(item.id)} disabled={busy !== ''} className={`btn btn-sm ${item.status === 'falha' ? 'btn-primary' : 'btn-soft'}`}>
                            {busy === item.id ? <Spinner size={13} /> : <Icon name="refresh" size={13} />}
                            Reprocessar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
