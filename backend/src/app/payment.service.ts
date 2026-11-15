import { Injectable } from '@nestjs/common'
import { centsFromKavroAmount } from '../domain/money'
import { decideFromGateway, Environment } from '../domain/confirm-payment'
import { confirmPayment } from '../domain/confirm-payment'
import { feeFromCharge, KavroClient } from '../infra/kavro.client'
import { enqueueDelivery, enqueuePayment } from '../infra/queues'
import { PrismaService } from '../infra/prisma.service'
import { SettingsService } from './settings.service'

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  async acceptWebhook(deliveryId: string, rawBody: string, signatureHeader: string) {
    const existing = await this.prisma.paymentWebhook.findUnique({ where: { deliveryId } })
    if (existing) return { duplicate: true }
    let eventName = 'other'
    try {
      eventName = JSON.parse(rawBody).event || 'other'
    } catch {
      eventName = 'invalid'
    }
    await this.prisma.paymentWebhook.create({ data: { deliveryId, event: eventName, rawBody, signatureHeader } })
    await enqueuePayment(deliveryId)
    return { duplicate: false }
  }

  async processWebhook(deliveryId: string) {
    const row = await this.prisma.paymentWebhook.findUnique({ where: { deliveryId } })
    if (!row || row.processedAt) return
    let event: any
    try {
      event = JSON.parse(row.rawBody)
    } catch {
      await this.finish(row.id)
      return
    }
    const orderId = event.externalId || event.external_reference || event.metadata?.order_id
    const order = orderId
      ? await this.prisma.order.findUnique({ where: { id: String(orderId) }, include: { payment: true } })
      : null
    if (!order?.payment) {
      await this.finish(row.id)
      return
    }
    const secret = (await this.decryptPaymentSecret(order.payment.notificationSecret)) || (await this.settings.get('kavro_webhook_secret')) || ''
    const charge = await this.refetch(order.payment.gatewayChargeId)
    const gateway = this.gatewayView(charge, event)
    if (!charge) throw new Error('consulta da cobrança falhou')
    const decision = confirmPayment({
      rawBody: row.rawBody,
      signatureHeader: row.signatureHeader,
      secret,
      nowEpochSeconds: Math.floor(Date.now() / 1000),
      deliveryId,
      processedDeliveryIds: [],
      expectedEnvironment: order.payment.environment as Environment,
      eventEnvironment: gateway.environment,
      eventName: this.eventName(event.event),
      orderStatus: order.status as any,
      orderAmountCents: order.amountCents,
      gatewayStatus: gateway.status,
      gatewayAmount: gateway.amount,
      alreadyLiquidated: order.status === 'pago' || order.status === 'reembolsado',
    })
    if (decision.action === 'reject_signature') throw new Error('assinatura inválida')
    if (decision.action !== 'reject_environment') await this.apply(order.id, decision, charge)
    await this.finish(row.id)
  }

  async reconcile(orderId: string, adminId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } })
    if (!order?.payment?.gatewayChargeId) return { error: 'Pedido sem cobrança' as const }
    const before = order.status
    const charge = await this.refetch(order.payment.gatewayChargeId)
    const gateway = this.gatewayView(charge, {})
    const decision = decideFromGateway({
      eventName: gateway.status === 'paid' ? 'payment.paid' : gateway.status === 'expired' ? 'payment.expired' : gateway.status === 'refunded' ? 'payment.refunded' : 'other',
      orderStatus: order.status as any,
      orderAmountCents: order.amountCents,
      gatewayStatus: gateway.status,
      gatewayAmount: gateway.amount,
      alreadyLiquidated: order.status === 'pago' || order.status === 'reembolsado',
    })
    await this.apply(order.id, decision, charge)
    await this.settings.audit(adminId, 'reconcile', 'order', orderId, { status: before }, { decision: decision.action })
    return { decision: decision.action }
  }

  async consult(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } })
    if (!order?.payment?.gatewayChargeId) return { action: 'noop' as const }
    if (order.lastStatusCheckAt && Date.now() - order.lastStatusCheckAt.getTime() < 15_000) return { action: 'rate_limited' as const }
    await this.prisma.order.update({ where: { id: orderId }, data: { lastStatusCheckAt: new Date() } })
    const charge = await this.refetch(order.payment.gatewayChargeId)
    const gateway = this.gatewayView(charge, {})
    const decision = decideFromGateway({
      eventName: gateway.status === 'paid' ? 'payment.paid' : gateway.status === 'expired' ? 'payment.expired' : gateway.status === 'refunded' ? 'payment.refunded' : 'other',
      orderStatus: order.status as any,
      orderAmountCents: order.amountCents,
      gatewayStatus: gateway.status,
      gatewayAmount: gateway.amount,
      alreadyLiquidated: order.status === 'pago' || order.status === 'reembolsado',
    })
    await this.apply(order.id, decision, charge)
    return decision
  }

  private async apply(orderId: string, decision: { action: string; enqueueDelivery?: true }, charge: any) {
    const fees = feeFromCharge(charge || {})
    if (decision.action === 'mark_paid') {
      const updated = await this.prisma.order.updateMany({
        where: { id: orderId, status: { in: ['criado', 'aguardando_pagamento', 'em_analise'] } },
        data: { status: 'pago' },
      })
      if (updated.count === 0) return
      const paidAt = charge?.paid_at ? new Date(charge.paid_at) : new Date()
      await this.prisma.payment.update({
        where: { orderId },
        data: { status: 'pago', feeCents: fees.feeCents, netCents: fees.netCents, feeSource: fees.feeSource, paidAt },
      })
      const payment = await this.prisma.payment.findUnique({ where: { orderId } })
      if (payment) {
        await this.prisma.paymentFee.create({ data: { paymentId: payment.id, amountCents: fees.feeCents, source: fees.feeSource } })
      }
      await this.prisma.delivery.create({ data: { orderId, status: 'pendente' } }).catch(() => undefined)
      await this.track(orderId, 'payment_approved')
      await this.track(orderId, 'delivery_started')
      await enqueueDelivery(orderId)
    } else if (decision.action === 'mark_expired') {
      const updated = await this.prisma.order.updateMany({ where: { id: orderId, status: 'aguardando_pagamento' }, data: { status: 'expirado' } })
      if (updated.count === 0) return
      await this.prisma.payment.update({ where: { orderId }, data: { status: 'expirado' } })
      await this.track(orderId, 'payment_expired')
    } else if (decision.action === 'mark_refunded') {
      const updated = await this.prisma.order.updateMany({ where: { id: orderId, status: 'pago' }, data: { status: 'reembolsado' } })
      if (updated.count === 0) return
      const payment = await this.prisma.payment.update({ where: { orderId }, data: { status: 'reembolsado' } })
      await this.prisma.refund.create({
        data: { paymentId: payment.id, amountCents: payment.amountCents, refundedAt: charge?.refunded_at ? new Date(charge.refunded_at) : new Date() },
      }).catch(() => undefined)
      await this.track(orderId, 'payment_refunded')
    } else if (decision.action === 'under_review') {
      await this.prisma.order.updateMany({ where: { id: orderId, status: { in: ['aguardando_pagamento', 'criado'] } }, data: { status: 'em_analise' } })
      await this.prisma.payment.update({ where: { orderId }, data: { status: 'em_analise' } })
      await this.settings.audit(null, 'amount_mismatch', 'order', orderId, null, { gatewayAmount: charge?.amount })
    }
  }

  private async track(orderId: string, type: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return
    await this.prisma.trackingEvent.create({
      data: { userId: order.userId, type, orderId, origin: order.origin, campaignCode: order.campaignCode },
    })
  }

  private async refetch(chargeId: string | null) {
    if (!chargeId) return null
    const key = await this.settings.get('kavro_api_key')
    if (!key) return null
    return new KavroClient(key).getCharge(chargeId)
  }

  private gatewayView(charge: any, event: any) {
    const statusRaw = String(charge?.status || event.status || '').toLowerCase()
    const status = ['waiting_payment', 'paid', 'expired', 'refunded'].includes(statusRaw) ? statusRaw : 'other'
    const environment: Environment = charge?.environment === 'sandbox' || charge?.livemode === false || event.environment === 'sandbox' || event.livemode === false ? 'sandbox' : 'live'
    const amount = charge?.amount ?? event.amount ?? '0'
    return { status: status as 'waiting_payment' | 'paid' | 'expired' | 'refunded' | 'other', environment, amount }
  }

  private eventName(name: string) {
    if (name === 'payment.paid' || name === 'payment.confirmed' || name === 'payment.expired' || name === 'payment.refunded') return name
    return 'other' as const
  }

  private async decryptPaymentSecret(stored: string | null) {
    if (!stored) return null
    const { decryptSettings } = await import('../domain/cipher')
    const { settingsKey } = await import('../infra/env')
    return decryptSettings(stored, settingsKey())
  }

  private finish(id: string) {
    return this.prisma.paymentWebhook.update({ where: { id }, data: { processedAt: new Date() } })
  }

  cents(amount: string | number) {
    return centsFromKavroAmount(amount)
  }
}
