import assert from 'node:assert/strict'
import test from 'node:test'
import { bucketLabel, bucketTitle, formatBRL, formatCalendarDate, formatCompactBRL, formatDateTime, formatInt, formatPercent, formatRelative, initials, parseReais } from './format.ts'

test('formata real e percentual', () => {
  assert.equal(formatBRL(9900), 'R$ 99,00')
  assert.equal(formatPercent(0), '0%')
  assert.equal(formatPercent(12.5), '12,5%')
  assert.equal(formatInt(1234), '1.234')
  assert.equal(formatCompactBRL(150000), 'R$ 1,5 mil')
})

test('lê reais digitados como centavos', () => {
  assert.equal(parseReais('1.234,56'), 123456)
  assert.equal(parseReais('99'), 9900)
  assert.equal(parseReais('0,5'), 50)
  assert.equal(parseReais(''), 0)
  assert.equal(parseReais('abc'), 0)
})

test('mostra datas no fuso de São Paulo', () => {
  assert.equal(formatDateTime('2026-11-15T17:05:00.000Z'), '15/11/2026 14:05')
  assert.equal(formatDateTime('2026-11-16T01:30:00.000Z'), '15/11/2026 22:30')
  assert.equal(formatDateTime(null), '—')
  assert.equal(formatCalendarDate('2026-11-15T00:00:00.000Z'), '15/11/2026')
})

test('rotula os intervalos do gráfico', () => {
  assert.equal(bucketLabel('2026-11-15T17:00:00.000Z', 'hour'), '14h')
  assert.equal(bucketLabel('2026-11-15T03:00:00.000Z', 'hour'), '00h')
  assert.equal(bucketLabel('2026-11-15T03:00:00.000Z', 'day'), '15/11')
  assert.equal(bucketLabel('2026-11-01T03:00:00.000Z', 'month'), 'nov/26')
  assert.equal(bucketTitle('2026-11-16T02:00:00.000Z', 'hour'), '15/11, 23h às 00h')
  assert.equal(bucketTitle('2026-11-15T03:00:00.000Z', 'day'), 'domingo, 15/11')
  assert.equal(bucketTitle('2026-11-01T03:00:00.000Z', 'month'), 'novembro de 2026')
})

test('tempo relativo e iniciais', () => {
  const now = Date.parse('2026-11-15T17:00:00.000Z')
  assert.equal(formatRelative('2026-11-15T16:59:40.000Z', now), 'agora')
  assert.equal(formatRelative('2026-11-15T16:48:00.000Z', now), 'há 12 min')
  assert.equal(formatRelative('2026-11-15T12:00:00.000Z', now), 'há 5 h')
  assert.equal(formatRelative('2026-11-12T12:00:00.000Z', now), 'há 3 d')
  assert.equal(initials('Ana Paula Souza'), 'AS')
  assert.equal(initials('bia'), 'B')
  assert.equal(initials(''), '?')
})
