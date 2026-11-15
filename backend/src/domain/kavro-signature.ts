import { createHmac, timingSafeEqual } from 'crypto'

const TOLERANCE_SECONDS = 300

export function verifyKavroSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowEpochSeconds: number,
): boolean {
  if (!signatureHeader || !secret) return false
  const parts = signatureHeader.split(',')
  const timestampPart = parts.find((part) => part.startsWith('t='))
  const signaturePart = parts.find((part) => part.startsWith('v1='))
  if (!timestampPart || !signaturePart) return false
  const timestamp = Number(timestampPart.slice(2))
  const received = signaturePart.slice(3)
  if (!Number.isFinite(timestamp) || Math.abs(nowEpochSeconds - timestamp) > TOLERANCE_SECONDS) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  if (received.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}
