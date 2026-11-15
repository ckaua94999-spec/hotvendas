import 'reflect-metadata'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { NestFactory } from '@nestjs/core'

for (const path of [resolve(__dirname, '../.env'), resolve(__dirname, '../../.env')]) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq)
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1)
    }
  } catch {
    /* arquivo opcional */
  }
}
import { AppModule } from './app.module'
import { BotService } from './app/bot.service'
import { PaymentService } from './app/payment.service'
import { RecoveryService } from './app/recovery.service'
import { DownsellService } from './app/downsell.service'
import { redisConnection, recoveryQueue } from './infra/queues'
import { Worker } from 'bullmq'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.setGlobalPrefix('api')
  await app.listen(process.env.PORT || 3001)
  if (process.env.TELEGRAM_MODE !== 'webhook') {
    const bot = app.get(BotService)
    const loop = async () => {
      await bot.pollOnce().catch((error) => console.error(error))
      setTimeout(loop, 1500)
    }
    loop()
  }
  if (process.env.INLINE_WORKERS === 'true') startWorkers(app)
}

export function startWorkers(app: { get: (token: any) => any }) {
  const payments = app.get(PaymentService)
  const bot = app.get(BotService)
  const recovery = app.get(RecoveryService)
  const downsell = app.get(DownsellService)
  const connection = redisConnection()
  new Worker('payment', async (job) => payments.processWebhook(job.data.deliveryId), { connection })
  new Worker('delivery', async (job) => bot.deliver(job.data.orderId), { connection })
  // A mesma varredura de um minuto cuida da recuperação e do fluxo de downsell.
  new Worker('recovery', async () => {
    await recovery.sweep()
    await downsell.sweep()
  }, { connection })
  recoveryQueue.add('sweep', {}, { repeat: { every: 60_000 }, jobId: 'recovery-sweep' }).catch((error) => console.error(error))
}

if (require.main === module) bootstrap()
