import { createHash } from 'crypto'
import { Body, Controller, Post, Req } from '@nestjs/common'
import { BotService } from '../app/bot.service'
import { PaymentService } from '../app/payment.service'

@Controller()
export class HookController {
  constructor(private payments: PaymentService, private bot: BotService) {}

  @Post('webhooks/kavro')
  async kavro(@Req() req: any) {
    const raw = req.rawBody?.toString('utf8') || ''
    const signature = String(req.headers['x-kavro-signature'] || req.headers['x-kavropay-signature'] || '')
    const deliveryId = String(req.headers['x-kavro-delivery-id'] || createHash('sha256').update(signature + raw).digest('hex'))
    await this.payments.acceptWebhook(deliveryId, raw, signature)
    return { received: true }
  }

  @Post('telegram/webhook')
  async telegram(@Body() body: any) {
    await this.bot.handle(body)
    return { ok: true }
  }
}
