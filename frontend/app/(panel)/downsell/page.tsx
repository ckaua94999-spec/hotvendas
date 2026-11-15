'use client'
import { useEffect, useRef, useState } from 'react'
import { send, useApi } from '../../../components/api'
import { Icon } from '../../../components/icons'
import { Badge, EmptyState, ErrorState, Meter, PageHeader, PageLoading, Panel, Spinner, StatTile, useToast } from '../../../components/kit'
import { stagger } from '../../../components/motion'
import { buttonLabel, centsFromText, delayLabel, delayMinutes, DelayUnit, discountHint, Draft, draftErrors, draftFromView, draftSignature, DraftStep, DownsellView, hasErrors, MAX_STEPS, newStep, payloadFromDraft, previewText, StepErrors, UNIT_LABEL, unitName } from '../../../lib/downsell'
import { formatBRL, formatInt, formatPercent } from '../../../lib/format'

const TOKENS: { token: string; label: string }[] = [
  { token: '{nome}', label: 'primeiro nome' },
  { token: '{preco}', label: 'preço deste downsell' },
  { token: '{preco_cheio}', label: 'preço do produto' },
]

const HINT_TONE = { ok: 'text-ok', warn: 'text-warn', neutral: 'text-muted' }

/** Interruptor com valor controlado pela tela. */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full border transition-colors duration-300 ${checked ? 'border-transparent bg-accent' : 'border-line-2 bg-[var(--surface-3)]'}`}
    >
      <span className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full transition-all duration-300 ease-out ${checked ? 'translate-x-5 bg-white' : 'bg-[var(--muted)]'}`} />
    </button>
  )
}

/** A mensagem como aparece na conversa: o texto e, embaixo, o botão. */
function Preview({ step, index, productPriceCents }: { step: DraftStep; index: number; productPriceCents: number | null }) {
  const priceCents = centsFromText(step.price)
  const minutes = delayMinutes(step.amount, step.unit)
  return (
    <div className="rounded-3xl bg-[var(--surface-3)] p-4">
      <div key={`${step.key}-${index}`} className="anim-pop">
        <p className="max-w-[94%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-line bg-[var(--surface)] px-4 py-3 text-[14px] leading-relaxed">
          {step.message.trim() ? previewText(step.message, { priceCents, productPriceCents }) : <span className="text-muted">A mensagem aparece aqui enquanto você escreve.</span>}
        </p>
        <p className="mt-2 max-w-[94%] rounded-xl border border-[var(--accent-line)] bg-accent-soft py-2.5 text-center text-[13px] font-bold tracking-wide text-accent">{buttonLabel(priceCents)}</p>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
        <Icon name="clock" size={12} />
        {Number.isFinite(minutes) && minutes > 0 ? `Sai ${delayLabel(minutes)} depois ${index === 0 ? 'do PIX gerado' : `do downsell ${index}`}.` : 'Defina a espera para ver quando sai.'}
      </p>
    </div>
  )
}

