import { readFile } from 'fs/promises'
import { Injectable } from '@nestjs/common'
import { customerName, parseStartPayload } from '../domain/attribution'
import { canReprocess, nextDeliveryDelayMs } from '../domain/delivery'
import { toKavroAmount } from '../domain/money'
import { reduceTelegram } from '../domain/telegram-flow'
import { encryptSettings } from '../domain/cipher'
import { environmentFromKey, KavroClient } from '../infra/kavro.client'
import { publicBaseUrl, settingsKey } from '../infra/env'
import { enqueueDelivery } from '../infra/queues'
import { PrismaService } from '../infra/prisma.service'
import { TelegramClient } from '../infra/telegram.client'
import { PaymentService } from './payment.service'
import { SettingsService } from './settings.service'

@Injectable()
export class BotService {
  private offset = 0
  constructor(private prisma: PrismaService, private settings: SettingsService, private payments: PaymentService) {}

  async pollOnce() {
    const token = await this.settings.get('telegram_token')
    if (!token) return
    const client = new TelegramClient(token)
    const updates = await client.call('getUpdates', { offset: this.offset, timeout: 0 })
    for (const update of updates || []) {
      this.offset = update.update_id + 1
      await this.handle(update).catch((error) => console.error('telegram', error))
    }
  }

