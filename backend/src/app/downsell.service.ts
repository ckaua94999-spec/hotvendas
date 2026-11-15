import { Injectable } from '@nestjs/common'
import { downsellButton, downsellDue, renderDownsell, validateDownsell } from '../domain/downsell'
import { PrismaService } from '../infra/prisma.service'
import { TelegramClient } from '../infra/telegram.client'
import { SettingsService } from './settings.service'

/** Pedido com PIX gerado que ainda pode virar venda. */
const UNPAID = ['aguardando_pagamento', 'expirado']
/** Pedido que tira a pessoa do fluxo: pagou, foi reembolsada ou o pagamento está em análise. */
const SETTLED = ['pago', 'reembolsado', 'em_analise']

@Injectable()
export class DownsellService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  /** O fluxo nasce desligado: só manda mensagem depois que alguém liga no painel. */
  async enabled() {
    return (await this.settings.get('downsell_enabled')) === '1'
  }

  /** O fluxo como o painel mostra: os passos na ordem e o que cada um já rendeu. */
  async view() {
    const [steps, product, enabled, paid] = await Promise.all([
      this.prisma.downsellStep.findMany({ orderBy: { position: 'asc' }, include: { _count: { select: { sends: true, orders: true } } } }),
      this.prisma.product.findFirst({ where: { active: true } }),
      this.enabled(),
      this.prisma.order.groupBy({ by: ['downsellStepId'], where: { downsellStepId: { not: null }, status: 'pago' }, _count: { _all: true }, _sum: { amountCents: true } }),
    ])
    const paidByStep = new Map(paid.map((row) => [row.downsellStepId, row]))
    return {
      enabled,
      productPriceCents: product?.priceCents ?? null,
      steps: steps.map((step) => ({
        id: step.id,
        position: step.position,
        delayMinutes: step.delayMinutes,
        message: step.message,
        priceCents: step.priceCents,
        active: step.active,
        sent: step._count.sends,
        orders: step._count.orders,
        paid: paidByStep.get(step.id)?._count._all ?? 0,
        paidCents: paidByStep.get(step.id)?._sum.amountCents ?? 0,
      })),
    }
  }

  /** Grava o fluxo inteiro de uma vez. Passo que saiu da lista é apagado; a ordem da lista vira a ordem do fluxo. */
  async save(adminId: string, body: { enabled?: unknown; steps?: unknown }) {
    const checked = validateDownsell(body?.steps)
    if (!checked.ok) return { error: checked.error }
    const before = await this.prisma.downsellStep.findMany({ select: { id: true } })
    const known = new Set(before.map((step) => step.id))
    const kept = checked.steps.flatMap((step) => (step.id && known.has(step.id) ? [step.id] : []))
    await this.prisma.$transaction(async (tx) => {
      await tx.downsellStep.deleteMany({ where: { id: { notIn: kept } } })
      for (const [index, step] of checked.steps.entries()) {
        const data = { position: index + 1, delayMinutes: step.delayMinutes, message: step.message, priceCents: step.priceCents, active: step.active }
        if (step.id && known.has(step.id)) await tx.downsellStep.update({ where: { id: step.id }, data })
        else await tx.downsellStep.create({ data })
      }
    })
    const enabled = body?.enabled === true
    await this.settings.set('downsell_enabled', enabled ? '1' : '0')
    await this.settings.audit(adminId, 'update', 'downsell', 'flow', { steps: before.length }, { enabled, steps: checked.steps.length })
    return this.view()
  }

  /** Roda a cada minuto: manda, para cada pessoa que gerou PIX e não pagou, o passo que venceu. */
  async sweep() {
    if (!(await this.enabled())) return
    const token = await this.settings.get('telegram_token')
    if (!token) return
    const steps = await this.prisma.downsellStep.findMany({ where: { active: true }, orderBy: { position: 'asc' } })
    if (steps.length === 0) return
    const product = await this.prisma.product.findFirst({ where: { active: true } })
    if (!product) return
    const unpaid = { status: { in: UNPAID }, payment: { isNot: null } }
    const users = await this.prisma.user.findMany({
      where: { blocked: false, orders: { some: unpaid, none: { status: { in: SETTLED } } } },
      include: { orders: { where: unpaid, include: { payment: true }, orderBy: { createdAt: 'desc' }, take: 1 }, downsells: true },
    })
    const tg = new TelegramClient(token)
    const now = new Date()
    for (const user of users) {
      const latest = user.orders[0]
      const due = downsellDue({ enabled: true, settled: false, blocked: user.blocked, pixGeneratedAt: latest?.payment?.createdAt ?? latest?.createdAt ?? null, steps, sent: user.downsells, now })
      const step = due && steps.find((item) => item.id === due.id)
      if (!step) continue
      try {
        await tg.call('sendMessage', {
          chat_id: user.telegramId,
          text: renderDownsell(step.message, { firstName: user.firstName, priceCents: step.priceCents ?? product.priceCents, fullPriceCents: product.priceCents }),
          reply_markup: { inline_keyboard: [[downsellButton(step)]] },
        })
        await this.prisma.downsellSend.create({ data: { userId: user.id, stepId: step.id } })
        await this.prisma.trackingEvent.create({ data: { userId: user.id, type: 'downsell_sent', orderId: latest?.id, origin: user.origin, campaignCode: user.campaignCode, metadata: { stepId: step.id, position: step.position } } })
      } catch (error) {
        if ((error as { blocked?: boolean }).blocked) await this.prisma.user.update({ where: { id: user.id }, data: { blocked: true } })
        else console.error('downsell', error)
      }
    }
  }
}
