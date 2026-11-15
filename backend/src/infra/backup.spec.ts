import { backupExpired } from './backup'

describe('backupExpired', () => {
  it('apaga dump com mais de 7 dias', () => {
    const now = Date.UTC(2026, 10, 15)
    expect(backupExpired(now - 8 * 86400000, now)).toBe(true)
    expect(backupExpired(now - 6 * 86400000, now)).toBe(false)
  })
})
