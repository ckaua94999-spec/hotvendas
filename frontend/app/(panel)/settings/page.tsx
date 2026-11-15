'use client'
import { DragEvent, FormEvent, ReactNode, useState } from 'react'
import { send, useApi } from '../../../components/api'
import { Icon } from '../../../components/icons'
import { Badge, ErrorState, Field, PageHeader, PageLoading, Spinner, Switch, useToast } from '../../../components/kit'
import { stagger } from '../../../components/motion'
import { parseReais } from '../../../lib/format'

type View = {
  product: { name?: string; description?: string; priceCents?: number; active?: boolean; accessInstructions?: string; presentationFileId?: string | null; presentationPath?: string | null; deliveryFileId?: string | null; deliveryPath?: string | null } | null
  messages: Record<string, string | null>
  secrets: Record<string, string>
}

const SECTIONS = [
  { id: 'produto', label: 'Produto', icon: 'box' },
  { id: 'mensagens', label: 'Mensagens do bot', icon: 'message' },
  { id: 'integracoes', label: 'Telegram e KavroPay', icon: 'key' },
  { id: 'recuperacao', label: 'Recuperação', icon: 'recovery' },
  { id: 'videos', label: 'Vídeos', icon: 'video' },
]

/** O vídeo que o bot envia tem esse teto; acima disso o Telegram não promete o envio. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function Section({ id, title, text, index, children }: { id: string; title: string; text: string; index: number; children: ReactNode }) {
  return (
    <section id={id} className="panel reveal scroll-mt-28 p-5 md:p-7" style={stagger(index)}>
      <h2 className="panel-title text-[17px]">{title}</h2>
      <p className="panel-sub mt-1 max-w-2xl">{text}</p>
      <div className="mt-6 grid gap-5">{children}</div>
    </section>
  )
}

function VideoUpload({ kind, title, hint, configured }: { kind: 'presentation' | 'delivery'; title: string; hint: string; configured: boolean }) {
  const toast = useToast()
  const [progress, setProgress] = useState<number | null>(null)
  const [done, setDone] = useState(configured)
  const [over, setOver] = useState(false)

  function upload(file: File | null | undefined) {
    if (!file || progress !== null) return
    if (file.size > MAX_VIDEO_BYTES) { toast('warn', 'O vídeo passa de 50 MB. O bot só envia arquivos até esse tamanho.'); return }
    const body = new FormData()
    body.set('kind', kind)
    body.set('file', file)
    const request = new XMLHttpRequest()
    request.open('POST', '/api/settings/video')
    request.withCredentials = true
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)) }
    request.onerror = () => { setProgress(null); toast('bad', 'O envio do vídeo falhou. Confira a conexão e tente de novo.') }
    request.onload = () => {
      setProgress(null)
      if (request.status === 401) { window.location.href = '/login'; return }
      let failed = request.status >= 400
      try { if (JSON.parse(request.responseText)?.error) failed = true } catch { /* resposta sem corpo: vale o código HTTP */ }
      if (failed) { toast('bad', request.status === 403 ? 'Só o dono da operação troca os vídeos.' : 'O vídeo não foi aceito.'); return }
      setDone(true)
      toast('ok', `${title} recebido. O bot passa a usar o arquivo novo.`)
    }
    setProgress(0)
    request.send(body)
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setOver(false)
    upload(event.dataTransfer.files?.[0])
  }

  return (
    <label
      onDragOver={(event) => { event.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`relative block cursor-pointer overflow-hidden rounded-2xl border border-dashed p-5 transition-colors duration-200 ${over ? 'border-[var(--accent)] bg-accent-soft' : 'border-line-2 hover:border-[var(--muted)]'}`}
    >
      <input type="file" accept="video/*" className="sr-only" disabled={progress !== null} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = '' }} />
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[var(--neutral-soft)] text-ink-2">{progress !== null ? <Spinner size={18} /> : <Icon name="video" size={20} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold">{title}</p>
            {done ? <Badge tone="ok">Configurado</Badge> : <Badge tone="warn">Falta enviar</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-muted">{hint}</p>
          <p className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-accent">
            <Icon name="upload" size={14} />
            {progress !== null ? `Enviando, ${progress}%` : done ? 'Trocar o vídeo' : 'Escolher o vídeo'}
            <span className="font-normal text-muted">ou solte o arquivo aqui · até 50 MB</span>
          </p>
        </div>
      </div>
      {progress !== null && <span className="absolute bottom-0 left-0 h-[3px] bg-[var(--accent)] transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} />}
    </label>
  )
}

