import { downsellButton, downsellDue, downsellStepFromCallback, DownsellRule, formatReais, renderDownsell, validateDownsell } from './downsell'

const pix = new Date('2026-11-15T12:00:00.000Z')
const minutesAfter = (minutes: number, from = pix) => new Date(from.getTime() + minutes * 60000)

const steps: DownsellRule[] = [
  { id: 'a', position: 1, delayMinutes: 15, active: true },
  { id: 'b', position: 2, delayMinutes: 60, active: true },
  { id: 'c', position: 3, delayMinutes: 1440, active: true },
]

const base = { enabled: true, settled: false, blocked: false, pixGeneratedAt: pix, steps, sent: [] as { stepId: string; sentAt: Date }[] }

describe('downsellDue', () => {
  it('não manda nada antes da espera do primeiro passo', () => {
    expect(downsellDue({ ...base, now: minutesAfter(14) })).toBeNull()
  })

  it('manda o primeiro passo quando a espera fecha', () => {
    expect(downsellDue({ ...base, now: minutesAfter(15) })?.id).toBe('a')
  })

  it('conta a espera do segundo passo a partir do primeiro enviado', () => {
    const sent = [{ stepId: 'a', sentAt: minutesAfter(20) }]
    expect(downsellDue({ ...base, sent, now: minutesAfter(79) })).toBeNull()
    expect(downsellDue({ ...base, sent, now: minutesAfter(80) })?.id).toBe('b')
  })

  it('não repete passo já recebido e para no fim do fluxo', () => {
    const sent = [{ stepId: 'a', sentAt: minutesAfter(15) }, { stepId: 'b', sentAt: minutesAfter(75) }, { stepId: 'c', sentAt: minutesAfter(1515) }]
    expect(downsellDue({ ...base, sent, now: minutesAfter(999999) })).toBeNull()
  })

  it('para quando a pessoa paga, bloqueia o bot ou o fluxo é desligado', () => {
    const now = minutesAfter(500)
    expect(downsellDue({ ...base, settled: true, now })).toBeNull()
    expect(downsellDue({ ...base, blocked: true, now })).toBeNull()
    expect(downsellDue({ ...base, enabled: false, now })).toBeNull()
  })

  it('quem não gerou PIX não entra no fluxo', () => {
    expect(downsellDue({ ...base, pixGeneratedAt: null, now: minutesAfter(500) })).toBeNull()
  })

  it('pula passo desligado e segue para o próximo', () => {
    const paused = steps.map((step) => (step.id === 'a' ? { ...step, active: false } : step))
    expect(downsellDue({ ...base, steps: paused, now: minutesAfter(59) })).toBeNull()
    expect(downsellDue({ ...base, steps: paused, now: minutesAfter(60) })?.id).toBe('b')
  })

  it('PIX novo no meio do fluxo recomeça a espera', () => {
    const sent = [{ stepId: 'a', sentAt: minutesAfter(15) }]
    const newPix = minutesAfter(70)
    expect(downsellDue({ ...base, sent, pixGeneratedAt: newPix, now: minutesAfter(80) })).toBeNull()
    expect(downsellDue({ ...base, sent, pixGeneratedAt: newPix, now: minutesAfter(130) })?.id).toBe('b')
  })

  it('segue a ordem da posição, não a da lista', () => {
    const shuffled = [steps[2], steps[0], steps[1]]
    expect(downsellDue({ ...base, steps: shuffled, now: minutesAfter(15) })?.id).toBe('a')
  })

  it('passo novo no meio do fluxo espera a partir do último enviado', () => {
    const sent = [{ stepId: 'a', sentAt: minutesAfter(15) }, { stepId: 'c', sentAt: minutesAfter(100) }]
    expect(downsellDue({ ...base, sent, now: minutesAfter(159) })).toBeNull()
    expect(downsellDue({ ...base, sent, now: minutesAfter(160) })?.id).toBe('b')
  })
})

