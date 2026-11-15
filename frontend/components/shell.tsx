'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatCalendarDate } from '../lib/format'
import { POLL_MS, queryString, refreshAll, send, useApi, useLive } from './api'
import { BrandMark, Icon, Wordmark } from './icons'
import { Option, Segmented, ToastProvider } from './kit'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const NAV: { title: string; links: { href: string; label: string; icon: string }[] }[] = [
  { title: 'Visão geral', links: [
    { href: '/dashboard', label: 'Painel', icon: 'dashboard' },
    { href: '/funnel', label: 'Funil', icon: 'funnel' },
  ] },
  { title: 'Pessoas', links: [
    { href: '/users', label: 'Usuários', icon: 'users' },
    { href: '/campaigns', label: 'Campanhas', icon: 'megaphone' },
    { href: '/recovery', label: 'Recuperação', icon: 'recovery' },
    { href: '/downsell', label: 'Downsell', icon: 'percent' },
  ] },
  { title: 'Vendas', links: [
    { href: '/orders', label: 'Pedidos', icon: 'bag' },
    { href: '/deliveries', label: 'Entregas', icon: 'send' },
    { href: '/finance', label: 'Financeiro', icon: 'wallet' },
  ] },
  { title: 'Sistema', links: [
    { href: '/settings', label: 'Configurações', icon: 'sliders' },
  ] },
]

const PRESETS: Option<string>[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'este_mes', label: 'Este mês' },
  { value: 'mes_anterior', label: 'Mês anterior' },
]

/** Telas cujos números mudam com o período. Nas outras o filtro não aparece, porque não filtraria nada. */
const PERIOD_PAGES = ['/dashboard', '/funnel', '/campaigns', '/orders', '/finance']

const TITLES: Record<string, string> = {
  '/dashboard': 'Operação', '/funnel': 'Funil', '/users': 'Usuários', '/campaigns': 'Campanhas', '/recovery': 'Recuperação', '/downsell': 'Downsell',
  '/orders': 'Pedidos', '/deliveries': 'Entregas', '/finance': 'Financeiro', '/settings': 'Configurações',
}

function activeHref(path: string) {
  return NAV.flatMap((group) => group.links).find((link) => path === link.href || path.startsWith(`${link.href}/`))?.href || ''
}

/* ------------------------------------------------------------ barra lateral */

