export type RecoveryStage = 'no_pix' | 'pix_unpaid' | 'pix_expired'

export function recoveryDue(input: {
  stage: RecoveryStage
  alreadySent: boolean
  paid: boolean
  blocked: boolean
  enabled: boolean
  elapsedMinutes: number
  delayMinutes: number
}): boolean {
  if (!input.enabled || input.alreadySent || input.paid || input.blocked) return false
  return input.elapsedMinutes >= input.delayMinutes
}
