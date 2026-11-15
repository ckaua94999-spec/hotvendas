'use client'
import { CSSProperties, FormEvent, useState } from 'react'
import { BrandMark, Icon, Wordmark } from '../../components/icons'
import { Spinner } from '../../components/kit'
import { stagger } from '../../components/motion'

// Fagulhas que sobem da chama: posição, deriva e ritmo fixos, para a tela ser igual a cada visita.
const EMBERS = [
  { left: '38%', drift: '-34px', seconds: 6.5, delay: 0 },
  { left: '46%', drift: '22px', seconds: 5.2, delay: 1.4 },
  { left: '52%', drift: '-12px', seconds: 7.4, delay: 0.6 },
  { left: '58%', drift: '40px', seconds: 6.1, delay: 2.8 },
  { left: '44%', drift: '10px', seconds: 8.2, delay: 3.6 },
  { left: '62%', drift: '-26px', seconds: 5.6, delay: 4.4 },
  { left: '50%', drift: '30px', seconds: 6.9, delay: 5.1 },
  { left: '55%', drift: '-40px', seconds: 7.8, delay: 2.1 },
]

export default function LoginPage() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // 'reveal' na chegada, 'shake' a cada erro; some quando a animação termina, para poder tocar de novo.
  const [motion, setMotion] = useState<'reveal' | 'anim-shake' | ''>('reveal')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    let message = ''
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      })
      if (response.ok) { window.location.href = '/dashboard'; return }
      message = response.status === 429 ? 'Muitas tentativas. Espere um pouco e tente de novo.' : 'E-mail ou senha não conferem.'
    } catch {
      message = 'Sem conexão com o servidor.'
    }
    setBusy(false)
    setError(message)
    setMotion('anim-shake')
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-[var(--side-bg)] text-[var(--side-text)] lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute bottom-[-4%] right-[-16%] aspect-square w-[74%] max-w-[680px]" aria-hidden="true">
          <div className="absolute inset-[16%] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, var(--side-accent), transparent 68%)', opacity: 0.32 }} />
          <BrandMark size="100%" animated color="var(--side-accent)" className="relative" />
          {EMBERS.map((ember, index) => (
            <span key={index} className="absolute bottom-[30%] h-1.5 w-1.5 rounded-full bg-[var(--side-accent)]" style={{ left: ember.left, opacity: 0, animation: `ember ${ember.seconds}s linear ${ember.delay}s infinite`, '--dx': ember.drift } as CSSProperties} />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, var(--side-bg) 42%, transparent 88%)' }} aria-hidden="true" />
        <p className="reveal relative flex items-center gap-3">
          <BrandMark size={36} color="var(--side-accent)" />
          <Wordmark size={21} accent="var(--side-accent)" />
        </p>
        <div className="relative max-w-[26rem]">
          <h2 className="reveal text-[46px] leading-[1.08]" style={stagger(1)}>A operação inteira, do primeiro /start ao conteúdo entregue.</h2>
          <ul className="mt-9 grid gap-4 text-[15px] text-[var(--side-muted)]">
            {[
              ['funnel', 'Quem entrou, onde parou e quem pagou.'],
              ['wallet', 'Bruto, taxa, líquido e resultado, sem número estimado.'],
              ['send', 'Entrega só depois que a KavroPay confirma.'],
            ].map(([icon, text], index) => (
              <li key={icon} className="reveal flex items-center gap-3" style={stagger(index + 3)}>
                <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[var(--side-active)] text-[var(--side-accent)]"><Icon name={icon} size={17} /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="reveal relative text-[12px] uppercase tracking-[0.2em] text-[var(--side-muted)]" style={stagger(7)}>Vendas no Telegram · PIX pela KavroPay</p>
      </section>

      <section className="grid place-items-center px-6 py-12">
        <form onSubmit={submit} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setMotion('') }} className={`w-full max-w-[400px] ${motion}`}>
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size={38} />
            <Wordmark size={22} />
          </div>
          <p className="eyebrow">Painel</p>
          <h1 className="mt-2 text-[38px] leading-[1.1]">Entrar na operação</h1>
          <p className="mt-2 text-[14px] text-ink-2">Use o e-mail e a senha de administrador.</p>

          <label className="mt-8 block">
            <span className="field-label">E-mail</span>
            <input name="email" type="email" required autoComplete="username" autoFocus className="input h-12 text-[15px]" />
          </label>
          <label className="mt-4 block">
            <span className="field-label">Senha</span>
            <input name="password" type="password" required autoComplete="current-password" className="input h-12 text-[15px]" />
          </label>

          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--bad-soft)] px-3.5 py-2.5 text-[13.5px] text-bad" role="alert">
              <Icon name="alert" size={15} className="flex-none" /><span className="text-ink">{error}</span>
            </p>
          )}

          <button className="btn btn-primary mt-6 h-12 w-full text-[15px]" disabled={busy}>
            {busy ? <Spinner /> : null}{busy ? 'Entrando' : 'Entrar'}{!busy && <Icon name="arrow-right" size={16} />}
          </button>
        </form>
      </section>
    </main>
  )
}