function Sidebar({ path, query, onNavigate }: { path: string; query: string; onNavigate?: () => void }) {
  const nav = useRef<HTMLElement>(null)
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null)
  const [ready, setReady] = useState(false)
  const current = activeHref(path)
  const me = useApi<{ email: string; role: string }>('/api/auth/me', { poll: false })

  useIsoLayoutEffect(() => {
    const selected = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
    setMarker(selected ? { top: selected.offsetTop, height: selected.offsetHeight } : null)
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [current])

  async function logout() {
    await send('/api/auth/logout', 'POST')
    window.location.href = '/login'
  }

  return (
    <div className="flex h-full flex-col bg-[var(--side-bg)] text-[var(--side-text)]">
      <Link href={`/dashboard?${query}`} onClick={onNavigate} className="flex items-center gap-3 px-6 pb-2 pt-7">
        <BrandMark size={34} color="var(--side-accent)" />
        <span>
          <Wordmark size={19} accent="var(--side-accent)" className="block" />
          <span className="mt-1.5 block text-[10.5px] uppercase tracking-[0.2em] text-[var(--side-muted)]">Painel da operação</span>
        </span>
      </Link>

      <nav ref={nav} className="relative mt-6 flex-1 overflow-y-auto px-3 pb-4" aria-label="Seções do painel">
        <span
          aria-hidden="true"
          className="absolute left-3 right-3 rounded-xl bg-[var(--side-active)]"
          style={{ top: 0, height: marker?.height ?? 0, opacity: marker ? 1 : 0, transform: `translateY(${marker?.top ?? 0}px)`, transition: ready ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.3s ease, opacity 0.2s ease' : 'none' }}
        >
          <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-[var(--side-accent)]" />
        </span>
        {NAV.map((group) => (
          <div key={group.title} className="mb-5">
            <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--side-muted)]">{group.title}</p>
            {group.links.map((link) => {
              const active = link.href === current
              return (
                <Link
                  key={link.href}
                  href={`${link.href}?${query}`}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative z-[1] flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors duration-200 ${active ? 'font-semibold text-[var(--side-text)]' : 'text-[var(--side-muted)] hover:text-[var(--side-text)]'}`}
                >
                  <Icon name={link.icon} size={18} className={`flex-none transition-transform duration-300 ease-out group-hover:scale-110 ${active ? 'text-[var(--side-accent)]' : ''}`} />
                  {link.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--side-line)] px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--side-active)] text-[var(--side-accent)]"><Icon name="user" size={17} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{me.data?.email || 'Administrador'}</p>
            <p className="text-[11.5px] text-[var(--side-muted)]">{me.data?.role === 'owner' ? 'Dono da operação' : me.data?.role === 'operator' ? 'Operador' : ' '}</p>
          </div>
          <button onClick={logout} className="grid h-9 w-9 flex-none place-items-center rounded-xl text-[var(--side-muted)] transition-colors hover:bg-[var(--side-active)] hover:text-[var(--side-text)]" aria-label="Sair" title="Sair">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ período */

function PeriodPresets() {
  const path = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const preset = params.get('preset') || 'hoje'
  return <Segmented label="Período" options={PRESETS} value={preset === 'custom' ? null : preset} onChange={(value) => router.push(`${path}?preset=${value}`)} />
}

function PeriodRange() {
  const path = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const custom = params.get('preset') === 'custom'
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const from = String(data.get('from') || '')
    const to = String(data.get('to') || '')
    if (!from || !to) return
    setOpen(false)
    router.push(`${path}?preset=custom&from=${from}&to=${to}`)
  }

  const from = params.get('from') || ''
  const to = params.get('to') || ''
  return (
    <div ref={box} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${custom ? 'border-[var(--accent-line)] bg-accent-soft text-accent' : 'border-line bg-[var(--surface)] text-ink-2 hover:text-ink'}`}
      >
        <Icon name="calendar" size={15} />
        {custom && from && to ? `${formatCalendarDate(from).slice(0, 5)} a ${formatCalendarDate(to).slice(0, 5)}` : 'Intervalo'}
      </button>
      {open && (
        <form onSubmit={apply} className="anim-pop absolute right-0 top-12 z-40 w-[264px] rounded-2xl border border-line-2 bg-[var(--surface-2)] p-4 shadow-[var(--shadow-pop)] xl:left-0 xl:right-auto">
          <p className="text-[13px] font-semibold">Intervalo de datas</p>
          <label className="mt-3 block">
            <span className="field-label">De</span>
            <input name="from" type="date" required defaultValue={from} className="input" />
          </label>
          <label className="mt-3 block">
            <span className="field-label">Até</span>
            <input name="to" type="date" required defaultValue={to} className="input" />
          </label>
          <button className="btn btn-primary mt-4 w-full">Aplicar</button>
        </form>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ ao vivo */

function LiveIndicator() {
  const live = useLive()
  const [now, setNow] = useState(0)
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const elapsed = live.at && now ? Math.max(0, now - live.at) : 0
  const seconds = Math.floor(elapsed / 1000)
  const progress = live.at ? Math.min(1, elapsed / POLL_MS) : 0
  const text = live.failing ? 'Sem conexão' : !live.at ? 'Conectando' : seconds < 3 ? 'Atualizado agora' : `Atualizado há ${seconds} s`
  const color = live.failing ? 'var(--warn)' : 'var(--ok)'
  const circumference = 2 * Math.PI * 9
  // Tela que não se atualiza sozinha (configurações) não promete "ao vivo".
  if (live.polling === 0) return null

  function refresh() {
    setSpinning(true)
    refreshAll()
    setTimeout(() => setSpinning(false), 700)
  }

  return (
    <button type="button" onClick={refresh} title="Atualizar agora" className="group inline-flex h-10 items-center gap-2.5 rounded-full border border-line bg-[var(--surface)] pl-2.5 pr-3.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink">
      <span className="relative grid h-6 w-6 place-items-center">
        <svg width="24" height="24" viewBox="0 0 24 24" className="absolute -rotate-90" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line-2)" strokeWidth="2" />
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        {spinning ? (
          <Icon name="refresh" size={11} className="anim-spin" style={{ color }} />
        ) : (
          <span className="relative h-2 w-2 rounded-full" style={{ background: color }}>
            {!live.failing && <span className="absolute inset-0 rounded-full" style={{ background: color, animation: 'ping 2.2s cubic-bezier(0, 0, 0.2, 1) infinite' }} />}
          </span>
        )}
      </span>
      <span className="tnum hidden sm:inline" aria-live="off">{text}</span>
    </button>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.add('theme-switching')
    root.dataset.theme = next
    try { localStorage.setItem('hotvendas-theme', next) } catch { /* sem armazenamento: vale só nesta visita */ }
    setTheme(next)
    setTimeout(() => root.classList.remove('theme-switching'), 450)
  }

  return (
    <button type="button" onClick={toggle} className="relative grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full border border-line bg-[var(--surface)] text-ink-2 transition-colors hover:text-ink" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
      <Icon name="sun" size={17} className="absolute transition-all duration-500 ease-out" style={{ transform: theme === 'dark' ? 'rotate(0) scale(1)' : 'rotate(90deg) scale(0)', opacity: theme === 'dark' ? 1 : 0 }} />
      <Icon name="moon" size={17} className="absolute transition-all duration-500 ease-out" style={{ transform: theme === 'light' ? 'rotate(0) scale(1)' : 'rotate(-90deg) scale(0)', opacity: theme === 'light' ? 1 : 0 }} />
    </button>
  )
}

/* ------------------------------------------------------------------- casca */

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const params = useSearchParams()
  const query = queryString(params)
  const [drawer, setDrawer] = useState(false)
  const hasPeriod = PERIOD_PAGES.includes(path)

  useEffect(() => { setDrawer(false) }, [path])
  useEffect(() => {
    const title = TITLES[activeHref(path)]
    document.title = title ? `${title} · Hot Vendas` : 'Hot Vendas'
  }, [path])
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawer])

  return (
    <ToastProvider>
      <div className="min-h-screen lg:pl-[264px]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-[var(--side-line)] lg:block">
          <Sidebar path={path} query={query} />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setDrawer(false)} aria-label="Fechar menu" />
            <aside className="absolute inset-y-0 left-0 w-[280px] shadow-2xl" style={{ animation: 'slide-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
              <Sidebar path={path} query={query} onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <header className="sticky top-0 z-30 border-b border-line backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)' }}>
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 md:px-8">
            <button className="icon-btn flex-none lg:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Icon name="menu" size={20} /></button>
            <div className="flex items-center gap-2.5 lg:hidden">
              <BrandMark size={26} />
              <Wordmark size={16} />
            </div>
            {hasPeriod && <div className="hidden min-w-0 items-center gap-2 xl:flex"><PeriodPresets /><PeriodRange /></div>}
            <div className="ml-auto flex items-center gap-2">
              <LiveIndicator />
              <ThemeToggle />
            </div>
          </div>
          {hasPeriod && (
            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 md:px-8 xl:hidden">
              <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto"><PeriodPresets /></div>
              <PeriodRange />
            </div>
          )}
        </header>

        <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-8 md:px-8">
          <div key={path}>{children}</div>
        </main>
      </div>
    </ToastProvider>
  )
}
