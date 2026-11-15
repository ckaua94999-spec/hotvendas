import { recoveryDue } from './recovery'

const ready = {
  stage: 'pix_unpaid' as const,
  alreadySent: false,
  paid: false,
  blocked: false,
  enabled: true,
  elapsedMinutes: 30,
  delayMinutes: 30,
}

describe('recoveryDue', () => {
  it('envia quando o atraso passou e a etapa está livre', () => {
    expect(recoveryDue(ready)).toBe(true)
  })

  it('não envia cedo, repetido, pago, bloqueado ou desligado', () => {
    expect(recoveryDue({ ...ready, elapsedMinutes: 29 })).toBe(false)
    expect(recoveryDue({ ...ready, alreadySent: true })).toBe(false)
    expect(recoveryDue({ ...ready, paid: true })).toBe(false)
    expect(recoveryDue({ ...ready, blocked: true })).toBe(false)
    expect(recoveryDue({ ...ready, enabled: false })).toBe(false)
  })
})
