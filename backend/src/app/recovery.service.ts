import { Injectable } from '@nestjs/common'
import { recoveryDue, RecoveryStage } from '../domain/recovery'
import { PrismaService } from '../infra/prisma.service'
import { TelegramClient } from '../infra/telegram.client'
import { SettingsService } from './settings.service'

const STAGES: { stage: RecoveryStage; minutes: string; enabled: string; text: string }[] = [
  { stage: 'no_pix', minutes: 'recovery_no_pix_minutes', enabled: 'recovery_no_pix_enabled', text: 'recovery_no_pix_text' },
  { stage: 'pix_unpaid', minutes: 'recovery_unpaid_minutes', enabled: 'recovery_unpaid_enabled', text: 'recovery_unpaid_text' },
  { stage: 'pix_expired', minutes: 'recovery_expired_minutes', enabled: 'recovery_expired_enabled', text: 'recovery_expired_text' },
]

@Injectable()
export class RecoveryService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  async sweep() {
    const token = await this.settings.get('telegram_token')
    if (!token) return
    const tg = new TelegramClient(token)
    const users = await this.prisma.user.findMany({ include: { orders: { include: { payment: true } }, recoveries: true } })
    const now = Date.now()
    for (const user of users) {
      const paid = user.orders.some((order) => order.status === 'pago')
      for (const stage of STAGES) {
        const anchor = this.anchor(user, stage.stage)
        if (!anchor) continue
        const due = recoveryDue({
          stage: stage.stage,
          alreadySent: user.recoveries.some((item) => item.stage === stage.stage),
          paid,
          blocked: user.blocked,
          enabled: (await this.settings.get(stage.enabled)) !== '0',
          elapsedMinutes: (now - anchor.getTime()) / 60000,
          delayMinutes: Number((await this.settings.get(stage.minutes)) || 0),
        })
        if (!due) continue
        try {
          await tg.call('sendMessage', { chat_id: user.telegramId, text: (await this.settings.get(stage.text)) || '' })
          await this.prisma.recoveryMessage.create({ data: { userId: user.id, stage: stage.stage } })
          await this.prisma.trackingEvent.create({ data: { userId: user.id, type: 'recovery_sent', origin: user.origin, campaignCode: user.campaignCode, metadata: { stage: stage.stage } } })
        } catch (error) {
          if ((error as { blocked?: boolean }).blocked) await this.prisma.user.update({ where: { id: user.id }, data: { blocked: true } })
        }
      }
    }
  }

  private anchor(user: { firstSeenAt: Date; orders: { status: string; createdAt: Date; payment: { expiresAt: Date | null } | null }[] }, stage: RecoveryStage) {
    if (stage === 'no_pix') {
      if (user.orders.some((order) => order.payment)) return null
      return user.firstSeenAt
    }
    if (stage === 'pix_unpaid') {
      const waiting = user.orders.filter((order) => order.status === 'aguardando_pagamento').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
      return waiting?.createdAt || null
    }
    const expired = user.orders.filter((order) => order.status === 'expirado').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    return expired?.payment?.expiresAt || expired?.createdAt || null
  }
}
