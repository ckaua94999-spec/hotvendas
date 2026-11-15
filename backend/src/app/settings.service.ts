import { Injectable } from '@nestjs/common'
import { decryptSettings, encryptSettings, maskSecret } from '../domain/cipher'
import { settingsKey } from '../infra/env'
import { PrismaService } from '../infra/prisma.service'
import { PITCH } from '../domain/telegram-flow'

export const TEXT_DEFAULTS: Record<string, string> = {
  msg_welcome: PITCH,
  msg_payment: 'Pague o PIX abaixo. A confirmação é automática.',
  msg_approval:
    'Pagamento confirmado!\n\nSua compra foi aprovada e seu acesso está liberado.\n\nAgradecemos pela confiança. Aproveite seu conteúdo!',
  msg_delivery: 'Seu conteúdo está liberado. Se precisar de novo, use /meuacesso.',
  msg_support: 'Fale com o suporte pelo contato configurado.',
  support_url: '',
  recovery_no_pix_text: 'Você ainda não gerou o PIX. Quando quiser garantir o acesso, use /comprar.',
  recovery_unpaid_text: 'Seu PIX continua em aberto. A confirmação é automática. Se já pagou, toque em Já paguei.',
  recovery_expired_text: 'Seu PIX expirou. Você pode gerar outro com /comprar.',
  recovery_no_pix_minutes: '60',
  recovery_unpaid_minutes: '30',
  recovery_expired_minutes: '1440',
  recovery_no_pix_enabled: '1',
  recovery_unpaid_enabled: '1',
  recovery_expired_enabled: '1',
  pix_expires_minutes: '30',
}

const SECRET_KEYS = new Set(['telegram_token', 'kavro_api_key', 'kavro_webhook_secret'])

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } })
    if (!row) return TEXT_DEFAULTS[key] ?? null
    return decryptSettings(row.valueCiphertext, settingsKey())
  }

  async set(key: string, value: string) {
    const valueCiphertext = encryptSettings(value, settingsKey())
    await this.prisma.setting.upsert({ where: { key }, create: { key, valueCiphertext }, update: { valueCiphertext } })
  }

  async maskedSecrets() {
    const result: Record<string, string> = {}
    for (const key of SECRET_KEYS) {
      const value = await this.stored(key)
      result[key] = value ? maskSecret(value) : ''
    }
    return result
  }

  private async stored(key: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } })
    if (!row) return null
    return decryptSettings(row.valueCiphertext, settingsKey())
  }

  async audit(adminId: string | null, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
    const scrub = (value: unknown) => {
      if (!value || typeof value !== 'object') return value
      const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) }
      for (const key of Object.keys(copy)) {
        if (/token|secret|key|password/i.test(key) && copy[key]) copy[key] = maskSecret(String(copy[key]))
      }
      return copy
    }
    await this.prisma.auditLog.create({
      data: {
        adminId,
        action,
        entity,
        entityId,
        before: before == null ? undefined : (scrub(before) as object),
        after: after == null ? undefined : (scrub(after) as object),
      },
    })
  }
}
