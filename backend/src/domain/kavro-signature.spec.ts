import { createHmac } from 'crypto'
import { verifyKavroSignature } from './kavro-signature'

const SECRET = 'whsec_test'
const BODY = '{"event":"payment.paid"}'
const TS = 1700000000
const HEX = createHmac('sha256', SECRET).update(`${TS}.${BODY}`).digest('hex')

describe('verifyKavroSignature', () => {
  it('aceita o HMAC do corpo cru dentro de 5 minutos', () => {
    expect(verifyKavroSignature(BODY, `t=${TS},v1=${HEX}`, SECRET, 1700000100)).toBe(true)
  })

  it('rejeita timestamp com mais de 300 segundos', () => {
    expect(verifyKavroSignature(BODY, `t=${TS},v1=${HEX}`, SECRET, 1700000401)).toBe(false)
  })

  it('rejeita corpo alterado', () => {
    expect(verifyKavroSignature(`${BODY} `, `t=${TS},v1=${HEX}`, SECRET, TS)).toBe(false)
  })

  it('rejeita header sem v1', () => {
    expect(verifyKavroSignature(BODY, `t=${TS}`, SECRET, TS)).toBe(false)
  })
})
