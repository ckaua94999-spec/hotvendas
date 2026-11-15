'use client'
import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { queryString, send, useApi } from '../../../components/api'
import { ChartCard, RankedBars, TimeChart } from '../../../components/charts'
import { Icon } from '../../../components/icons'
import { EmptyState, ErrorState, ExportButtons, Field, PageHeader, PageLoading, Panel, Skeleton, SkeletonRows, Spinner, StatTile, StatusBadge, useToast } from '../../../components/kit'
import { MONEY_SERIES, seriesTable, timePoints } from '../../../components/series'
import { formatBRL, formatCalendarDate, formatCompactBRL, formatInt, formatShortDateTime, parseReais } from '../../../lib/format'
import { granularityLabel, periodLabel } from '../../../lib/period'
import { CATEGORY_LABEL, deliveryStatus, EXPENSE_CATEGORIES, orderStatus } from '../../../lib/status'
import type { Finance, Series } from '../../../lib/types'

type Tx = { orderId: string; gatewayChargeId: string | null; telegramId: string; amountCents: number; feeCents: number | null; netCents: number | null; createdAt: string; paidAt: string | null; status: string; deliveryStatus: string; origin: string }
type Expense = { id: string; description: string; category: string; amountCents: number; occurredOn: string; notes: string }

