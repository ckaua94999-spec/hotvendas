import { Injectable } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { periodRange } from '../domain/calendar'
import { funnelCounts } from '../domain/funnel'
import { summarizeFinance, FinancePayment } from '../domain/finance'
import { buildSeries } from '../domain/timeseries'
import { maskSecret } from '../domain/cipher'
import { PrismaService } from '../infra/prisma.service'
import { SettingsService, TEXT_DEFAULTS } from './settings.service'

const STAGES = ['bot_started', 'presentation_sent', 'purchase_clicked', 'pix_generated', 'payment_approved', 'delivery_completed']
const CATEGORIES = ['hospedagem', 'vps', 'ferramentas', 'servicos', 'marketing', 'outras']

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  range(query: { preset?: string; from?: string; to?: string }) {
    return periodRange(query.preset || 'hoje', new Date(), { from: query.from, to: query.to })
  }

  async dashboard(query: { preset?: string; from?: string; to?: string }) {
    const { from, to } = this.range(query)
    const where = { createdAt: { gte: from, lt: to } }
    const [started, presentation, clicks, approvedUsers, uniqueUsers, pixGenerated, pixPending, pixExpired, paymentsApproved, paymentsRefunded, deliveriesCompleted, deliveriesFailed, finance] = await Promise.all([
      this.distinct('bot_started', from, to),
      this.distinct('presentation_sent', from, to),
      this.prisma.trackingEvent.count({ where: { type: 'purchase_clicked', ...where } }),
      this.distinct('payment_approved', from, to),
      this.prisma.user.count({ where: { firstSeenAt: { gte: from, lt: to } } }),
      this.prisma.payment.count({ where }),
      this.prisma.order.count({ where: { status: 'aguardando_pagamento', ...where } }),
      this.prisma.order.count({ where: { status: 'expirado', ...where } }),
      this.prisma.payment.count({ where: { paidAt: { gte: from, lt: to } } }),
      this.prisma.refund.count({ where: { refundedAt: { gte: from, lt: to } } }),
      this.prisma.delivery.count({ where: { status: 'concluida', completedAt: { gte: from, lt: to } } }),
      this.prisma.delivery.count({ where: { status: 'falha', order: { createdAt: { gte: from, lt: to } } } }),
      this.finance(query),
    ])
    return {
      usersStarted: started,
      uniqueUsers,
      presentationSent: presentation,
      purchaseClicks: clicks,
      pixGenerated,
      pixPending,
      pixExpired,
      paymentsApproved,
      paymentsRefunded,
      deliveriesCompleted,
      deliveriesFailed,
      conversionPercent: started === 0 ? 0 : Math.round((approvedUsers / started) * 1000) / 10,
      finance,
    }
  }

  async funnel(query: { preset?: string; from?: string; to?: string }) {
    const { from, to } = this.range(query)
    const events = await this.prisma.trackingEvent.findMany({ where: { createdAt: { gte: from, lt: to }, type: { in: STAGES } }, select: { userId: true, type: true } })
    return funnelCounts(events)
  }

  async users(q?: string) {
    const query = (q || '').trim()
    const users = await this.prisma.user.findMany({
      where: query
        ? { OR: [{ telegramId: { contains: query } }, { username: { contains: query, mode: 'insensitive' } }, { firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }] }
        : undefined,
      include: { events: { select: { type: true } }, orders: { include: { payment: true, delivery: true } } },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    })
    return users.map((user) => {
      const reached = STAGES.filter((type) => user.events.some((event) => event.type === type))
      const paid = user.orders.filter((order) => order.payment?.paidAt)
      return {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
        firstSeenAt: user.firstSeenAt,
        lastSeenAt: user.lastSeenAt,
        origin: user.origin,
        campaignCode: user.campaignCode,
        stage: reached.at(-1) || 'nenhuma',
        pixCount: user.orders.filter((order) => order.payment).length,
        paymentCount: paid.length,
        totalCents: paid.reduce((sum, order) => sum + order.amountCents, 0),
        deliveryStatus: user.orders.at(-1)?.delivery?.status || 'sem_entrega',
      }
    })
  }

  async campaigns(query: { preset?: string; from?: string; to?: string }) {
    const { from, to } = this.range(query)
    const users = await this.prisma.user.findMany({ where: { firstSeenAt: { gte: from, lt: to } }, include: { orders: { include: { payment: true } } } })
    const grouped = new Map<string, { origin: string; started: number; pix: number; paid: number; grossCents: number }>()
    for (const user of users) {
      const row = grouped.get(user.origin) || { origin: user.origin, started: 0, pix: 0, paid: 0, grossCents: 0 }
      row.started += 1
      row.pix += user.orders.filter((order) => order.payment).length
      for (const order of user.orders) {
        if (order.payment?.paidAt) {
          row.paid += 1
          row.grossCents += order.amountCents
        }
      }
      grouped.set(user.origin, row)
    }
    return [...grouped.values()].map((row) => ({ ...row, conversionPercent: row.started === 0 ? 0 : Math.round((row.paid / row.started) * 1000) / 10 }))
  }

  async recovery() {
    const users = await this.prisma.user.findMany({ include: { orders: { include: { payment: true } }, recoveries: true }, orderBy: { lastSeenAt: 'desc' }, take: 300 })
    return users.map((user) => ({
      telegramId: user.telegramId,
      username: user.username,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      blocked: user.blocked,
      paid: user.orders.some((order) => order.status === 'pago'),
      waiting: user.orders.some((order) => order.status === 'aguardando_pagamento'),
      expired: user.orders.some((order) => order.status === 'expirado'),
      sent: user.recoveries.map((item) => item.stage),
    }))
  }

  async orders(query: { preset?: string; from?: string; to?: string; status?: string }) {
    const { from, to } = this.range(query)
    return this.prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to }, ...(query.status ? { status: query.status } : {}) },
      include: { user: true, payment: true, delivery: true, product: true, downsellStep: { select: { position: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }

  async order(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { user: true, payment: { include: { fees: true, refund: true } }, delivery: { include: { attemptsLog: true } }, events: true, product: true, downsellStep: { select: { position: true, priceCents: true } } },
    })
  }

  async finance(query: { preset?: string; from?: string; to?: string }) {
    const { from, to } = this.range(query)
    const payments = await this.prisma.payment.findMany({
      where: { OR: [{ paidAt: { gte: from, lt: to } }, { refund: { refundedAt: { gte: from, lt: to } } }] },
      include: { refund: true },
    })
    const expenses = await this.prisma.expense.findMany({ where: { occurredOn: { gte: from, lt: to } } })
    return summarizeFinance(this.financeRows(payments), expenses.reduce((sum, expense) => sum + expense.amountCents, 0))
  }

  private financeRows<T extends { status: string; amountCents: number; feeCents: number | null; netCents: number | null; feeSource: string }>(payments: T[]): (FinancePayment & { source: T })[] {
    return payments
      .filter((payment) => payment.status === 'pago' || payment.status === 'reembolsado')
      .map((payment) => ({
        amountCents: payment.amountCents,
        feeCents: payment.feeCents,
        netCents: payment.netCents,
        feeSource: payment.feeSource === 'gateway' ? 'gateway' as const : 'nao_informada' as const,
        status: payment.status === 'reembolsado' ? 'reembolsado' as const : 'pago' as const,
        source: payment,
      }))
  }

  /** Movimento do período em intervalos, para os gráficos. Mesmas regras do dashboard e do resumo financeiro. */
  async series(query: { preset?: string; from?: string; to?: string }) {
    const { from, to } = this.range(query)
    const inRange = { gte: from, lt: to }
    const [users, pix, payments, expenses] = await Promise.all([
      this.prisma.user.findMany({ where: { firstSeenAt: inRange }, select: { firstSeenAt: true } }),
      this.prisma.payment.findMany({ where: { createdAt: inRange }, select: { createdAt: true } }),
      this.prisma.payment.findMany({ where: { OR: [{ paidAt: inRange }, { refund: { refundedAt: inRange } }] }, include: { refund: true } }),
      this.prisma.expense.findMany({ where: { occurredOn: inRange }, select: { occurredOn: true, amountCents: true, category: true } }),
    ])
    const series = buildSeries({ from, to }, {
      users: users.map((user) => user.firstSeenAt),
      pix: pix.map((payment) => payment.createdAt),
      paid: payments.flatMap((payment) => (payment.paidAt ? [payment.paidAt] : [])),
      payments: this.financeRows(payments).map(({ source, ...row }) => ({ ...row, paidAt: source.paidAt, refundedAt: source.refund?.refundedAt ?? null })),
      expenses,
    }, new Date())
    const byCategory = new Map<string, number>()
    for (const expense of expenses) byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + expense.amountCents)
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ...series,
      expensesByCategory: [...byCategory.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents),
    }
  }

  async transactions(query: { preset?: string; from?: string; to?: string; status?: string; q?: string }) {
    const { from, to } = this.range(query)
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { order: { user: { OR: [{ telegramId: { contains: query.q } }, { username: { contains: query.q, mode: 'insensitive' } }] } } } : {}),
      },
      include: { order: { include: { user: true, delivery: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return payments.map((payment) => ({
      orderId: payment.orderId,
      gatewayChargeId: payment.gatewayChargeId,
      telegramId: payment.order.user.telegramId,
      amountCents: payment.amountCents,
      feeCents: payment.feeCents,
      netCents: payment.netCents,
      feeSource: payment.feeSource,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
      status: payment.status,
      deliveryStatus: payment.order.delivery?.status || 'sem_entrega',
      origin: payment.order.origin,
    }))
  }

  async expenses() {
    return this.prisma.expense.findMany({ orderBy: { occurredOn: 'desc' }, take: 200 })
  }

  async saveExpense(adminId: string, input: { description: string; category: string; amountCents: number; occurredOn: string; notes?: string }, id?: string) {
    if (!CATEGORIES.includes(input.category)) return { error: 'Categoria inválida' as const }
    const data = { description: input.description, category: input.category, amountCents: input.amountCents, occurredOn: new Date(input.occurredOn), notes: input.notes || '' }
    const expense = id ? await this.prisma.expense.update({ where: { id }, data }) : await this.prisma.expense.create({ data })
    await this.settings.audit(adminId, id ? 'update' : 'create', 'expense', expense.id, null, data)
    return expense
  }

  async deleteExpense(adminId: string, id: string) {
    const before = await this.prisma.expense.delete({ where: { id } })
    await this.settings.audit(adminId, 'delete', 'expense', id, before, null)
  }

  async settingsView() {
    const product = await this.prisma.product.findFirst({ orderBy: { active: 'desc' } })
    const messages: Record<string, string | null> = {}
    for (const key of Object.keys(TEXT_DEFAULTS)) messages[key] = await this.settings.get(key)
    return { product, messages, secrets: await this.settings.maskedSecrets() }
  }

  async saveSettings(adminId: string, body: any) {
    if (body.product) {
      const current = await this.prisma.product.findFirst({ orderBy: { active: 'desc' } })
      const data = {
        name: String(body.product.name || 'Produto'),
        description: String(body.product.description || ''),
        priceCents: Number(body.product.priceCents || 0),
        active: Boolean(body.product.active),
        accessInstructions: String(body.product.accessInstructions || ''),
      }
      if (data.active) await this.prisma.product.updateMany({ data: { active: false } })
      const product = current ? await this.prisma.product.update({ where: { id: current.id }, data }) : await this.prisma.product.create({ data })
      await this.settings.audit(adminId, 'update', 'product', product.id, current, product)
    }
    const map: Record<string, string | undefined> = {
      msg_welcome: body.messages?.welcome,
      msg_payment: body.messages?.payment,
      msg_approval: body.messages?.approval,
      msg_delivery: body.messages?.delivery,
      msg_support: body.messages?.support,
      support_url: body.messages?.supportUrl,
      pix_expires_minutes: body.pixExpiresMinutes != null ? String(body.pixExpiresMinutes) : undefined,
      recovery_no_pix_minutes: body.recovery?.noPixMinutes != null ? String(body.recovery.noPixMinutes) : undefined,
      recovery_unpaid_minutes: body.recovery?.unpaidMinutes != null ? String(body.recovery.unpaidMinutes) : undefined,
      recovery_expired_minutes: body.recovery?.expiredMinutes != null ? String(body.recovery.expiredMinutes) : undefined,
      recovery_no_pix_enabled: body.recovery?.noPixEnabled != null ? (body.recovery.noPixEnabled ? '1' : '0') : undefined,
      recovery_unpaid_enabled: body.recovery?.unpaidEnabled != null ? (body.recovery.unpaidEnabled ? '1' : '0') : undefined,
      recovery_expired_enabled: body.recovery?.expiredEnabled != null ? (body.recovery.expiredEnabled ? '1' : '0') : undefined,
      recovery_no_pix_text: body.recovery?.noPixText,
      recovery_unpaid_text: body.recovery?.unpaidText,
      recovery_expired_text: body.recovery?.expiredText,
      telegram_token: body.secrets?.telegramToken || undefined,
      kavro_api_key: body.secrets?.kavroApiKey || undefined,
      kavro_webhook_secret: body.secrets?.kavroWebhookSecret || undefined,
    }
    for (const [key, value] of Object.entries(map)) {
      if (value != null && value !== '') await this.settings.set(key, value)
    }
    await this.settings.audit(adminId, 'update', 'settings', 'app', null, { secrets: maskSecret('salvo') })
    return this.settingsView()
  }

  async csv(resource: string, query: any) {
    const rows = await this.table(resource, query)
    const lines = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
    return `\uFEFF${lines.join('\n')}`
  }

  async xlsx(resource: string, query: any) {
    const rows = await this.table(resource, query)
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet(resource)
    rows.forEach((row) => sheet.addRow(row))
    return Buffer.from(await book.xlsx.writeBuffer())
  }

  private async table(resource: string, query: any): Promise<string[][]> {
    if (resource === 'transactions') {
      const rows = await this.transactions(query)
      return [['pedido', 'gateway', 'telegram', 'valor', 'taxa', 'liquido', 'origem_taxa', 'criado', 'pago', 'status', 'entrega', 'origem'], ...rows.map((row) => [row.orderId, row.gatewayChargeId || '', row.telegramId, String(row.amountCents), String(row.feeCents ?? ''), String(row.netCents ?? ''), row.feeSource, row.createdAt.toISOString(), row.paidAt?.toISOString() || '', row.status, row.deliveryStatus, row.origin])]
    }
    if (resource === 'users') {
      const rows = await this.users(query.q)
      return [['telegram', 'username', 'nome', 'origem', 'etapa', 'pix', 'pagamentos', 'total'], ...rows.map((row) => [row.telegramId, row.username || '', row.name, row.origin, row.stage, String(row.pixCount), String(row.paymentCount), String(row.totalCents)])]
    }
    const rows = await this.funnel(query)
    return [['etapa', 'usuarios', 'percentual_inicio', 'percentual_anterior', 'perdidos'], ...rows.map((row) => [row.label, String(row.users), String(row.percentOfStart), String(row.percentOfPrevious), String(row.dropped)])]
  }

  private async distinct(type: string, from: Date, to: Date) {
    const rows = await this.prisma.trackingEvent.findMany({ where: { type, createdAt: { gte: from, lt: to } }, distinct: ['userId'], select: { userId: true } })
    return rows.length
  }
}
