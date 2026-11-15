import { bucketTitle } from '../lib/format'
import type { Series, SeriesPoint } from '../lib/types'
import type { SeriesDef, TableView, TimePoint } from './charts'

// Cada coisa tem a mesma cor em todas as telas: pagamento e faturamento em laranja,
// PIX em verde-água, usuário em azul, líquido em violeta.

export const MONEY_SERIES: SeriesDef[] = [
  { key: 'grossCents', label: 'Bruto', color: 'var(--series-paid)', kind: 'area' },
  { key: 'netCents', label: 'Líquido', color: 'var(--series-net)', kind: 'line' },
]

export const ACTIVITY_SERIES: SeriesDef[] = [
  { key: 'newUsers', label: 'Novos usuários', color: 'var(--series-users)', kind: 'line' },
  { key: 'pix', label: 'PIX gerados', color: 'var(--series-pix)', kind: 'line' },
  { key: 'paid', label: 'Pagamentos', color: 'var(--series-paid)', kind: 'line' },
]

export const CAMPAIGN_SERIES: SeriesDef[] = [
  { key: 'started', label: 'Iniciados', color: 'var(--series-users)', kind: 'bar' },
  { key: 'pix', label: 'PIX', color: 'var(--series-pix)', kind: 'bar' },
  { key: 'paid', label: 'Pagos', color: 'var(--series-paid)', kind: 'bar' },
]

export function timePoints(series: Series | null): TimePoint[] {
  return (series?.points || []) as unknown as TimePoint[]
}

/** A mesma série do gráfico, em tabela. */
export function seriesTable(series: Series | null, defs: SeriesDef[], format: (value: number) => string): TableView | undefined {
  if (!series) return undefined
  return {
    head: ['Intervalo', ...defs.map((item) => item.label)],
    rows: series.points.map((point) => [bucketTitle(point.start, series.granularity), ...defs.map((item) => (point.future ? '—' : format(Number(point[item.key as keyof SeriesPoint]))))]),
  }
}

/** Valores já acontecidos de uma medida, para a linha de tendência do cartão. */
export function trend(series: Series | null, key: keyof SeriesPoint): number[] {
  return (series?.points || []).filter((point) => !point.future).map((point) => Number(point[key]))
}
