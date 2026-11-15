import { decryptSettings, encryptSettings } from './cipher'

describe('cipher', () => {
  it('recupera o texto e não o deixa em claro', () => {
    const key = Buffer.alloc(32, 7)
    const encrypted = encryptSettings('segredo', key)
    expect(encrypted).not.toContain('segredo')
    expect(decryptSettings(encrypted, key)).toBe('segredo')
  })
})
