'use client'
import { FormEvent, useEffect, useState } from 'react'
import { useApi } from '../../../components/api'
import { Icon } from '../../../components/icons'
import { Avatar, EmptyState, ErrorState, ExportButtons, PageHeader, Panel, SkeletonRows, StatusBadge } from '../../../components/kit'
import { AnimatedNumber, useMounted } from '../../../components/motion'
import { formatBRL, formatInt, formatRelative, formatShortDateTime } from '../../../lib/format'
import { deliveryStatus, STAGE_ORDER, stageStatus } from '../../../lib/status'

type User = { telegramId: string; username: string | null; name: string; firstSeenAt: string; lastSeenAt: string; origin: string; campaignCode: string; stage: string; pixCount: number; paymentCount: number; totalCents: number; deliveryStatus: string }
type StageCount = { key: string; label: string; value: number }

/** A API devolve no máximo este tanto de usuários por consulta, os mais recentes primeiro. */
const LIMIT = 200

function StageDots({ stage }: { stage: string }) {
  const reached = STAGE_ORDER.indexOf(stage)
  return (
    <span className="flex gap-1" aria-hidden="true">
      {STAGE_ORDER.map((item, index) => (
        <span key={item} className="h-1.5 w-4 rounded-full" style={{ background: index <= reached ? `var(--funnel-${index + 1})` : 'var(--neutral-soft)' }} />
      ))}
    </span>
  )
}

/** Onde estão os usuários da lista: uma coluna por etapa, na ordem do funil. */
function StageStrip({ stages }: { stages: StageCount[] }) {
  const mounted = useMounted()
  const max = Math.max(0, ...stages.map((stage) => stage.value))
  return (
    <ol className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
      {stages.map((stage) => {
        const position = STAGE_ORDER.indexOf(stage.key)
        const width = mounted && max > 0 ? Math.max((stage.value / max) * 100, stage.value > 0 ? 2 : 0) : 0
        return (
          <li key={stage.key} className="bar-row min-w-0">
            <p className="truncate text-[12.5px] text-muted" title={stage.label}>{stage.label}</p>
            <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em]"><AnimatedNumber value={stage.value} format={formatInt} /></p>
            <div className="mt-3 border-l border-[var(--axis)]">
              <div className="bar" style={{ height: 6, width: `${width}%`, background: position < 0 ? 'var(--st-neutral)' : `var(--funnel-${position + 1})`, transitionDelay: `${Math.max(position, 0) * 70}ms` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function UsersPage() {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const { data, error, stale, reload } = useApi<User[]>(`/api/users?q=${encodeURIComponent(q)}`)

  // Busca enquanto digita, com uma pausa curta para não consultar a cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 350)
    return () => clearTimeout(timer)
  }, [text])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setQ(text.trim())
  }

  const count = (stage: string) => (data || []).filter((user) => user.stage === stage).length
  const stages: StageCount[] = STAGE_ORDER.map((stage) => ({ key: stage, label: stageStatus(stage).label, value: count(stage) }))
  if (count('nenhuma') > 0) stages.unshift({ key: 'nenhuma', label: 'Nenhuma etapa', value: count('nenhuma') })
  const now = Date.now()

  return (
    <div>
      <PageHeader
        eyebrow="Pessoas"
        title="Usuários"
        subtitle="Quem já falou com o bot, do acesso mais recente ao mais antigo."
        actions={<ExportButtons resource="users" query={`q=${encodeURIComponent(q)}`} />}
      />

      <form onSubmit={search} className="reveal max-w-2xl" role="search">
        <label className="relative block">
          <span className="sr-only">Buscar usuário</span>
          <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Telegram ID, nome ou username" className="input h-12 rounded-2xl pl-11 pr-11 text-[15px]" />
          {text && (
            <button type="button" onClick={() => setText('')} className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--neutral-soft)] hover:text-ink" aria-label="Limpar busca">
              <Icon name="x" size={15} />
            </button>
          )}
        </label>
        <p className="mt-2 text-[13px] text-muted" aria-live="polite">
          {!data ? 'Buscando' : `${formatInt(data.length)} ${data.length === 1 ? 'usuário' : 'usuários'}${q ? ` para "${q}"` : ''}${data.length >= LIMIT ? `. A lista mostra os ${LIMIT} mais recentes; use a busca para achar os demais` : ''}`}
        </p>
      </form>

      {error ? <div className="mt-4"><ErrorState message={error} onRetry={reload} /></div> : (
        <div className={`mt-4 grid gap-4 ${stale ? 'stale' : 'fresh'}`}>
          <Panel index={2} title="Etapa atual" subtitle={data ? `Onde estão os ${formatInt(data.length)} usuários da lista` : 'Onde estão os usuários da lista'}>
            {data ? <StageStrip stages={stages} /> : <SkeletonRows rows={2} />}
          </Panel>

          <Panel index={3} title="Lista" flush>
            {!data ? <SkeletonRows rows={8} /> : data.length === 0 ? (
              <EmptyState icon="users" title="0 usuários" text={q ? 'Ninguém corresponde a essa busca.' : 'Quando alguém mandar /start para o bot, aparece aqui.'} />
            ) : (
              <div className="max-h-[70vh] overflow-auto pb-2 pt-3">
                <table className="tbl">
                  <thead>
                    <tr><th>Usuário</th><th>Origem e campanha</th><th>Etapa atual</th><th>Primeiro e último acesso</th><th className="num">Valor comprado</th><th>Entrega</th></tr>
                  </thead>
                  <tbody>
                    {data.map((user) => (
                      <tr key={user.telegramId}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={user.name || user.username || '?'} seed={user.telegramId} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{user.name || '—'}</p>
                              <p className="truncate text-[12.5px] text-muted">{user.username ? `@${user.username} · ` : ''}<span className="font-mono">{user.telegramId}</span></p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="chip"><Icon name="tag" size={12} />{user.origin}</span>
                          {user.campaignCode !== user.origin && <p className="mt-1 font-mono text-[12px] text-muted">{user.campaignCode}</p>}
                        </td>
                        <td>
                          <p className="whitespace-nowrap font-medium">{stageStatus(user.stage).label}</p>
                          <div className="mt-1.5"><StageDots stage={user.stage} /></div>
                        </td>
                        <td className="whitespace-nowrap">
                          <p className="text-ink-2">{formatShortDateTime(user.firstSeenAt)}</p>
                          <p className="mt-0.5 text-[12.5px] text-muted" title={formatShortDateTime(user.lastSeenAt)}>Último {formatRelative(user.lastSeenAt, now)}</p>
                        </td>
                        <td className="num whitespace-nowrap">
                          <p className="font-semibold">{formatBRL(user.totalCents)}</p>
                          <p className="mt-0.5 text-[12.5px] text-muted">{formatInt(user.pixCount)} PIX · {formatInt(user.paymentCount)} {user.paymentCount === 1 ? 'pagamento' : 'pagamentos'}</p>
                        </td>
                        <td><StatusBadge status={deliveryStatus(user.deliveryStatus)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