  async handle(update: any) {
    const message = update.message
    const callback = update.callback_query
    const from = message?.from || callback?.from
    if (!from) return
    const chatId = String(message?.chat?.id || callback?.message?.chat?.id)
    const text = message?.text || ''
    const data = callback?.data || null
    const token = await this.settings.get('telegram_token')
    if (!token) return
    const tg = new TelegramClient(token)
    const user = await this.ensureUser(from, text)
    const paid = await this.prisma.order.findFirst({ where: { userId: user.id, status: 'pago' } })
    const waiting = await this.prisma.order.findFirst({
      where: { userId: user.id, status: { in: ['aguardando_pagamento', 'em_analise'] } },
      include: { payment: true },
      orderBy: { createdAt: 'desc' },
    })
    const reduced = reduceTelegram({ text, callback: data, hasPaidAccess: Boolean(paid), hasWaitingCharge: Boolean(waiting) })
    if (callback?.id) await tg.call('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => undefined)
    for (const effect of reduced.effects) {
      if (effect.type === 'send_presentation') await this.presentation(tg, chatId, user.id)
      if (effect.type === 'send_pitch') await this.pitch(tg, chatId)
      if (effect.type === 'send_existing_access') await tg.call('sendMessage', { chat_id: chatId, text: 'Você já tem acesso. Use /meuacesso se quiser receber o conteúdo de novo.' })
      if (effect.type === 'open_checkout') await this.checkout(tg, chatId, user)
      if (effect.type === 'open_downsell') await this.checkout(tg, chatId, user, effect.stepId)
      if (effect.type === 'check_status') await this.status(tg, chatId, waiting)
      if (effect.type === 'copy_pix') await this.copy(tg, chatId, waiting)
      if (effect.type === 'resend_access') await this.resend(tg, chatId, paid)
      if (effect.type === 'send_support') await this.support(tg, chatId)
      if (effect.type === 'cancel_flow') await this.cancel(tg, chatId, user.id, waiting)
    }
    if (!reduced.effects.length && reduced.reply) await tg.call('sendMessage', { chat_id: chatId, text: reduced.reply })
  }

  private async ensureUser(from: any, text: string) {
    const telegramId = String(from.id)
    const existing = await this.prisma.user.findUnique({ where: { telegramId } })
    const payload = text.trim().split(/\s+/).slice(1).join(' ')
    const start = text.trim().startsWith('/start')
    const attributed = start ? parseStartPayload(payload || undefined) : null
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { username: from.username || existing.username, firstName: from.first_name || existing.firstName, lastName: from.last_name || existing.lastName, lastSeenAt: new Date() },
        })
      : await this.prisma.user.create({
          data: {
            telegramId,
            username: from.username,
            firstName: from.first_name,
            lastName: from.last_name,
            origin: attributed?.origin || 'direto',
            campaignCode: attributed?.campaignCode || 'direto',
          },
        })
    if (attributed && attributed.campaignCode !== 'direto') {
      await this.prisma.campaign.upsert({ where: { code: attributed.campaignCode }, create: { code: attributed.campaignCode, name: attributed.campaignCode }, update: {} })
    }
    if (start) {
      await this.prisma.trackingEvent.create({
        data: { userId: user.id, type: 'bot_started', origin: attributed?.origin || user.origin, campaignCode: attributed?.campaignCode || user.campaignCode },
      })
    }
    return user
  }

  private async presentation(tg: TelegramClient, chatId: string, userId: string) {
    const product = await this.prisma.product.findFirst({ where: { active: true } })
    if (!product?.presentationFileId && !product?.presentationPath) return
    if (product.presentationFileId) await tg.call('sendVideo', { chat_id: chatId, video: product.presentationFileId })
    else if (product.presentationPath) {
      const file = await readFile(product.presentationPath)
      const result = await tg.sendVideoFile(chatId, file, 'apresentacao.mp4', '')
      if (result?.video?.file_id) await this.prisma.product.update({ where: { id: product.id }, data: { presentationFileId: result.video.file_id } })
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user) await this.prisma.trackingEvent.create({ data: { userId, type: 'presentation_sent', origin: user.origin, campaignCode: user.campaignCode } })
  }

  private async pitch(tg: TelegramClient, chatId: string) {
    const text = (await this.settings.get('msg_welcome')) || ''
    await tg.call('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: 'QUERO COMPRAR AGORA', callback_data: 'buy' }]] },
    })
  }

  /** Gera o PIX. Vindo de um botão de downsell, o pedido nasce com o preço daquele passo e guarda de qual passo veio. */
  private async checkout(tg: TelegramClient, chatId: string, user: { id: string; firstName: string | null; lastName: string | null; origin: string; campaignCode: string; telegramId: string }, downsellStepId?: string) {
    const product = await this.prisma.product.findFirst({ where: { active: true } })
    if (!product) {
      await tg.call('sendMessage', { chat_id: chatId, text: 'O produto ainda não está disponível.' })
      return
    }
    const step = downsellStepId ? await this.prisma.downsellStep.findUnique({ where: { id: downsellStepId } }) : null
    if (downsellStepId && (!step || !step.active)) {
      await tg.call('sendMessage', { chat_id: chatId, text: 'Esta oferta não está mais disponível. Use /comprar para ver o valor atual.' })
      return
    }
    const amountCents = step?.priceCents ?? product.priceCents
    await this.prisma.trackingEvent.create({ data: { userId: user.id, type: 'purchase_clicked', origin: user.origin, campaignCode: user.campaignCode } })
    const order = await this.prisma.order.create({
      data: { userId: user.id, productId: product.id, amountCents, status: 'criado', origin: user.origin, campaignCode: user.campaignCode, downsellStepId: step?.id },
    })
    if (step) {
      await this.prisma.trackingEvent.create({ data: { userId: user.id, type: 'downsell_clicked', orderId: order.id, origin: user.origin, campaignCode: user.campaignCode, metadata: { stepId: step.id, position: step.position } } })
    }
    const key = await this.settings.get('kavro_api_key')
    if (!key) {
      await tg.call('sendMessage', { chat_id: chatId, text: 'O pagamento ainda não está configurado.' })
      return
    }
    const expires = Number((await this.settings.get('pix_expires_minutes')) || 30)
    const payload: Record<string, unknown> = {
      amount: toKavroAmount(amountCents),
      description: product.name,
      externalId: order.id,
      expiresInMinutes: expires,
      customer: { name: customerName(user.firstName || undefined, user.lastName || undefined) },
      metadata: { order_id: order.id, telegram_id: user.telegramId, campaign: user.campaignCode },
    }
    if (publicBaseUrl()) payload.notification_url = `${publicBaseUrl()}/api/webhooks/kavro`
    try {
      const charge = await new KavroClient(key).createCharge(order.id, payload)
      const secret = charge.notification_secret ? encryptSettings(String(charge.notification_secret), settingsKey()) : null
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          gatewayChargeId: charge.id,
          status: 'aguardando_pagamento',
          amountCents,
          feeCents: charge.fee == null ? null : undefined,
          feeSource: charge.fee == null ? 'nao_informada' : 'gateway',
          environment: charge.environment === 'sandbox' || charge.livemode === false ? 'sandbox' : environmentFromKey(key),
          pixCopyPaste: charge.pix_copy_paste,
          qrCodeBase64: charge.qr_code_base64,
          notificationSecret: secret,
          expiresAt: charge.expires_at ? new Date(charge.expires_at) : null,
          externalId: order.id,
        },
      })
      if (charge.fee != null) {
        const payment = await this.prisma.payment.findUnique({ where: { orderId: order.id } })
        const { feeFromCharge } = await import('../infra/kavro.client')
        const fees = feeFromCharge(charge)
        if (payment) {
          await this.prisma.payment.update({ where: { id: payment.id }, data: { feeCents: fees.feeCents, netCents: fees.netCents, feeSource: fees.feeSource } })
          await this.prisma.paymentFee.create({ data: { paymentId: payment.id, amountCents: fees.feeCents, source: fees.feeSource } })
        }
      }
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'aguardando_pagamento' } })
      await this.prisma.trackingEvent.create({ data: { userId: user.id, type: 'pix_generated', orderId: order.id, origin: user.origin, campaignCode: user.campaignCode } })
      await this.prisma.trackingEvent.create({ data: { userId: user.id, type: 'payment_pending', orderId: order.id, origin: user.origin, campaignCode: user.campaignCode } })
      await this.sendPix(tg, chatId, amountCents, charge)
    } catch (error) {
      await tg.call('sendMessage', { chat_id: chatId, text: 'Não consegui gerar o PIX agora. Tente de novo em instantes.' })
      console.error(error)
    }
  }

  private async sendPix(tg: TelegramClient, chatId: string, amountCents: number, charge: any) {
    const note = (await this.settings.get('msg_payment')) || ''
    const expires = charge.expires_at ? new Date(charge.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'em alguns minutos'
    const caption = `${note}\n\nValor: ${toKavroAmount(amountCents).replace('.', ',')}\nVálido até: ${expires}`
    const raw = String(charge.qr_code_base64 || '')
    const base64 = raw.includes(',') ? raw.split(',')[1] : raw
    if (base64) await tg.sendPhoto(chatId, Buffer.from(base64, 'base64'), caption).catch(() => tg.call('sendMessage', { chat_id: chatId, text: caption }))
    else await tg.call('sendMessage', { chat_id: chatId, text: caption })
    const code = String(charge.pix_copy_paste || '')
    await tg.call('sendMessage', {
      chat_id: chatId,
      text: `PIX copia e cola:\n<code>${escapeHtml(code)}</code>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Copiar PIX', callback_data: 'copy' }], [{ text: 'Já paguei', callback_data: 'paid' }]] },
    })
  }

  private async status(tg: TelegramClient, chatId: string, waiting: { id: string; payment: { pixCopyPaste: string | null } | null } | null) {
    if (!waiting) {
      await tg.call('sendMessage', { chat_id: chatId, text: 'Você não tem um PIX em aberto.' })
      return
    }
    const decision = await this.payments.consult(waiting.id)
    const text =
      decision.action === 'rate_limited'
        ? 'Aguarde alguns segundos para consultar de novo.'
        : decision.action === 'mark_paid'
          ? 'Pagamento confirmado. Estou enviando seu acesso.'
          : decision.action === 'mark_expired'
            ? 'Este PIX expirou. Use /comprar para gerar outro.'
            : decision.action === 'under_review'
              ? 'Pagamento em análise. O valor não fechou com o pedido.'
              : decision.action === 'mark_refunded'
                ? 'Este pagamento foi reembolsado.'
                : 'Ainda não identificamos o pagamento. A confirmação é automática.'
    await tg.call('sendMessage', { chat_id: chatId, text })
  }

  private async copy(tg: TelegramClient, chatId: string, waiting: { payment: { pixCopyPaste: string | null } | null } | null) {
    const code = waiting?.payment?.pixCopyPaste
    if (!code) {
      await tg.call('sendMessage', { chat_id: chatId, text: 'Não há código PIX para copiar.' })
      return
    }
    await tg.call('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `<code>${escapeHtml(code)}</code>` })
  }

  private async resend(tg: TelegramClient, chatId: string, paid: { id: string } | null) {
    if (!paid) return
    await enqueueDelivery(paid.id)
    await tg.call('sendMessage', { chat_id: chatId, text: 'Vou reenviar seu conteúdo.' })
  }

  private async support(tg: TelegramClient, chatId: string) {
    const text = (await this.settings.get('msg_support')) || ''
    const url = await this.settings.get('support_url')
    await tg.call('sendMessage', { chat_id: chatId, text: url ? `${text}\n${url}` : text })
  }

  private async cancel(tg: TelegramClient, chatId: string, userId: string, waiting: { id: string; payment: unknown } | null) {
    if (waiting?.payment) {
      await tg.call('sendMessage', { chat_id: chatId, text: 'O PIX já gerado continua válido até expirar ou ser pago. /cancelar não apaga a cobrança.' })
      return
    }
    await this.prisma.order.updateMany({ where: { userId, status: 'criado' }, data: { status: 'cancelado' } })
    await tg.call('sendMessage', { chat_id: chatId, text: 'Fluxo de compra cancelado.' })
  }

  async deliver(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { user: true, product: true, delivery: true } })
    if (!order || order.status !== 'pago') return
    if (!canReprocess(order.status) && order.status !== 'pago') return
    let delivery = order.delivery
    if (!delivery) delivery = await this.prisma.delivery.create({ data: { orderId, status: 'pendente' } })
    if (delivery.status === 'concluida' && delivery.attempts > 0 && order.delivery) {
      const token = await this.settings.get('telegram_token')
      if (!token) return
      await this.sendContent(new TelegramClient(token), order.user.telegramId, order.product, order.user.id, delivery.id, false)
      return
    }
    const token = await this.settings.get('telegram_token')
    if (!token) throw new Error('Token do Telegram ausente')
    const tg = new TelegramClient(token)
    try {
      await this.sendContent(tg, order.user.telegramId, order.product, order.user.id, delivery.id, true)
    } catch (error) {
      const blocked = Boolean((error as { blocked?: boolean }).blocked)
      if (blocked) await this.prisma.user.update({ where: { id: order.userId }, data: { blocked: true } })
      const attempts = delivery.attempts + 1
      const delay = nextDeliveryDelayMs(attempts)
      await this.prisma.delivery.update({
        where: { id: delivery.id },
        data: { attempts, status: delay ? 'pendente' : 'falha', lastError: (error as Error).message, nextAttemptAt: delay ? new Date(Date.now() + delay) : null },
      })
      await this.prisma.deliveryAttempt.create({ data: { deliveryId: delivery.id, status: 'falha', error: (error as Error).message } })
      await this.prisma.trackingEvent.create({ data: { userId: order.userId, type: 'delivery_failed', orderId, origin: order.origin, campaignCode: order.campaignCode } })
      if (delay) await enqueueDelivery(orderId, delay)
    }
  }

  private async sendContent(tg: TelegramClient, chatId: string, product: { id: string; deliveryFileId: string | null; deliveryPath: string | null; accessInstructions: string }, userId: string, deliveryId: string, recordSuccess: boolean) {
    const approval = (await this.settings.get('msg_approval')) || ''
    const instructions = product.accessInstructions || (await this.settings.get('msg_delivery')) || ''
    await tg.call('sendMessage', { chat_id: chatId, text: approval })
    let fileId = product.deliveryFileId
    if (fileId) await tg.call('sendVideo', { chat_id: chatId, video: fileId, caption: instructions })
    else if (product.deliveryPath) {
      const file = await readFile(product.deliveryPath)
      const result = await tg.sendVideoFile(chatId, file, 'conteudo.mp4', instructions)
      fileId = result?.video?.file_id || null
      if (fileId) await this.prisma.product.update({ where: { id: product.id }, data: { deliveryFileId: fileId } })
    } else {
      throw new Error('Vídeo de entrega não configurado')
    }
    await tg.call('sendMessage', {
      chat_id: chatId,
      text: 'Se precisar receber de novo, toque abaixo.',
      reply_markup: { inline_keyboard: [[{ text: 'Recuperar conteúdo', callback_data: 'access' }]] },
    })
    if (!recordSuccess) return
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } })
    if (delivery?.status === 'concluida') return
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'concluida', completedAt: new Date(), fileId, attempts: { increment: 1 }, lastError: null } })
    await this.prisma.deliveryAttempt.create({ data: { deliveryId, status: 'concluida' } })
    const order = await this.prisma.order.findFirst({ where: { delivery: { id: deliveryId } } })
    if (order) {
      await this.prisma.trackingEvent.create({ data: { userId, type: 'delivery_completed', orderId: order.id, origin: order.origin, campaignCode: order.campaignCode } })
    }
  }

  async reprocess(deliveryId: string, adminId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: true } })
    if (!delivery) return { error: 'Entrega não encontrada' as const }
    if (!canReprocess(delivery.order.status as any)) return { error: 'Pedido não está pago' as const }
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'pendente', attempts: 0, lastError: null, nextAttemptAt: null } })
    await this.settings.audit(adminId, 'reprocess', 'delivery', deliveryId, { status: delivery.status }, { status: 'pendente' })
    await enqueueDelivery(delivery.orderId)
    return { ok: true as const }
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