describe('validateDownsell', () => {
  it('aceita um fluxo certo e limpa a mensagem', () => {
    const result = validateDownsell([{ id: 'x', delayMinutes: 15, message: '  Volta aqui  ', priceCents: 6700, active: true }, { delayMinutes: 60, message: 'Última chance', priceCents: null }])
    expect(result).toEqual({
      ok: true,
      steps: [
        { id: 'x', delayMinutes: 15, message: 'Volta aqui', priceCents: 6700, active: true },
        { id: undefined, delayMinutes: 60, message: 'Última chance', priceCents: null, active: true },
      ],
    })
  })

  it('fluxo vazio é válido: nenhum downsell', () => {
    expect(validateDownsell([])).toEqual({ ok: true, steps: [] })
  })

  it('aponta o passo e o problema', () => {
    expect(validateDownsell('x')).toEqual({ ok: false, error: 'O fluxo precisa ser uma lista de passos.' })
    expect(validateDownsell([{ delayMinutes: 0, message: 'a' }])).toEqual({ ok: false, error: 'Downsell 1: a espera precisa ser de pelo menos 1 minuto.' })
    expect(validateDownsell([{ delayMinutes: 1.5, message: 'a' }])).toEqual({ ok: false, error: 'Downsell 1: a espera precisa ser de pelo menos 1 minuto.' })
    expect(validateDownsell([{ delayMinutes: 50000, message: 'a' }])).toEqual({ ok: false, error: 'Downsell 1: a espera vai até 30 dias.' })
    expect(validateDownsell([{ delayMinutes: 5, message: 'ok' }, { delayMinutes: 5, message: '   ' }])).toEqual({ ok: false, error: 'Downsell 2: escreva a mensagem.' })
    expect(validateDownsell([{ delayMinutes: 5, message: 'ok', priceCents: 0 }])).toEqual({ ok: false, error: 'Downsell 1: o preço precisa ser maior que zero. Deixe em branco para manter o preço do produto.' })
    expect(validateDownsell(Array.from({ length: 11 }, () => ({ delayMinutes: 5, message: 'ok' })))).toEqual({ ok: false, error: 'O fluxo aceita até 10 downsells.' })
  })

  it('passo sem "active" entra ligado', () => {
    const result = validateDownsell([{ delayMinutes: 5, message: 'ok', active: false }, { delayMinutes: 5, message: 'ok' }])
    expect(result.ok && result.steps.map((step) => step.active)).toEqual([false, true])
  })
})

describe('mensagem e botão', () => {
  it('troca nome e preços no texto', () => {
    const text = renderDownsell('Oi {nome}! De {preco_cheio} por {preco}.', { firstName: 'Ana', priceCents: 6700, fullPriceCents: 9700 })
    expect(text).toBe('Oi Ana! De R$ 97,00 por R$ 67,00.')
  })

  it('sem nome, não deixa espaço sobrando antes da pontuação', () => {
    expect(renderDownsell('Oi {nome}, voltou?', { firstName: null, priceCents: 6700, fullPriceCents: 9700 })).toBe('Oi, voltou?')
  })

  it('formata reais com milhar', () => {
    expect(formatReais(123456)).toBe('R$ 1.234,56')
  })

  it('o botão leva o preço do passo e o clique volta com o id', () => {
    const button = downsellButton({ id: 'cm3abc', priceCents: 4700 })
    expect(button).toEqual({ text: 'QUERO POR R$ 47,00', callback_data: 'ds:cm3abc' })
    expect(downsellButton({ id: 'cm3abc', priceCents: null }).text).toBe('QUERO COMPRAR AGORA')
    expect(downsellStepFromCallback(button.callback_data)).toBe('cm3abc')
    expect(downsellStepFromCallback('buy')).toBeNull()
    expect(downsellStepFromCallback('ds:')).toBeNull()
    expect(downsellStepFromCallback(null)).toBeNull()
  })
})
