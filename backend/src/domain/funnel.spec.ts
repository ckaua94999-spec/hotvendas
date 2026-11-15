import { funnelCounts } from './funnel'

describe('funnelCounts', () => {
  it('conta usuários únicos e a perda contra a etapa anterior', () => {
    const events = [
      'bot_started',
      'presentation_sent',
      'purchase_clicked',
      'pix_generated',
      'payment_approved',
      'delivery_completed',
    ].flatMap((type) => [{ userId: 'A', type }])
    events.push({ userId: 'B', type: 'bot_started' })

    const rows = funnelCounts(events)
    expect(rows.map((row) => row.users)).toEqual([2, 1, 1, 1, 1, 1])
    expect(rows[1].label).toBe('Apresentação enviada')
    expect(rows[1].dropped).toBe(1)
    expect(rows[5].dropped).toBe(0)
    expect(rows[5].percentOfStart).toBe(50)
    expect(rows[1].percentOfPrevious).toBe(50)
  })

  it('percentual é zero quando ninguém iniciou', () => {
    const rows = funnelCounts([])
    expect(rows[0].users).toBe(0)
    expect(rows[0].percentOfStart).toBe(0)
    expect(rows[1].percentOfPrevious).toBe(0)
  })
})