export default function FinancePage() {
  const params = useSearchParams()
  const query = queryString(params)
  const summary = useApi<Finance>(`/api/finance/summary?${query}`)
  const series = useApi<Series>(`/api/series?${query}`)
  const transactions = useApi<Tx[]>(`/api/finance/transactions?${query}`)
  const expenses = useApi<Expense[]>('/api/expenses')
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  if (summary.error) return <ErrorState message={summary.error} onRetry={summary.reload} />
  if (!summary.data) return <PageLoading title="Financeiro" />

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const amountCents = parseReais(String(data.get('amount') || ''))
    if (amountCents <= 0) { toast('warn', 'Informe o valor da despesa, em reais. Exemplo: 49,90.'); return }
    setSaving(true)
    const response = await send('/api/expenses', 'POST', { description: data.get('description'), category: data.get('category'), amountCents, occurredOn: data.get('date'), notes: data.get('notes') })
    setSaving(false)
    if (!response.ok) {
      toast('bad', response.json?.error || (response.status === 403 ? 'Só o dono da operação lança despesas.' : 'A despesa não foi lançada.'))
      return
    }
    form.reset()
    toast('ok', 'Despesa lançada.')
    expenses.reload()
    summary.reload()
    series.reload()
  }

  const finance = summary.data
  const per = granularityLabel(series.data?.granularity)
  const byCategory = (series.data?.expensesByCategory || []).map((row) => ({ key: row.category, label: CATEGORY_LABEL[row.category] || row.category, value: row.amountCents }))

  return (
    <div className={summary.stale ? 'stale' : 'fresh'}>
      <PageHeader eyebrow="Vendas" title="Financeiro" subtitle={`${periodLabel(params)}. Taxa que a KavroPay não enviou aparece como não informada, nunca como zero.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile index={1} label="Faturamento bruto" icon="coins" value={finance.grossCents} format={formatBRL} />
        <StatTile
          index={2}
          label="Taxas"
          icon="percent"
          value={finance.feeCents}
          format={formatBRL}
          hint={finance.feesMissing > 0 ? <><Icon name="alert" size={13} />{formatInt(finance.feesMissing)} {finance.feesMissing === 1 ? 'pagamento sem taxa informada' : 'pagamentos sem taxa informada'}</> : undefined}
          hintTone="warn"
        />
        <StatTile index={3} label="Líquido" icon="wallet" value={finance.netCents} format={formatBRL} />
        <StatTile index={4} label="Reembolsos" icon="recovery" value={finance.refundCents} format={formatBRL} />
        <StatTile index={5} label="Despesas" icon="receipt" value={finance.expenseCents} format={formatBRL} />
        <StatTile index={6} strong label="Resultado" icon="trending" value={finance.resultCents} format={formatBRL} hint="Líquido menos despesas" hintTone={finance.resultCents < 0 ? 'bad' : 'neutral'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <ChartCard index={7} className="xl:col-span-8" title="Bruto e líquido" subtitle={`Pagamentos confirmados ${per}`} series={MONEY_SERIES} table={seriesTable(series.data, MONEY_SERIES, formatBRL)}>
          {series.error ? <p className="py-16 text-center text-[13.5px] text-muted">O gráfico não carregou. Os números acima continuam valendo.</p>
            : !series.data ? <Skeleton className="h-[280px] w-full" />
            : <TimeChart points={timePoints(series.data)} granularity={series.data.granularity} series={MONEY_SERIES} format={formatBRL} axisFormat={formatCompactBRL} axisWidth={74} />}
        </ChartCard>
        <Panel index={8} className="xl:col-span-4" title="Despesas por categoria" subtitle="Lançadas com data dentro do período">
          {!series.data ? <SkeletonRows rows={4} />
            : byCategory.length === 0 ? <EmptyState icon="receipt" title="0 despesas no período" />
            : <RankedBars rows={byCategory} format={formatBRL} color="var(--series-net)" labelWidth={104} />}
        </Panel>
      </div>

      <Panel index={9} className="mt-4" title="Transações" subtitle="Cobranças criadas no período. A exportação traz estas mesmas linhas." actions={<ExportButtons resource="transactions" query={query} />} flush>
        {!transactions.data ? <SkeletonRows /> : transactions.data.length === 0 ? (
          <EmptyState icon="wallet" title="0 transações no período" text="Cada PIX gerado no período aparece aqui, pago ou não." />
        ) : (
          <div className={`max-h-[70vh] overflow-auto pb-2 pt-3 ${transactions.stale ? 'stale' : 'fresh'}`}>
            <table className="tbl">
              <thead>
                <tr><th>Pedido</th><th>Cliente</th><th className="num">Valor</th><th className="num">Taxa</th><th className="num">Líquido</th><th>Estado</th><th>Entrega</th><th>Criada em</th><th>Paga em</th></tr>
              </thead>
              <tbody>
                {transactions.data.map((row) => (
                  <tr key={row.orderId}>
                    <td>
                      <Link href={`/orders/${row.orderId}?${query}`} className="font-mono text-[12.5px] font-semibold underline-offset-4 hover:underline">{row.orderId.slice(0, 8)}</Link>
                      <p className="max-w-[150px] truncate font-mono text-[11.5px] text-muted" title={row.gatewayChargeId || undefined}>{row.gatewayChargeId || 'sem ID da KavroPay'}</p>
                    </td>
                    <td>
                      <p className="font-mono text-[12.5px]">{row.telegramId}</p>
                      <p className="text-[12px] text-muted">{row.origin}</p>
                    </td>
                    <td className="num font-semibold">{formatBRL(row.amountCents)}</td>
                    <td className="num">{row.feeCents != null ? formatBRL(row.feeCents) : row.paidAt ? <span className="text-warn">não informada</span> : '—'}</td>
                    <td className="num">{row.netCents == null ? '—' : formatBRL(row.netCents)}</td>
                    <td><StatusBadge status={orderStatus(row.status)} /></td>
                    <td><StatusBadge status={deliveryStatus(row.deliveryStatus)} /></td>
                    <td className="whitespace-nowrap text-ink-2">{formatShortDateTime(row.createdAt)}</td>
                    <td className="whitespace-nowrap text-ink-2">{formatShortDateTime(row.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Panel index={10} className="self-start xl:col-span-4" title="Lançar despesa" subtitle="Entra no resultado do período da data informada">
          <form onSubmit={create} className="grid gap-4">
            <Field label="Descrição" htmlFor="expense-description">
              <input id="expense-description" name="description" required placeholder="Ex.: servidor de novembro" className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Valor (R$)" htmlFor="expense-amount">
                <input id="expense-amount" name="amount" required inputMode="decimal" placeholder="0,00" className="input tnum" />
              </Field>
              <Field label="Data" htmlFor="expense-date">
                <input id="expense-date" name="date" type="date" required className="input" />
              </Field>
            </div>
            <Field label="Categoria" htmlFor="expense-category">
              <select id="expense-category" name="category" className="input">
                {EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABEL[item]}</option>)}
              </select>
            </Field>
            <Field label="Observação" htmlFor="expense-notes" hint="Opcional">
              <input id="expense-notes" name="notes" className="input" />
            </Field>
            <button className="btn btn-primary" disabled={saving}>{saving ? <Spinner /> : <Icon name="plus" size={15} />}Lançar despesa</button>
          </form>
        </Panel>

        <Panel index={11} className="xl:col-span-8" title="Despesas lançadas" subtitle="As 200 mais recentes, de qualquer período" flush>
          {!expenses.data ? <SkeletonRows rows={4} /> : expenses.data.length === 0 ? (
            <EmptyState icon="receipt" title="0 despesas lançadas" text="Hospedagem, ferramentas, anúncios: o que for lançado aqui sai do líquido para formar o resultado." />
          ) : (
            <div className="max-h-[460px] overflow-auto pb-2 pt-3">
              <table className="tbl">
                <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {expenses.data.map((item) => (
                    <tr key={item.id}>
                      <td className="tnum whitespace-nowrap text-ink-2">{formatCalendarDate(item.occurredOn)}</td>
                      <td>
                        <p className="font-medium">{item.description}</p>
                        {item.notes && <p className="text-[12.5px] text-muted">{item.notes}</p>}
                      </td>
                      <td><span className="chip">{CATEGORY_LABEL[item.category] || item.category}</span></td>
                      <td className="num font-semibold">{formatBRL(item.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
