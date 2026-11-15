'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { queryString, useApi } from '../../../components/api'
import { ChartCard, FunnelChart, RankedBars, Sparkline, TimeChart } from '../../../components/charts'
import { Icon } from '../../../components/icons'
import { ErrorState, Meter, PageHeader, PageLoading, Panel, Skeleton, StatTile } from '../../../components/kit'
import { AnimatedNumber } from '../../../components/motion'
import { ACTIVITY_SERIES, MONEY_SERIES, seriesTable, timePoints, trend } from '../../../components/series'
import { formatBRL, formatCompactBRL, formatInt, formatPercent } from '../../../lib/format'
import { granularityLabel, periodLabel } from '../../../lib/period'
import type { Dashboard, FunnelRow, Series } from '../../../lib/types'

function Mini({ label, value, tone, children }: { label: string; value: number; tone?: 'bad'; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={`mt-1 text-[17px] font-semibold tracking-[-0.01em] ${tone === 'bad' ? 'text-bad' : ''}`}><AnimatedNumber value={value} format={formatBRL} /></dd>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const params = useSearchParams()
  const query = queryString(params)
  const dashboard = useApi<Dashboard>(`/api/dashboard?${query}`)
  const series = useApi<Series>(`/api/series?${query}`)
  const funnel = useApi<FunnelRow[]>(`/api/funnel?${query}`)

  if (dashboard.error) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />
  if (!dashboard.data) return <PageLoading title="Operação" />

  const data = dashboard.data
  const finance = data.finance
  const per = granularityLabel(series.data?.granularity)
  const chart = (kind: 'money' | 'activity') => {
    if (series.error) return <p className="py-16 text-center text-[13.5px] text-muted">O gráfico não carregou. Os números acima continuam valendo.</p>
    if (!series.data) return <Skeleton className="h-[280px] w-full" />
    return kind === 'money'
      ? <TimeChart points={timePoints(series.data)} granularity={series.data.granularity} series={MONEY_SERIES} format={formatBRL} axisFormat={formatCompactBRL} axisWidth={74} />
      : <TimeChart points={timePoints(series.data)} granularity={series.data.granularity} series={ACTIVITY_SERIES} format={formatInt} />
  }

  return (
    <div className={dashboard.stale ? 'stale' : 'fresh'}>
      <PageHeader eyebrow="Painel" title="Operação" subtitle={`${periodLabel(params)}. Os números saem dos eventos e pagamentos gravados.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile index={1} strong label="Faturamento bruto" icon="coins" value={finance.grossCents} format={formatBRL} footer={<Sparkline values={trend(series.data, 'grossCents')} color="var(--series-paid)" />} />
        <StatTile index={2} label="Pagamentos aprovados" icon="check-circle" value={data.paymentsApproved} footer={<Sparkline values={trend(series.data, 'paid')} color="var(--series-paid)" />} />
        <StatTile index={3} label="PIX gerados" icon="qr" value={data.pixGenerated} footer={<Sparkline values={trend(series.data, 'pix')} color="var(--series-pix)" />} />
        <StatTile index={4} label="Usuários únicos" icon="users" value={data.uniqueUsers} footer={<Sparkline values={trend(series.data, 'newUsers')} color="var(--series-users)" />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <ChartCard
          index={5}
          className="xl:col-span-8"
          title="Financeiro"
          subtitle={`Bruto e líquido ${per}`}
          series={MONEY_SERIES}
          table={seriesTable(series.data, MONEY_SERIES, formatBRL)}
          aside={(
            <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4 border-b border-line pb-5 sm:grid-cols-4">
              <Mini label="Líquido" value={finance.netCents} />
              <Mini label="Taxas" value={finance.feeCents}>
                {finance.feesMissing > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-warn"><Icon name="alert" size={12} />{finance.feesMissing} sem taxa informada</p>
                )}
              </Mini>
              <Mini label="Despesas" value={finance.expenseCents} />
              <Mini label="Resultado" value={finance.resultCents} tone={finance.resultCents < 0 ? 'bad' : undefined} />
            </dl>
          )}
        >
          {chart('money')}
        </ChartCard>

        <Panel
          index={6}
          className="xl:col-span-4"
          title="Funil do período"
          subtitle="Pessoas em cada etapa"
          actions={<Link href={`/funnel?${query}`} className="btn btn-ghost btn-sm -mr-2">Abrir<Icon name="arrow-right" size={14} /></Link>}
        >
          {funnel.data ? <FunnelChart rows={funnel.data} compact /> : funnel.error ? <p className="py-10 text-center text-[13.5px] text-muted">O funil não carregou.</p> : <div className="grid gap-4">{[0, 1, 2, 3, 4, 5].map((row) => <Skeleton key={row} className="h-8 w-full" />)}</div>}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile index={7} label="Iniciaram o bot" icon="play" value={data.usersStarted} />
        <StatTile index={8} label="Apresentação enviada" icon="video" value={data.presentationSent} />
        <StatTile index={9} label="Cliques em comprar" icon="pointer" value={data.purchaseClicks} />
        <StatTile index={10} label="Conversão" icon="percent" value={data.conversionPercent} precision={1} format={formatPercent} hint="De quem iniciou o bot a quem pagou" footer={<Meter value={data.conversionPercent} label="Conversão" />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <ChartCard index={11} className="xl:col-span-7" title="Movimento" subtitle={`Novos usuários, PIX e pagamentos ${per}`} series={ACTIVITY_SERIES} table={seriesTable(series.data, ACTIVITY_SERIES, formatInt)}>
          {chart('activity')}
        </ChartCard>

        <Panel index={12} className="xl:col-span-5" title="PIX e entregas" subtitle="O que aconteceu com as cobranças do período">
          <RankedBars
            color="var(--series-pix)"
            labelWidth={156}
            format={formatInt}
            rows={[
              { key: 'generated', label: 'PIX gerados', value: data.pixGenerated },
              { key: 'approved', label: 'Pagamentos aprovados', value: data.paymentsApproved },
              { key: 'pending', label: 'PIX pendentes', value: data.pixPending },
              { key: 'expired', label: 'PIX expirados', value: data.pixExpired },
              { key: 'refunded', label: 'Reembolsos', value: data.paymentsRefunded },
            ]}
          />
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5">
            <div className="rounded-2xl bg-[var(--neutral-soft)] p-4">
              <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2"><Icon name="check-circle" size={14} className="text-ok" />Entregas concluídas</p>
              <p className="mt-2 text-[24px] font-semibold leading-none"><AnimatedNumber value={data.deliveriesCompleted} format={formatInt} /></p>
            </div>
            <div className="rounded-2xl bg-[var(--neutral-soft)] p-4">
              <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2"><Icon name="x-circle" size={14} className={data.deliveriesFailed > 0 ? 'text-bad' : 'text-muted'} />Entregas com falha</p>
              <p className="mt-2 text-[24px] font-semibold leading-none"><AnimatedNumber value={data.deliveriesFailed} format={formatInt} /></p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
