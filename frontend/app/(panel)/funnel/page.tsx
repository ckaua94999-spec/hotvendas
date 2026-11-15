'use client'
import { useSearchParams } from 'next/navigation'
import { queryString, useApi } from '../../../components/api'
import { FunnelChart } from '../../../components/charts'
import { ErrorState, ExportButtons, PageHeader, PageLoading, Panel, StatTile } from '../../../components/kit'
import { formatInt, formatPercent } from '../../../lib/format'
import { periodLabel } from '../../../lib/period'
import type { FunnelRow } from '../../../lib/types'

export default function FunnelPage() {
  const params = useSearchParams()
  const query = queryString(params)
  const { data, error, stale, reload } = useApi<FunnelRow[]>(`/api/funnel?${query}`)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageLoading title="Funil" />

  const start = data[0]
  const paid = data.find((row) => row.stage === 'payment_approved')
  // A etapa em que mais gente parou, entre as que tiveram alguém para perder.
  const worst = data.slice(1).filter((row) => row.dropped > 0).sort((a, b) => b.dropPercent - a.dropPercent)[0]
  const worstFrom = worst ? data[data.indexOf(worst) - 1] : undefined

  return (
    <div className={stale ? 'stale' : 'fresh'}>
      <PageHeader
        eyebrow="Visão geral"
        title="Funil"
        subtitle={`${periodLabel(params)}. Cada pessoa conta uma vez por etapa. "Não avançou" é só a diferença para a etapa anterior.`}
        actions={<ExportButtons resource="funnel" query={query} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile index={1} label="Iniciaram o bot" icon="play" value={start?.users ?? 0} />
        <StatTile index={2} label="Pagaram" icon="check-circle" value={paid?.users ?? 0} />
        <StatTile index={3} strong label="Do início ao pagamento" icon="percent" value={paid?.percentOfStart ?? 0} precision={1} format={formatPercent} />
        <StatTile
          index={4}
          label="Maior perda entre etapas"
          icon="arrow-down"
          value={worst?.dropPercent ?? 0}
          precision={1}
          format={formatPercent}
          hint={worst && worstFrom ? `${worstFrom.label} → ${worst.label}` : 'Ninguém parou no caminho'}
        />
      </div>

      <Panel index={5} className="mt-4" title="Pessoas por etapa" subtitle="A largura é a quantidade de pessoas; o percentual ao lado é sobre quem iniciou">
        <FunnelChart rows={data} />
      </Panel>

      <Panel index={6} className="mt-4" title="Etapas em números" flush>
        <div className="overflow-x-auto pb-2 pt-3">
          <table className="tbl">
            <thead>
              <tr><th>Etapa</th><th className="num">Usuários</th><th className="num">% do início</th><th className="num">% da anterior</th><th className="num">Não avançaram</th><th className="num">% que não avançou</th></tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.label}>
                  <td className="font-medium">{row.label}</td>
                  <td className="num font-semibold">{formatInt(row.users)}</td>
                  <td className="num">{formatPercent(row.percentOfStart)}</td>
                  <td className="num">{formatPercent(row.percentOfPrevious)}</td>
                  <td className="num">{formatInt(row.dropped)}</td>
                  <td className="num">{formatPercent(row.dropPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
