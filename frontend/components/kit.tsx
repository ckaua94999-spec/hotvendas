'use client'
import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatInt, formatPercent, initials } from '../lib/format'
import type { StatusView, Tone } from '../lib/status'
import { Icon } from './icons'
import { AnimatedNumber, spotlight, stagger, useMounted } from './motion'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/* ------------------------------------------------------------------ página */

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="reveal mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-[34px] leading-[1.1] md:text-[42px]">{title}</h1>
        {subtitle && <div className="mt-2 max-w-2xl text-[14px] text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({ title, subtitle, actions, children, className = '', index = 0, flush = false }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; index?: number; flush?: boolean }) {
  return (
    <section className={`panel reveal flex flex-col ${className}`} style={stagger(index)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 md:px-6">
          <div className="min-w-0">
            {title && <h2 className="panel-title">{title}</h2>}
            {subtitle && <p className="panel-sub mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`min-w-0 flex-1 ${flush ? '' : 'p-5 md:p-6'}`}>{children}</div>
    </section>
  )
}

/* ----------------------------------------------------------------- números */

const HINT_TONE: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  serious: 'text-[var(--serious)]',
  bad: 'text-bad',
  info: 'text-info',
  neutral: 'text-muted',
}

export function StatTile({ label, value, format = formatInt, precision = 0, icon, hint, hintTone = 'neutral', footer, index = 0, strong = false }: {
  label: string
  value: number
  format?: (value: number) => string
  precision?: number
  icon?: string
  hint?: ReactNode
  hintTone?: Tone
  footer?: ReactNode
  index?: number
  strong?: boolean
}) {
  return (
    <article className={`panel spot reveal p-5 ${strong ? 'border-[var(--accent-line)]' : ''}`} style={stagger(index)} onPointerMove={spotlight}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-2">{label}</p>
        {icon && (
          <span className={`grid h-8 w-8 flex-none place-items-center rounded-[10px] ${strong ? 'bg-accent-soft text-accent' : 'bg-[var(--neutral-soft)] text-muted'}`}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em]">
        <AnimatedNumber value={value} format={format} precision={precision} />
      </p>
      {hint && <p className={`mt-2 flex items-center gap-1.5 text-[12.5px] ${HINT_TONE[hintTone]}`}>{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </article>
  )
}

/* ------------------------------------------------------------------ estado */

const BADGE: Record<Tone, string> = {
  ok: 'badge badge-ok',
  warn: 'badge badge-warn',
  serious: 'badge badge-serious',
  bad: 'badge badge-bad',
  info: 'badge badge-info',
  neutral: 'badge',
}

export function Badge({ tone = 'neutral', live = false, children }: { tone?: Tone; live?: boolean; children: ReactNode }) {
  return <span className={`${BADGE[tone]}${live ? ' badge-live' : ''}`}>{children}</span>
}

export function StatusBadge({ status }: { status: StatusView }) {
  return <Badge tone={status.tone} live={status.live}>{status.label}</Badge>
}

const NOTICE: Record<Tone, { box: string; icon: string }> = {
  ok: { box: 'border-[var(--ok-soft)] bg-[var(--ok-soft)] text-ok', icon: 'check-circle' },
  warn: { box: 'border-[var(--warn-soft)] bg-[var(--warn-soft)] text-warn', icon: 'alert' },
  serious: { box: 'border-[var(--serious-soft)] bg-[var(--serious-soft)] text-[var(--serious)]', icon: 'alert' },
  bad: { box: 'border-[var(--bad-soft)] bg-[var(--bad-soft)] text-bad', icon: 'x-circle' },
  info: { box: 'border-[var(--info-soft)] bg-[var(--info-soft)] text-info', icon: 'info' },
  neutral: { box: 'border-line bg-[var(--neutral-soft)] text-ink-2', icon: 'info' },
}

export function Notice({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const style = NOTICE[tone]
  return (
    <p className={`anim-pop flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[13.5px] ${style.box}`} role="status">
      <Icon name={style.icon} size={17} className="mt-px flex-none" />
      <span className="text-ink">{children}</span>
    </p>
  )
}

export function EmptyState({ icon = 'info', title, text }: { icon?: string; title: string; text?: ReactNode }) {
  return (
    <div className="anim-fade flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--neutral-soft)] text-muted"><Icon name={icon} size={22} /></span>
      <p className="mt-4 text-[15px] font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13.5px] text-muted">{text}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel anim-pop flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--bad-soft)] text-bad"><Icon name="alert" size={22} /></span>
      <p className="mt-4 text-[15px] font-semibold">{message}</p>
      <p className="mt-1 text-[13.5px] text-muted">O painel tenta de novo sozinho em alguns segundos.</p>
      {onRetry && <button className="btn btn-soft mt-5" onClick={onRetry}><Icon name="refresh" size={15} />Tentar agora</button>}
    </div>
  )
}

/* ------------------------------------------------------------- carregando */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="panel p-5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-4 h-8 w-24" />
          <Skeleton className="mt-4 h-3 w-36" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonPanel({ height = 300, className = '' }: { height?: number; className?: string }) {
  return (
    <div className={`panel p-6 ${className}`} aria-hidden="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <div className="skeleton mt-6 w-full" style={{ height }} />
    </div>
  )
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-3 p-6" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
    </div>
  )
}

export function PageLoading({ title }: { title: string }) {
  return (
    <div role="status" aria-label={`Carregando ${title}`}>
      <div className="mb-7">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-10 w-64" />
      </div>
      <SkeletonTiles />
      <div className="mt-4"><SkeletonPanel /></div>
    </div>
  )
}

/* ------------------------------------------------------------------ medidas */

/** Uma proporção contra o seu limite. A trilha é um tom mais claro da mesma cor. */
export function Meter({ value, color = 'var(--accent)', label }: { value: number; color?: string; label?: string }) {
  const mounted = useMounted()
  const width = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} aria-label={label}>
      <div className="h-full rounded-full" style={{ width: `${mounted ? width : 0}%`, background: color, transition: 'width 0.95s cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
    </div>
  )
}

export type Part = { key: string; label: string; value: number; color: string }

/** Um todo dividido em partes: barra fina em cima, lista com nome, quantidade e fatia embaixo. */
export function Segments({ parts, format = formatInt }: { parts: Part[]; format?: (value: number) => string }) {
  const mounted = useMounted()
  const [active, setActive] = useState<string | null>(null)
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const shown = parts.filter((part) => part.value > 0)
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--neutral-soft)]" role="img" aria-label={parts.map((part) => `${part.label}: ${format(part.value)}`).join(', ')}>
        {shown.map((part) => (
          <div
            key={part.key}
            onPointerEnter={() => setActive(part.key)}
            onPointerLeave={() => setActive(null)}
            style={{ flexGrow: mounted ? part.value : 0, flexBasis: 0, background: part.color, opacity: active && active !== part.key ? 0.3 : 1, transition: 'flex-grow 0.95s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease' }}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {parts.map((part) => (
          <li
            key={part.key}
            onPointerEnter={() => setActive(part.key)}
            onPointerLeave={() => setActive(null)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors"
            style={{ background: active === part.key ? 'var(--neutral-soft)' : undefined }}
          >
            <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: part.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{part.label}</span>
            <span className="tnum font-semibold">{format(part.value)}</span>
            <span className="tnum w-12 text-right text-muted">{formatPercent(total ? Math.round((part.value / total) * 1000) / 10 : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------- controles */

export type Option<T extends string> = { value: T; label: string; count?: number }

/** Grupo de opções com o marcador que desliza até a escolhida. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: Option<T>[]; value: T | null; onChange: (value: T) => void; label: string }) {
  const root = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  const [ready, setReady] = useState(false)

  useIsoLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      const selected = element.querySelector<HTMLElement>('[aria-pressed="true"]')
      setThumb(selected ? { left: selected.offsetLeft, width: selected.offsetWidth } : null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const frame = requestAnimationFrame(() => setReady(true))
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value, options.length, options.map((option) => `${option.label}${option.count ?? ''}`).join('|')])

  return (
    <div ref={root} role="group" aria-label={label} className="relative inline-flex rounded-full border border-line bg-[var(--surface)] p-1">
      <span
        aria-hidden="true"
        className="absolute bottom-1 top-1 rounded-full bg-accent shadow-[0_6px_16px_-8px_var(--accent)]"
        style={{ left: 0, width: thumb?.width ?? 0, opacity: thumb ? 1 : 0, transform: `translateX(${thumb?.left ?? 0}px)`, transition: ready ? 'transform 0.38s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.38s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease' : 'none' }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-[1] inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-300 ${option.value === value ? 'text-[var(--accent-ink)]' : 'text-ink-2 hover:text-ink'}`}
        >
          {option.label}
          {option.count != null && <span className={`tnum text-[11.5px] font-medium ${option.value === value ? 'opacity-70' : 'text-muted'}`}>{formatInt(option.count)}</span>}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, htmlFor, children, className = '' }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export function Switch({ name, defaultChecked, label, hint }: { name: string; defaultChecked?: boolean; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative mt-0.5 h-6 w-11 flex-none rounded-full border border-line-2 bg-[var(--surface-3)] transition-colors duration-300 after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-[var(--muted)] after:transition-all after:duration-300 after:ease-out after:content-[''] peer-checked:border-transparent peer-checked:bg-accent peer-checked:after:translate-x-5 peer-checked:after:bg-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]" />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function Spinner({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="anim-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function ExportButtons({ resource, query }: { resource: string; query: string }) {
  return (
    <>
      <a className="btn btn-soft btn-sm" href={`/api/exports/${resource}.csv?${query}`}><Icon name="download" size={14} />CSV</a>
      <a className="btn btn-soft btn-sm" href={`/api/exports/${resource}.xlsx?${query}`}><Icon name="download" size={14} />Excel</a>
    </>
  )
}

const AVATAR = [
  'bg-accent-soft text-accent',
  'bg-[var(--info-soft)] text-info',
  'bg-[var(--ok-soft)] text-ok',
  'bg-[var(--warn-soft)] text-warn',
  'bg-[var(--serious-soft)] text-[var(--serious)]',
]

export function Avatar({ name, seed }: { name: string; seed: string }) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 9973
  return <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-[12px] font-bold ${AVATAR[hash % AVATAR.length]}`} aria-hidden="true">{initials(name)}</span>
}

/** Texto técnico (ID, código) em fonte fixa, com botão de copiar. */
export function Copyable({ value, short }: { value: string; short?: number }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* área de transferência bloqueada: o texto continua selecionável */ }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[12.5px]" title={value}>{short ? value.slice(0, short) : value}</span>
      <button type="button" onClick={copy} className="text-muted transition-colors hover:text-ink" aria-label={copied ? 'Copiado' : 'Copiar'}>
        <Icon name={copied ? 'check' : 'copy'} size={13} />
      </button>
    </span>
  )
}

/* ------------------------------------------------------------------ avisos */

type Toast = { id: number; tone: Tone; text: string; leaving?: boolean }
const ToastContext = createContext<(tone: Tone, text: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const TOAST_ICON: Record<Tone, { icon: string; color: string }> = {
  ok: { icon: 'check-circle', color: 'text-ok' },
  warn: { icon: 'alert', color: 'text-warn' },
  serious: { icon: 'alert', color: 'text-[var(--serious)]' },
  bad: { icon: 'x-circle', color: 'text-bad' },
  info: { icon: 'info', color: 'text-info' },
  neutral: { icon: 'info', color: 'text-ink-2' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)))
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 220)
  }, [])

  const notify = useCallback((tone: Tone, text: string) => {
    const id = ++counter.current
    setToasts((list) => [...list.slice(-3), { id, tone, text }])
    setTimeout(() => dismiss(id), 5200)
  }, [dismiss])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(360px,calc(100vw-40px))] flex-col gap-2.5" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto relative overflow-hidden rounded-2xl border border-line-2 bg-[var(--surface-2)] px-4 py-3 shadow-[var(--shadow-pop)]"
            style={{ animation: toast.leaving ? 'toast-out 0.22s ease-in forwards' : 'toast-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          >
            <div className="flex items-start gap-2.5">
              <Icon name={TOAST_ICON[toast.tone].icon} size={18} className={`mt-px flex-none ${TOAST_ICON[toast.tone].color}`} />
              <p className="flex-1 text-[13.5px]">{toast.text}</p>
              <button onClick={() => dismiss(toast.id)} className="text-muted transition-colors hover:text-ink" aria-label="Fechar aviso"><Icon name="x" size={15} /></button>
            </div>
            <span className="absolute bottom-0 left-0 h-[2px] w-full origin-left bg-[var(--accent)] opacity-60" style={{ animation: 'progress 5.2s linear reverse forwards' }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