export default function DownsellPage() {
  const { data, error, reload } = useApi<DownsellView>('/api/downsell')
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [checked, setChecked] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const dirtyRef = useRef(false)

  const baseline = data ? draftSignature(draftFromView(data)) : ''
  const dirty = draft !== null && data !== null && draftSignature(draft) !== baseline
  dirtyRef.current = dirty

  // O que vem do servidor entra na tela enquanto ninguém está editando; com edição em curso, o rascunho manda.
  useEffect(() => {
    if (data && !dirtyRef.current) setDraft(draftFromView(data))
  }, [data])

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data || !draft) return <PageLoading title="Downsell" />

  const errors: StepErrors[] = draftErrors(draft)
  const patch = (next: Partial<Draft>) => setDraft({ ...draft, ...next })
  const update = (key: string, next: Partial<DraftStep>) => patch({ steps: draft.steps.map((step) => (step.key === key ? { ...step, ...next } : step)) })

  function add() {
    const step = newStep(draft!.steps.length === 0)
    // O primeiro downsell já liga o fluxo: é o que quem está criando espera.
    patch({ steps: [...draft!.steps, step], enabled: draft!.steps.length === 0 ? true : draft!.enabled })
    setFocus(step.key)
  }

  function move(key: string, offset: number) {
    const from = draft!.steps.findIndex((step) => step.key === key)
    const to = from + offset
    if (from < 0 || to < 0 || to >= draft!.steps.length) return
    const steps = [...draft!.steps]
    const [item] = steps.splice(from, 1)
    steps.splice(to, 0, item)
    patch({ steps })
  }

  function insert(key: string, token: string) {
    const field = document.getElementById(`downsell-message-${key}`) as HTMLTextAreaElement | null
    const step = draft!.steps.find((item) => item.key === key)
    if (!step) return
    const start = field?.selectionStart ?? step.message.length
    const end = field?.selectionEnd ?? start
    update(key, { message: step.message.slice(0, start) + token + step.message.slice(end) })
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + token.length, start + token.length) })
  }

  async function save() {
    setChecked(true)
    if (hasErrors(errors)) { toast('warn', 'Há campos para corrigir no fluxo. Eles estão marcados.'); return }
    setSaving(true)
    const response = await send('/api/downsell', 'PUT', payloadFromDraft(draft!))
    if (!response.ok) {
      setSaving(false)
      toast('bad', response.json?.error || (response.status === 403 ? 'Só o dono da operação altera o downsell.' : 'O fluxo não foi salvo. Nada mudou.'))
      return
    }
    dirtyRef.current = false
    await reload()
    setDraft(draftFromView(response.json as DownsellView))
    setChecked(false)
    setSaving(false)
    toast('ok', (response.json as DownsellView).enabled ? 'Fluxo salvo e ligado.' : 'Fluxo salvo. Ele está desligado: nada será enviado.')
  }

  function discard() {
    setDraft(draftFromView(data!))
    setChecked(false)
  }

  const total = data.steps.reduce((sum, step) => ({ sent: sum.sent + step.sent, orders: sum.orders + step.orders, paidCents: sum.paidCents + step.paidCents }), { sent: 0, orders: 0, paidCents: 0 })
  const shown = draft.steps.find((step) => step.key === focus) ?? draft.steps[0]
  const shownIndex = shown ? draft.steps.indexOf(shown) : -1

  return (
    <div>
      <PageHeader
        eyebrow="Pessoas"
        title="Downsell"
        subtitle="Ofertas automáticas para quem gerou o PIX e não pagou. Você decide quantas são, quanto esperar entre uma e outra, o que dizer e por quanto vender."
        actions={(
          <div className={`flex items-center gap-3 rounded-full border px-4 py-2 transition-colors duration-300 ${draft.enabled ? 'border-[var(--accent-line)] bg-accent-soft' : 'border-line bg-[var(--surface)]'}`}>
            <span className="text-[13px] font-semibold">{draft.enabled ? 'Fluxo ligado' : 'Fluxo desligado'}</span>
            <Toggle checked={draft.enabled} onChange={(enabled) => patch({ enabled })} label="Ligar ou desligar o fluxo de downsell" />
          </div>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile index={1} label="Downsells ativos" icon="percent" value={data.enabled ? data.steps.filter((step) => step.active).length : 0} hint={data.enabled ? undefined : 'O fluxo está desligado'} />
        <StatTile index={2} label="Mensagens enviadas" icon="send" value={total.sent} />
        <StatTile index={3} label="PIX gerados pelo downsell" icon="qr" value={total.orders} />
        <StatTile index={4} strong label="Vendido pelo downsell" icon="coins" value={total.paidCents} format={formatBRL} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Panel index={5} className="self-start xl:col-span-7" title="Fluxo" subtitle="De cima para baixo, na ordem em que as mensagens saem">
          <ol className="relative">
            <span className="absolute bottom-6 left-[19px] top-6 w-px bg-[var(--line-2)]" aria-hidden="true" />

            <li className="relative flex items-center gap-4 pb-2">
              <span className="relative z-[1] grid h-10 w-10 flex-none place-items-center rounded-full border border-line-2 bg-[var(--surface-2)] text-ink-2"><Icon name="qr" size={17} /></span>
              <div>
                <p className="text-[14px] font-semibold">A pessoa gerou o PIX e não pagou</p>
                <p className="text-[12.5px] text-muted">É aqui que o fluxo começa a contar.</p>
              </div>
            </li>

            {draft.steps.map((step, index) => {
              const issue: StepErrors = checked ? errors[index] : {}
              const hint = discountHint(centsFromText(step.price), data.productPriceCents)
              return (
                <li key={step.key} className="anim-pop relative" onFocus={() => setFocus(step.key)}>
                  <div className="flex items-center gap-4 py-3">
                    <span className="relative z-[1] grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface)] text-muted"><Icon name="clock" size={16} /></span>
                    <div className={`flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 ${issue.delay ? 'border-[var(--bad)]' : 'border-line'} bg-[var(--surface-2)]`}>
                      <label htmlFor={`downsell-delay-${step.key}`} className="text-[13px] font-semibold text-ink-2">Esperar</label>
                      <input id={`downsell-delay-${step.key}`} value={step.amount} onChange={(event) => update(step.key, { amount: event.target.value })} inputMode="numeric" className="input tnum h-9 w-[72px] text-center" aria-invalid={Boolean(issue.delay)} />
                      <select value={step.unit} onChange={(event) => update(step.key, { unit: event.target.value as DelayUnit })} className="input h-9 w-[124px]" aria-label="Unidade da espera">
                        {(Object.keys(UNIT_LABEL) as DelayUnit[]).map((unit) => <option key={unit} value={unit}>{unitName(step.amount, unit)}</option>)}
                      </select>
                      <span className="text-[13px] text-muted">{index === 0 ? 'depois do PIX gerado' : `depois do downsell ${index}`}</span>
                    </div>
                  </div>
                  {issue.delay && <p className="-mt-1 mb-2 pl-14 text-[12.5px] text-bad">{issue.delay}</p>}

                  <div className="flex items-start gap-4">
                    <span className={`relative z-[1] grid h-10 w-10 flex-none place-items-center rounded-full text-[14px] font-bold transition-colors duration-300 ${step.active ? 'bg-accent text-[var(--accent-ink)]' : 'border border-line-2 bg-[var(--surface-2)] text-muted'}`}>{index + 1}</span>
                    <div className={`min-w-0 flex-1 rounded-2xl border bg-[var(--surface-2)] p-4 transition-colors duration-300 md:p-5 ${shown?.key === step.key ? 'border-[var(--accent-line)]' : 'border-line'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-semibold">Downsell {index + 1}</p>
                        {!step.active && <Badge>Pausado</Badge>}
                        <div className="ml-auto flex items-center gap-1">
                          <Toggle checked={step.active} onChange={(active) => update(step.key, { active })} label={`Ativar ou pausar o downsell ${index + 1}`} />
                          <button type="button" className="icon-btn ml-1 h-8 w-8" onClick={() => move(step.key, -1)} disabled={index === 0} aria-label="Mover para cima" title="Mover para cima" style={{ opacity: index === 0 ? 0.35 : 1 }}><Icon name="chevron-up" size={16} /></button>
                          <button type="button" className="icon-btn h-8 w-8" onClick={() => move(step.key, 1)} disabled={index === draft.steps.length - 1} aria-label="Mover para baixo" title="Mover para baixo" style={{ opacity: index === draft.steps.length - 1 ? 0.35 : 1 }}><Icon name="chevron-down" size={16} /></button>
                          <button type="button" className="icon-btn h-8 w-8 hover:text-bad" onClick={() => patch({ steps: draft.steps.filter((item) => item.key !== step.key) })} aria-label={`Remover o downsell ${index + 1}`} title="Remover"><Icon name="trash" size={16} /></button>
                        </div>
                      </div>

                      <label htmlFor={`downsell-message-${step.key}`} className="field-label mt-4">Mensagem</label>
                      <textarea id={`downsell-message-${step.key}`} value={step.message} onChange={(event) => update(step.key, { message: event.target.value })} className={`input min-h-[112px] ${issue.message ? 'border-[var(--bad)]' : ''}`} placeholder="O que a pessoa vai ler" aria-invalid={Boolean(issue.message)} />
                      {issue.message && <p className="mt-1.5 text-[12.5px] text-bad">{issue.message}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                        Inserir:
                        {TOKENS.map((item) => (
                          <button key={item.token} type="button" onClick={() => insert(step.key, item.token)} className="chip cursor-pointer font-mono text-[11.5px] transition-colors hover:text-ink" title={`Vira o ${item.label}`}>{item.token}</button>
                        ))}
                      </div>

                      <label htmlFor={`downsell-price-${step.key}`} className="field-label mt-4">Preço neste downsell</label>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="relative w-[150px]">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">R$</span>
                          <input id={`downsell-price-${step.key}`} value={step.price} onChange={(event) => update(step.key, { price: event.target.value })} inputMode="decimal" placeholder={data.productPriceCents == null ? '0,00' : (data.productPriceCents / 100).toFixed(2).replace('.', ',')} className={`input tnum pl-10 ${issue.price ? 'border-[var(--bad)]' : ''}`} aria-invalid={Boolean(issue.price)} />
                        </div>
                        {!issue.price && hint.text && <p className={`min-w-0 flex-1 text-[12.5px] ${HINT_TONE[hint.tone]}`}>{hint.text}</p>}
                      </div>
                      {issue.price && <p className="mt-1.5 text-[12.5px] text-bad">{issue.price}</p>}
                    </div>
                  </div>
                </li>
              )
            })}

            <li className="relative flex items-center gap-4 pt-4">
              <span className="relative z-[1] grid h-10 w-10 flex-none place-items-center rounded-full border border-dashed border-line-2 bg-[var(--surface)] text-muted"><Icon name="plus" size={17} /></span>
              {draft.steps.length >= MAX_STEPS ? (
                <p className="text-[13px] text-muted">O fluxo aceita até {MAX_STEPS} downsells.</p>
              ) : (
                <button type="button" onClick={add} className="btn btn-soft">{draft.steps.length === 0 ? 'Criar o primeiro downsell' : 'Adicionar downsell'}</button>
              )}
            </li>
          </ol>
        </Panel>

        <div className="grid gap-4 self-start xl:sticky xl:top-24 xl:col-span-5">
          <Panel index={6} title="Como chega no Telegram" subtitle={shown ? `Downsell ${shownIndex + 1}, com um nome de exemplo` : 'A prévia aparece quando houver um downsell'}>
            {shown ? <Preview step={shown} index={shownIndex} productPriceCents={data.productPriceCents} /> : <EmptyState icon="message" title="Nenhum downsell ainda" text="Crie o primeiro para ver como a mensagem chega." />}
          </Panel>
          <Panel index={7} title="Como o fluxo decide">
            <ul className="grid gap-3 text-[13.5px] text-ink-2">
              {[
                ['users', 'Entra quem gerou o PIX e não pagou. Ao ligar o fluxo, quem já está nessa situação entra também.'],
                ['clock', 'A espera do primeiro conta do PIX mais recente. A dos seguintes, do downsell anterior.'],
                ['check', 'Cada pessoa recebe cada downsell uma vez só.'],
                ['ban', 'Para quando a pessoa paga, bloqueia o bot ou tem um pagamento em análise.'],
                ['qr', 'O botão gera um PIX com o preço do downsell. Sem preço, cobra o preço do produto.'],
              ].map(([icon, text], index) => (
                <li key={icon} className="reveal flex items-start gap-3" style={stagger(index + 8)}>
                  <span className="mt-px grid h-7 w-7 flex-none place-items-center rounded-lg bg-[var(--neutral-soft)] text-muted"><Icon name={icon} size={14} /></span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel index={8} className="mt-4" title="Resultado por downsell" subtitle="O que cada passo salvo já rendeu, desde que foi criado" flush>
        {data.steps.length === 0 ? (
          <EmptyState icon="percent" title="Sem resultado ainda" text="Depois que o fluxo for salvo e as primeiras mensagens saírem, os números de cada downsell aparecem aqui." />
        ) : (
          <div className="overflow-x-auto pb-2 pt-3">
            <table className="tbl">
              <thead>
                <tr><th>Downsell</th><th className="num">Enviados</th><th className="num">PIX gerados</th><th className="num">Pagos</th><th className="num">Vendido</th><th className="num">Pagos por enviado</th></tr>
              </thead>
              <tbody>
                {data.steps.map((step) => {
                  const rate = step.sent ? Math.round((step.paid / step.sent) * 1000) / 10 : 0
                  return (
                    <tr key={step.id}>
                      <td>
                        <p className="flex items-center gap-2 font-semibold">Downsell {step.position}{!step.active && <Badge>Pausado</Badge>}</p>
                        <p className="text-[12.5px] text-muted">{delayLabel(step.delayMinutes)} de espera · {step.priceCents == null ? 'preço do produto' : formatBRL(step.priceCents)}</p>
                      </td>
                      <td className="num">{formatInt(step.sent)}</td>
                      <td className="num">{formatInt(step.orders)}</td>
                      <td className="num font-semibold">{formatInt(step.paid)}</td>
                      <td className="num font-semibold">{formatBRL(step.paidCents)}</td>
                      <td className="num">
                        <div className="ml-auto flex w-[132px] items-center gap-3">
                          <Meter value={rate} label={`Pagos por enviado no downsell ${step.position}`} />
                          <span className="w-12 flex-none">{formatPercent(rate)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {dirty && (
        <div className="anim-pop sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--accent-line)] bg-[var(--surface-2)] px-5 py-3 shadow-[var(--shadow-pop)]">
          <p className="flex items-center gap-2 text-[13.5px]"><Icon name="info" size={16} className="text-accent" />Você tem alterações que ainda não foram salvas.</p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost" onClick={discard} disabled={saving}>Descartar</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : <Icon name="check" size={15} />}{saving ? 'Salvando' : 'Salvar fluxo'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
