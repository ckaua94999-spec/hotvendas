import assert from 'node:assert/strict'
import test from 'node:test'
import { buttonLabel, centsFromText, delayLabel, delayMinutes, discountHint, draftErrors, draftFromView, draftSignature, hasErrors, payloadFromDraft, previewText, splitDelay, unitName } from './downsell.ts'
import type { Draft, DownsellView } from './downsell.ts'

const view: DownsellView = {
  enabled: true,
  productPriceCents: 9700,
  steps: [
    { id: 'a', position: 1, delayMinutes: 15, message: 'Oi {nome}', priceCents: 6700, active: true, sent: 3, orders: 1, paid: 1, paidCents: 6700 },
    { id: 'b', position: 2, delayMinutes: 1440, message: 'Última', priceCents: null, active: false, sent: 0, orders: 0, paid: 0, paidCents: 0 },
  ],
}

test('converte a espera entre minutos e a unidade que a pessoa lê', () => {
  assert.deepEqual(splitDelay(15), { amount: '15', unit: 'min' })
  assert.deepEqual(splitDelay(120), { amount: '2', unit: 'h' })
  assert.deepEqual(splitDelay(90), { amount: '90', unit: 'min' })
  assert.deepEqual(splitDelay(2880), { amount: '2', unit: 'd' })
  assert.equal(delayMinutes('2', 'h'), 120)
  assert.equal(delayMinutes('1', 'd'), 1440)
  assert.ok(Number.isNaN(delayMinutes('', 'min')))
  assert.ok(Number.isNaN(delayMinutes('abc', 'min')))
  assert.equal(delayLabel(15), '15 min')
  assert.equal(delayLabel(60), '1 h')
  assert.equal(delayLabel(90), '1 h 30 min')
  assert.equal(delayLabel(1440), '1 dia')
  assert.equal(delayLabel(4320), '3 dias')
  assert.equal(unitName('1', 'h'), 'hora')
  assert.equal(unitName('2', 'h'), 'horas')
  assert.equal(unitName('', 'min'), 'minutos')
})

test('lê o preço digitado', () => {
  assert.equal(centsFromText('67'), 6700)
  assert.equal(centsFromText('67,90'), 6790)
  assert.equal(centsFromText('1.234,56'), 123456)
  assert.equal(centsFromText('  '), null)
  assert.ok(Number.isNaN(centsFromText('abc')))
})

test('o rascunho vai e volta sem mudar o fluxo', () => {
  const draft = draftFromView(view)
  assert.deepEqual(draft.steps.map((step) => [step.id, step.amount, step.unit, step.price, step.active]), [['a', '15', 'min', '67,00', true], ['b', '1', 'd', '', false]])
  assert.deepEqual(payloadFromDraft(draft), {
    enabled: true,
    steps: [
      { id: 'a', delayMinutes: 15, message: 'Oi {nome}', priceCents: 6700, active: true },
      { id: 'b', delayMinutes: 1440, message: 'Última', priceCents: null, active: false },
    ],
  })
  const edited: Draft = { ...draft, steps: draft.steps.map((step, index) => (index === 0 ? { ...step, amount: '20' } : step)) }
  assert.notEqual(draftSignature(edited), draftSignature(draft))
  assert.equal(draftSignature(draftFromView(view)), draftSignature(draft))
})

test('aponta o que falta em cada passo', () => {
  const draft: Draft = { enabled: true, steps: [
    { key: '1', amount: '0', unit: 'min', message: 'ok', price: '', active: true },
    { key: '2', amount: '1,5', unit: 'min', message: '   ', price: '0', active: true },
    { key: '3', amount: '40', unit: 'd', message: 'ok', price: 'abc', active: true },
    { key: '4', amount: '1,5', unit: 'h', message: 'ok', price: '47,00', active: true },
  ] }
  const errors = draftErrors(draft)
  assert.ok(errors[0].delay && !errors[0].message && !errors[0].price)
  assert.ok(errors[1].delay && errors[1].message && errors[1].price)
  assert.equal(errors[2].delay, 'A espera vai até 30 dias.')
  assert.ok(errors[2].price)
  assert.deepEqual(errors[3], {})
  assert.equal(hasErrors(errors), true)
  assert.equal(hasErrors(draftErrors(draftFromView(view))), false)
})

test('monta a prévia como a pessoa recebe', () => {
  assert.equal(previewText('Oi {nome}! De {preco_cheio} por {preco}.', { priceCents: 6700, productPriceCents: 9700 }), 'Oi Ana! De R$ 97,00 por R$ 67,00.')
  assert.equal(previewText('Por {preco}', { priceCents: null, productPriceCents: 9700 }), 'Por R$ 97,00')
  assert.equal(previewText('Por {preco}', { priceCents: null, productPriceCents: null }), 'Por R$ —')
  assert.equal(buttonLabel(6700), 'QUERO POR R$ 67,00')
  assert.equal(buttonLabel(null), 'QUERO COMPRAR AGORA')
  assert.equal(buttonLabel(NaN), 'QUERO COMPRAR AGORA')
})

test('explica o desconto ao lado do preço', () => {
  assert.deepEqual(discountHint(6700, 9700), { text: '31% abaixo do preço do produto, R$ 97,00.', tone: 'ok' })
  assert.equal(discountHint(9700, 9700).tone, 'warn')
  assert.equal(discountHint(null, 9700).tone, 'neutral')
  assert.equal(discountHint(6700, null).tone, 'warn')
})
