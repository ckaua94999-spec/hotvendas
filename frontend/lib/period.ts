import { formatCalendarDate, Granularity } from './format'

const LABELS: Record<string, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  este_mes: 'Este mês',
  mes_anterior: 'Mês anterior',
}

/** Nome do período escolhido no filtro, para o subtítulo das telas. */
export function periodLabel(params: { get(name: string): string | null }) {
  const preset = params.get('preset') || 'hoje'
  if (preset === 'custom') {
    const from = params.get('from')
    const to = params.get('to')
    return from && to ? `De ${formatCalendarDate(from)} a ${formatCalendarDate(to)}` : 'Hoje'
  }
  return LABELS[preset] || 'Hoje'
}

/** Como o gráfico divide o período: "por hora", "por dia", "por mês". */
export function granularityLabel(granularity: Granularity | undefined) {
  return granularity === 'hour' ? 'por hora' : granularity === 'month' ? 'por mês' : 'por dia'
}
