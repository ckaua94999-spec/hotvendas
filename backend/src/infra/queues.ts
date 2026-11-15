import { Queue } from 'bullmq'

export function redisConnection() {
  const url = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379')
  return { host: url.hostname, port: Number(url.port || 6379), maxRetriesPerRequest: null as null }
}

export const paymentQueue = new Queue('payment', { connection: redisConnection() })
export const deliveryQueue = new Queue('delivery', { connection: redisConnection() })
export const recoveryQueue = new Queue('recovery', { connection: redisConnection() })

export async function enqueuePayment(deliveryId: string) {
  await paymentQueue.add('process', { deliveryId }, { jobId: deliveryId, attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 })
}

export async function enqueueDelivery(orderId: string, delay = 0) {
  await deliveryQueue.add('send', { orderId }, { delay, removeOnComplete: 1000 })
}
