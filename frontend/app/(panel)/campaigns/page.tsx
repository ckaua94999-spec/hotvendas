'use client'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { queryString, useApi } from '../../../components/api'
import { ChartCard, GroupBars, RankedBars } from '../../../components/charts'
import { Icon } from '../../../components/icons'
import { EmptyState, ErrorState, Meter, PageHeader, PageLoading, Panel, StatTile } from '../../../components/kit'
import { CAMPAIGN_SERIES } from '../../../components/series'
import { formatBRL, formatInt, formatPercent } from '../../../lib/format'
import { periodLabel } from '../../../lib/period'

type Row = { origin: string; started: number; pix: number; paid: number; grossCents: number; conversionPercent: number }
type SortKey = 'origin' | 'started' | 'pix' | 'paid' | 'grossCents' | 'conversionPercent'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'origin', label: 'Origem', numeric: false },
  { key: 'started', label: 'Iniciados', numeric: true },
  { key: 'pix', label: 'PIX', numeric: true },
  { key: 'paid', label: 'Pagos', numeric: true },
  { key: 'grossCents', label: 'Bruto', numeric: true },
  { key: 'conversionPercent', label: 'Conversão', numeric: true },
]

/** Quantas origens cabem num gráfico sem virar ruído. As demais continuam na tabela. */
const CHART_LIMIT = 8

export default function CampaignsPage() {
  const params = useSearchParams()
  const { data, error, stale, reload } = useApi<Row[]>(`/api/campaigns?${queryString(params)}`)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'started', desc: true })

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageLoading title="Campanhas" />

  const total = data.reduce((sum, row) => ({ started: sum.started + row.started, paid: sum.paid + row.paid, grossCents: sum.grossCents + row.grossCents }), { started: 0, paid: 0, grossCents: 0 })
  const sorted = [...data].sort((a, b) => {
    const order = sort.key === 'origin' ? a.origin.localeCompare(b.origin, 'pt-BR') : a[sort.key] - b[sort.key]
    return sort.desc ? -order : order
  })
  const byStarted = [...data].sort((a, b) => b.started - a.started).slice(0, CHART_LIMIT)
  const byGross = [...data].sort((a, b) => b.grossCents - a.grossCents).slice(0, CHART_LIMIT)
  const hidden = data.length - CHART_LIMIT
  const cut = hidden > 0 ? ` As ${CHART_LIMIT} maiores; as outras ${hidden} estão na tabela.` : ''

  return (
    <div className={stale ? 'stale' : 'fresh'}>
      <PageHeader eyebrow="Pessoas" title="Campanhas" subtitle={`${periodLabel(params)}. Cada pessoa conta na origem do primeiro acesso.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile index={1} label="Origens com movimento" icon="megaphone" value={data.length} />
        <StatTile index={2} label="Iniciados" icon="users" value={total.started} />
        <StatTile index={3} label="Pagos" icon="check-circle" value={total.paid} />
        <StatTile index={4} strong label="Faturamento bruto" icon="coins" value={total.grossCents} format={formatBRL} />
      </div>

      {data.length === 0 ? (
        <Panel index={5} className="mt-4">
          <EmptyState icon="megaphone" title="0 campanhas no período" text="Quando alguém chegar ao bot por um link de campanha neste período, a origem aparece aqui." />
        </Panel>
      ) : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-12">
            <ChartCard
              index={5}
              className="xl:col-span-7"
              title="Iniciados, PIX e pagos por origem"
              subtitle={`Quantidade em cada origem.${cut}`}
              series={CAMPAIGN_SERIES}
              table={{ head: ['Origem', 'Iniciados', 'PIX', 'Pagos'], rows: byStarted.map((row) => [row.origin, formatInt(row.started), formatInt(row.pix), formatInt(row.paid)]) }}
            >
              <GroupBars rows={byStarted.map((row) => ({ label: row.origin, started: row.started, pix: row.pix, paid: row.paid }))} series={CAMPAIGN_SERIES} />
            </ChartCard>
            <Panel index={6} className="xl:col-span-5" title="Faturamento bruto por origem" subtitle={`Da maior para a menor.${cut}`}>
              <RankedBars rows={byGross.map((row) => ({ key: row.origin, label: row.origin, value: row.grossCents }))} format={formatBRL} />
            </Panel>
          </div>

          <Panel index={7} className="mt-4" title="Todas as origens" subtitle="Toque num título para ordenar" flush>
            <div className="overflow-x-auto pb-2 pt-3">
              <table className="tbl">
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column.key} className={column.numeric ? 'num' : ''} aria-sort={sort.key === column.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                        <button type="button" onClick={() => setSort({ key: column.key, desc: sort.key === column.key ? !sort.desc : column.numeric })}>
                          {column.label}
                          <Icon name={sort.desc ? 'chevron-down' : 'chevron-up'} size={12} style={{ opacity: sort.key === column.key ? 1 : 0 }} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.origin}>
                      <td><span className="chip"><Icon name="tag" size={12} />{row.origin}</span></td>
                      <td className="num">{formatInt(row.started)}</td>
                      <td className="num">{formatInt(row.pix)}</td>
                      <td className="num">{formatInt(row.paid)}</td>
                      <td className="num font-semibold">{formatBRL(row.grossCents)}</td>
                      <td className="num">
                        <div className="ml-auto flex w-[132px] items-center gap-3">
                          <Meter value={row.conversionPercent} label={`Conversão de ${row.origin}`} />
                          <span className="w-12 flex-none">{formatPercent(row.conversionPercent)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
