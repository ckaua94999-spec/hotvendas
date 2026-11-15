'use client'
import { useState } from 'react'
import { useApi } from '../../../components/api'
import { Icon } from '../../../components/icons'
import { Avatar, Badge, EmptyState, ErrorState, Meter, PageHeader, PageLoading, Panel, StatTile } from '../../../components/kit'
import { AnimatedNumber } from '../../../components/motion'
import { formatInt } from '../../../lib/format'
import { recoveryStage } from '../../../lib/status'

type Row = { telegramId: string; username: string | null; name: string; blocked: boolean; paid: boolean; waiting: boolean; expired: boolean; sent: string[] }

/** Quantas pessoas cada coluna mostra antes de abrir a lista inteira. */
const PREVIEW = 8

function Group({ title, hint, icon, rows, index }: { title: string; hint: string; icon: string; rows: Row[]; index: number }) {
  const [open, setOpen] = useState(false)
  const contacted = rows.filter((row) => row.sent.length > 0).length
  const share = rows.length ? Math.round((contacted / rows.length) * 100) : 0
  const shown = open ? rows : rows.slice(0, PREVIEW)
  return (
    <Panel index={index} className="self-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="panel-title">{title}</h2>
          <p className="panel-sub mt-0.5">{hint}</p>
        </div>
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-accent-soft text-accent"><Icon name={icon} size={17} /></span>
      </div>
      <p className="mt-4 text-[40px] font-semibold leading-none tracking-[-0.03em]"><AnimatedNumber value={rows.length} format={formatInt} /></p>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-[12.5px]">
          <span className="text-ink-2">Já receberam mensagem</span>
          <span className="tnum font-semibold">{formatInt(contacted)} de {formatInt(rows.length)}</span>
        </div>
        <Meter value={share} label={`Já receberam mensagem em ${title}`} />
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-[var(--neutral-soft)] px-4 py-5 text-center text-[13px] text-muted">Ninguém nesta situação agora.</p>
      ) : (
        <ul className="mt-6 grid gap-1">
          {shown.map((row) => (
            <li key={row.telegramId} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--neutral-soft)]">
              <Avatar name={row.name || row.username || '?'} seed={row.telegramId} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{row.name || (row.username ? `@${row.username}` : row.telegramId)}</p>
                <p className="truncate font-mono text-[12px] text-muted">{row.telegramId}</p>
              </div>
              <div className="flex flex-none flex-wrap justify-end gap-1">
                {row.blocked && <Badge tone="bad">Bloqueou o bot</Badge>}
                {row.sent.map((stage) => <span key={stage} className="chip" title={`Já recebeu a mensagem de recuperação "${recoveryStage(stage)}"`}><Icon name="check" size={12} />Enviada: {recoveryStage(stage)}</span>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > PREVIEW && (
        <button type="button" onClick={() => setOpen(!open)} className="btn btn-ghost btn-sm mt-3 w-full">
          {open ? 'Mostrar menos' : `Mostrar todos os ${formatInt(rows.length)}`}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
        </button>
      )}
    </Panel>
  )
}

export default function RecoveryPage() {
  const { data, error, reload } = useApi<Row[]>('/api/recovery')

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageLoading title="Recuperação" />

  const noPix = data.filter((row) => !row.paid && !row.waiting && !row.expired)
  const waiting = data.filter((row) => row.waiting)
  const expired = data.filter((row) => row.expired && !row.paid)
  const inRecovery = new Set([...noPix, ...waiting, ...expired].map((row) => row.telegramId))
  const messaged = data.filter((row) => inRecovery.has(row.telegramId) && row.sent.length > 0).length
  const blocked = data.filter((row) => inRecovery.has(row.telegramId) && row.blocked).length

  return (
    <div>
      <PageHeader eyebrow="Pessoas" title="Recuperação" subtitle="Quem parou antes de pagar e o que o bot já mandou. No máximo uma mensagem por etapa; quem bloqueou o bot fica de fora." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile index={1} strong label="Pessoas em recuperação" icon="recovery" value={inRecovery.size} hint="Entre as 300 com acesso mais recente" />
        <StatTile index={2} label="Já receberam mensagem" icon="message" value={messaged} />
        <StatTile index={3} label="Bloquearam o bot" icon="ban" value={blocked} hint={blocked > 0 ? 'Não recebem recuperação' : undefined} />
      </div>

      {data.length === 0 ? (
        <Panel index={4} className="mt-4"><EmptyState icon="recovery" title="Ninguém para recuperar" text="Quando alguém iniciar o bot e parar antes de pagar, aparece aqui." /></Panel>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Group index={4} title="Sem PIX" hint="Iniciaram e não geraram cobrança" icon="pointer" rows={noPix} />
          <Group index={5} title="PIX em aberto" hint="Geraram o PIX e ainda não pagaram" icon="clock" rows={waiting} />
          <Group index={6} title="PIX expirado" hint="A cobrança venceu sem pagamento" icon="x-circle" rows={expired} />
        </div>
      )}
    </div>
  )
}
