const STAGES: [string, string][] = [
  ['bot_started', 'Iniciaram o bot'],
  ['presentation_sent', 'Apresentação enviada'],
  ['purchase_clicked', 'Clicaram em comprar'],
  ['pix_generated', 'Geraram PIX'],
  ['payment_approved', 'Pagaram'],
  ['delivery_completed', 'Receberam o conteúdo'],
]

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

export function funnelCounts(events: { userId: string; type: string }[]) {
  const usersByStage = STAGES.map(([type]) => new Set(events.filter((event) => event.type === type).map((event) => event.userId)))
  const start = usersByStage[0].size
  return STAGES.map(([, label], index) => {
    const users = usersByStage[index].size
    const previous = index === 0 ? users : usersByStage[index - 1].size
    const dropped = index === 0 ? 0 : previous - users
    return {
      stage: STAGES[index][0],
      label,
      users,
      percentOfStart: start === 0 ? 0 : oneDecimal((users / start) * 100),
      percentOfPrevious: previous === 0 ? 0 : oneDecimal((users / previous) * 100),
      dropped,
      dropPercent: previous === 0 ? 0 : oneDecimal((dropped / previous) * 100),
    }
  })
}
