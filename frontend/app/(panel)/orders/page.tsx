'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { queryString, useApi } from '../../../components/api'
import { Icon } from '../../../components/icons'
import { EmptyState, ErrorState, PageHeader, PageLoading, Panel, Part, Segmented, Segments, StatTile, StatusBadge } from '../../../components/kit'
import { formatBRL, formatInt, formatShortDateTime } from '../../../lib/format'
import { periodLabel } from '../../../lib/period'
import { deliveryStatus, orderStatus } from '../../../lib/status'

type Order = { id: string; status: string; amountCents: number; createdAt: string; origin: string; user: { telegramId: string; username: string | null; firstName?: string | null; lastName?: string | null }; payment: { gatewayChargeId: string | null } | null; delivery: { status: string } | null; downsellStep?: { position: number } | null }

/** A API devolve no máximo este tanto de pedidos por consulta, os mais recentes primeiro. */
const LIMIT = 200

// Cor de cada estado na barra: estado bom, de espera e ruim usam as cores de estado; o resto é neutro.
const STATUS_COLOR: Record<string, string> = {
  pago: 'var(--st-good)',
  aguardando_pagamento: 'var(--st-warn)',
  em_analise: 'var(--st-serious)',
  reembolsado: 'var(--st-critical)',
  expirado: 'var(--st-neutral)',
  cancelado: 'var(--st-neutral-2)',
  criado: 'var(--st-neutral-2)',
}
const STATUS_ORDER = ['pago', 'aguardando_pagamento', 'em_analise', 'reembolsado', 'expirado', 'cancelado', 'criado']

export default function OrdersPage() {
  const params = useSearchParams()
  const router = useRouter()
  const query = queryString(params)
  const { data, error, stale, reload } = useApi<Order[]>(`/api/orders?${query}`)
  const [filter, setFilter] = useState('todos')

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageLoading title="Pedidos" />

  const count = (status: string) => data.filter((order) => order.status === status).length
  const known = STATUS_ORDER.filter((status) => count(status) > 0)
  const others = [...new Set(data.map((order) => order.status))].filter((status) => !STATUS_ORDER.includes(status))
  const statuses = [...known, ...others]
  const parts: Part[] = statuses.map((status) => ({ key: status, label: orderStatus(status).label, value: count(status), color: STATUS_COLOR[status] || 'var(--st-neutral)' }))
  const active = filter !== 'todos' && statuses.includes(filter) ? filter : 'todos'
  const rows = active === 'todos' ? data : data.filter((order) => order.status === active)
  const paid = data.filter((order) => order.status === 'pago')

  return (
    <div className={stale ? 'stale' : 'fresh'}>
      <PageHeader eyebrow="Vendas" title="Pedidos" subtitle={`${periodLabel(params)}. O estado de um pedido só muda quando a KavroPay confirma.`} />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-3 xl:col-span-7 xl:grid-cols-3">
          <StatTile index={1} label="Pedidos" icon="bag" value={data.length} hint={data.length >= LIMIT ? `Os ${LIMIT} mais recentes do período` : undefined} />
          <StatTile index={2} label="Pagos" icon="check-circle" value={paid.length} />
          <StatTile index={3} strong label="Valor dos pagos" icon="coins" value={paid.reduce((sum, order) => sum + order.amountCents, 0)} format={formatBRL} />
        </div>
        <Panel index={4} className="xl:col-span-5" title="Pedidos por estado">
          {data.length === 0 ? <p className="text-[13.5px] text-muted">0 pedidos no período.</p> : <Segments parts={parts} />}
        </Panel>
      </div>

      <Panel
        index={5}
        className="mt-4"
        title="Lista"
        subtitle={`${formatInt(rows.length)} ${rows.length === 1 ? 'pedido' : 'pedidos'}${active === 'todos' ? '' : ` em "${orderStatus(active).label}"`}`}
        flush
      >
        {statuses.length > 1 && (
          <div className="no-scrollbar overflow-x-auto px-5 pt-4 md:px-6">
            <Segmented label="Filtrar por estado" value={active} onChange={setFilter} options={[{ value: 'todos', label: 'Todos', count: data.length }, ...statuses.map((status) => ({ value: status, label: orderStatus(status).label, count: count(status) }))]} />
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState icon="bag" title="0 pedidos no período" text="Um pedido nasce quando alguém toca em comprar no bot." />
        ) : (
          <div className="max-h-[70vh] overflow-auto pb-2 pt-3">
            <table className="tbl">
              <thead>
                <tr><th>Pedido</th><th>Cliente</th><th className="num">Valor</th><th>Estado</th><th>Entrega</th><th>Origem</th><th>Criado em</th><th><span className="sr-only">Abrir</span></th></tr>
              </thead>
              <tbody>
                {rows.map((order) => {
                  const href = `/orders/${order.id}?${query}`
                  const name = [order.user.firstName, order.user.lastName].filter(Boolean).join(' ')
                  return (
                    <tr key={order.id} className="group cursor-pointer" onClick={() => router.push(href)}>
                      <td><Link href={href} onClick={(event) => event.stopPropagation()} className="font-mono text-[12.5px] font-semibold underline-offset-4 hover:underline">{order.id.slice(0, 10)}</Link></td>
                      <td>
                        <p className="font-medium">{name || (order.user.username ? `@${order.user.username}` : order.user.telegramId)}</p>
                        <p className="font-mono text-[12px] text-muted">{order.user.telegramId}</p>
                      </td>
                      <td className="num">
                        <p className="font-semibold">{formatBRL(order.amountCents)}</p>
                        {order.downsellStep && <p className="text-[12px] text-muted">Downsell {order.downsellStep.position}</p>}
                      </td>
                      <td><StatusBadge status={orderStatus(order.status)} /></td>
                      <td><StatusBadge status={deliveryStatus(order.delivery?.status || 'sem_entrega')} /></td>
                      <td><span className="chip"><Icon name="tag" size={12} />{order.origin}</span></td>
                      <td className="whitespace-nowrap text-ink-2">{formatShortDateTime(order.createdAt)}</td>
                      <td className="text-right"><Icon name="chevron-right" size={16} className="inline text-muted transition-transform duration-300 ease-out group-hover:translate-x-1 group-hover:text-accent" /></td>
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