export default function SettingsPage() {
  const { data, error, reload } = useApi<View>('/api/settings', { poll: false })
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<View | null>(null)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <PageLoading title="Configurações" />

  const view = saved || data
  const product = view.product || {}
  const messages = view.messages || {}
  const secrets = view.secrets || {}
  const price = product.priceCents ? (product.priceCents / 100).toFixed(2).replace('.', ',') : ''

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const text = (name: string) => String(fields.get(name) ?? '')
    setSaving(true)
    const response = await send('/api/settings', 'PUT', {
      product: { name: text('name'), description: text('description'), priceCents: parseReais(text('price')), active: fields.get('active') === 'on', accessInstructions: text('access') },
      messages: { welcome: text('welcome'), payment: text('payment'), approval: text('approval'), delivery: text('delivery'), support: text('support'), supportUrl: text('supportUrl') },
      secrets: { telegramToken: text('telegramToken'), kavroApiKey: text('kavroApiKey'), kavroWebhookSecret: text('kavroWebhookSecret') },
      pixExpiresMinutes: Number(text('pixExpires') || 30),
      recovery: {
        noPixMinutes: Number(text('noPixMinutes')), unpaidMinutes: Number(text('unpaidMinutes')), expiredMinutes: Number(text('expiredMinutes')),
        noPixText: text('noPixText'), unpaidText: text('unpaidText'), expiredText: text('expiredText'),
        noPixEnabled: fields.get('noPixEnabled') === 'on', unpaidEnabled: fields.get('unpaidEnabled') === 'on', expiredEnabled: fields.get('expiredEnabled') === 'on',
      },
    })
    setSaving(false)
    if (!response.ok) {
      toast('bad', response.status === 403 ? 'Só o dono da operação altera as configurações.' : 'Não salvou. Nada foi alterado.')
      return
    }
    // Os segredos saem dos campos depois de gravados: a tela só guarda os quatro últimos caracteres.
    for (const name of ['telegramToken', 'kavroApiKey', 'kavroWebhookSecret']) {
      const input = form.elements.namedItem(name)
      if (input instanceof HTMLInputElement) input.value = ''
    }
    if (response.json) setSaved(response.json as View)
    toast('ok', 'Configurações salvas. Os segredos continuam mascarados.')
  }

  const secretHint = (masked: string | undefined) => (masked ? `Salvo, termina em ${masked.replace(/•/g, '')}. Deixe em branco para manter.` : 'Ainda não configurado.')

  return (
    <div>
      <PageHeader eyebrow="Sistema" title="Configurações" subtitle="Produto, textos do bot, vídeos, gateway e recuperação. As mudanças valem assim que salvar." />

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="reveal hidden self-start xl:sticky xl:top-24 xl:block" aria-label="Seções das configurações">
          <ul className="grid gap-1">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-[var(--neutral-soft)] hover:text-ink">
                  <Icon name={section.icon} size={16} className="text-muted" />{section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 gap-4">
          <form onSubmit={save} className="grid gap-4">
            <Section index={1} id="produto" title="Produto" text="O que está à venda no bot. Mudar o preço não altera pedidos já abertos.">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
                <Field label="Nome do produto" htmlFor="name"><input id="name" name="name" defaultValue={product.name || ''} className="input" /></Field>
                <Field label="Preço (R$)" htmlFor="price"><input id="price" name="price" defaultValue={price} inputMode="decimal" placeholder="0,00" className="input tnum" /></Field>
              </div>
              <Field label="Descrição" htmlFor="description"><textarea id="description" name="description" defaultValue={product.description || ''} className="input" /></Field>
              <Switch name="active" defaultChecked={Boolean(product.active)} label="Produto ativo" hint="Sem produto ativo, o bot responde que o produto ainda não está disponível." />
            </Section>

            <Section index={2} id="mensagens" title="Mensagens do bot" text="Os textos que a pessoa recebe no Telegram, na ordem em que aparecem.">
              <Field label="Boas-vindas" htmlFor="welcome" hint="Enviada logo depois do vídeo de apresentação, com o botão de comprar."><textarea id="welcome" name="welcome" defaultValue={messages.msg_welcome || ''} className="input min-h-[130px]" /></Field>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Mensagem de pagamento" htmlFor="payment" hint="Vai junto do QR code do PIX, antes do valor e da validade."><textarea id="payment" name="payment" defaultValue={messages.msg_payment || ''} className="input" /></Field>
                <Field label="Mensagem de aprovação" htmlFor="approval" hint="Enviada quando a KavroPay confirma o pagamento."><textarea id="approval" name="approval" defaultValue={messages.msg_approval || ''} className="input" /></Field>
                <Field label="Instruções de acesso" htmlFor="delivery" hint="Vira a legenda do vídeo de entrega quando o texto junto do vídeo está vazio."><textarea id="delivery" name="delivery" defaultValue={messages.msg_delivery || ''} className="input" /></Field>
                <Field label="Texto junto do vídeo" htmlFor="access" hint="Legenda do vídeo de entrega. Tem prioridade sobre as instruções de acesso."><textarea id="access" name="access" defaultValue={product.accessInstructions || ''} className="input" /></Field>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Suporte" htmlFor="support" hint="Resposta ao comando /suporte."><textarea id="support" name="support" defaultValue={messages.msg_support || ''} className="input" /></Field>
                <Field label="Link de suporte" htmlFor="supportUrl" hint="Vai logo abaixo do texto de suporte."><input id="supportUrl" name="supportUrl" defaultValue={messages.support_url || ''} placeholder="https://" className="input" /></Field>
              </div>
            </Section>

            <Section index={3} id="integracoes" title="Telegram e KavroPay" text="As credenciais ficam cifradas. A tela mostra só os quatro últimos caracteres e nunca devolve o valor inteiro.">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Token do Telegram" htmlFor="telegramToken" hint={secretHint(secrets.telegram_token)}><input id="telegramToken" name="telegramToken" autoComplete="off" spellCheck={false} placeholder={secrets.telegram_token || 'Cole o token do BotFather'} className="input font-mono text-[13px]" /></Field>
                <Field label="Chave da KavroPay" htmlFor="kavroApiKey" hint={secretHint(secrets.kavro_api_key)}><input id="kavroApiKey" name="kavroApiKey" autoComplete="off" spellCheck={false} placeholder={secrets.kavro_api_key || 'kvk_live_ ou kvk_test_'} className="input font-mono text-[13px]" /></Field>
                <Field label="Segredo do webhook" htmlFor="kavroWebhookSecret" hint={secretHint(secrets.kavro_webhook_secret)}><input id="kavroWebhookSecret" name="kavroWebhookSecret" autoComplete="off" spellCheck={false} placeholder={secrets.kavro_webhook_secret || 'Segredo cadastrado na KavroPay'} className="input font-mono text-[13px]" /></Field>
                <Field label="Validade do PIX (minutos)" htmlFor="pixExpires" hint="Depois disso a cobrança expira."><input id="pixExpires" name="pixExpires" type="number" min={1} defaultValue={messages.pix_expires_minutes || '30'} className="input tnum" /></Field>
              </div>
            </Section>

            <Section index={4} id="recuperacao" title="Recuperação" text="Mensagens para quem parou antes de pagar. Cada etapa manda no máximo uma mensagem por pessoa.">
              {[
                { key: 'noPix', title: 'Quem não gerou PIX', minutes: messages.recovery_no_pix_minutes || '60', text: messages.recovery_no_pix_text, enabled: messages.recovery_no_pix_enabled, wait: 'Contados do primeiro acesso.' },
                { key: 'unpaid', title: 'PIX em aberto', minutes: messages.recovery_unpaid_minutes || '30', text: messages.recovery_unpaid_text, enabled: messages.recovery_unpaid_enabled, wait: 'Contados da geração do PIX.' },
                { key: 'expired', title: 'PIX expirado', minutes: messages.recovery_expired_minutes || '1440', text: messages.recovery_expired_text, enabled: messages.recovery_expired_enabled, wait: 'Contados do vencimento do PIX.' },
              ].map((stage) => (
                <div key={stage.key} className="rounded-2xl border border-line p-4 md:p-5">
                  <Switch name={`${stage.key}Enabled`} defaultChecked={stage.enabled !== '0'} label={stage.title} hint="Desligado, ninguém nesta situação recebe mensagem." />
                  <div className="mt-4 grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
                    <Field label="Espera (minutos)" htmlFor={`${stage.key}Minutes`} hint={stage.wait}><input id={`${stage.key}Minutes`} name={`${stage.key}Minutes`} type="number" min={1} defaultValue={stage.minutes} className="input tnum" /></Field>
                    <Field label="Mensagem" htmlFor={`${stage.key}Text`}><textarea id={`${stage.key}Text`} name={`${stage.key}Text`} defaultValue={stage.text || ''} className="input min-h-[76px]" /></Field>
                  </div>
                </div>
              ))}
            </Section>

            <div className="reveal sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-2 bg-[var(--surface-2)] px-5 py-3 shadow-[var(--shadow-pop)]" style={stagger(5)}>
              <p className="text-[13px] text-ink-2">Produto, mensagens, integrações e recuperação são salvos juntos.</p>
              <button className="btn btn-primary" disabled={saving}>{saving ? <Spinner /> : <Icon name="check" size={15} />}{saving ? 'Salvando' : 'Salvar alterações'}</button>
            </div>
          </form>

          <Section index={6} id="videos" title="Vídeos" text="Cada vídeo é enviado na hora em que você escolhe o arquivo, sem precisar salvar.">
            <div className="grid gap-4 lg:grid-cols-2">
              <VideoUpload kind="presentation" title="Vídeo de apresentação" hint="O que a pessoa vê ao iniciar o bot." configured={Boolean(product.presentationFileId || product.presentationPath)} />
              <VideoUpload kind="delivery" title="Vídeo de entrega" hint="O conteúdo liberado depois do pagamento confirmado." configured={Boolean(product.deliveryFileId || product.deliveryPath)} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
