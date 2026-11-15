'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Intervalo de atualização do painel enquanto a aba está aberta. */
export const POLL_MS = 15000

// Estado compartilhado do "ao vivo": quando chegou o último dado, se a última consulta falhou
// e quantas consultas da tela se repetem sozinhas (zero numa tela que só carrega uma vez).
type Live = { at: number; failing: boolean; polling: number }
let live: Live = { at: 0, failing: false, polling: 0 }
const liveListeners = new Set<() => void>()
const refreshListeners = new Set<() => void>()

function setLive(next: Partial<Live>) {
  live = { ...live, ...next }
  liveListeners.forEach((listener) => listener())
}

function subscribeLive(listener: () => void) {
  liveListeners.add(listener)
  return () => { liveListeners.delete(listener) }
}

export function useLive() {
  return useSyncExternalStore(subscribeLive, () => live, () => live)
}

/** Refaz agora todas as consultas abertas na tela. */
export function refreshAll() {
  refreshListeners.forEach((listener) => listener())
}

type State<T> = { data: T | null; dataPath: string; error: string; errorPath: string }

/**
 * Consulta a API e repete a cada 15 segundos. Guarda o último dado enquanto
 * recarrega: a tela não pisca, e quando a resposta vem igual nada redesenha.
 */
export function useApi<T>(path: string, options: { poll?: boolean } = {}) {
  const poll = options.poll !== false
  const [state, setState] = useState<State<T>>({ data: null, dataPath: path, error: '', errorPath: '' })
  const lastText = useRef('')
  const loader = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    let stop = false
    lastText.current = ''
    const fail = (message: string) => {
      setLive({ failing: true })
      setState((previous) => ({ ...previous, error: message, errorPath: path }))
    }
    const load = async () => {
      try {
        const response = await fetch(path, { credentials: 'include' })
        if (stop) return
        if (response.status === 401) { window.location.href = '/login'; return }
        if (!response.ok) { fail('Não foi possível carregar.'); return }
        const text = await response.text()
        if (stop) return
        setLive({ at: Date.now(), failing: false })
        // Resposta vazia é a API dizendo que o registro não existe.
        if (!text || text === 'null') { setState((previous) => ({ ...previous, error: 'Não encontrado.', errorPath: path })); return }
        if (text === lastText.current) {
          setState((previous) => (previous.error ? { ...previous, error: '', errorPath: '' } : previous))
          return
        }
        lastText.current = text
        setState({ data: JSON.parse(text) as T, dataPath: path, error: '', errorPath: '' })
      } catch {
        if (!stop) fail('Sem conexão com o servidor.')
      }
    }
    loader.current = load
    if (poll) setLive({ polling: live.polling + 1 })
    load()
    const timer = poll ? setInterval(() => { if (!document.hidden) load() }, POLL_MS) : undefined
    const onVisible = () => { if (poll && !document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    refreshListeners.add(load)
    return () => {
      stop = true
      if (poll) setLive({ polling: Math.max(0, live.polling - 1) })
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      refreshListeners.delete(load)
    }
  }, [path, poll])

  const reload = useCallback(() => loader.current(), [])
  const current = state.dataPath === path
  const failed = state.error !== '' && state.errorPath === path
  // Dado de outro filtro só continua na tela enquanto o novo carrega; se o novo falhou, sai.
  const data = failed && !current ? null : state.data
  return {
    data,
    error: data === null && failed ? state.error : '',
    loading: data === null && !failed,
    stale: data !== null && !current,
    reload,
  }
}

/** Envia uma ação para a API. Sessão vencida leva ao login. */
export async function send(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status === 401) { window.location.href = '/login'; return { ok: false, status: 401, json: null } }
    const json = await response.json().catch(() => null)
    return { ok: response.ok && !json?.error, status: response.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}

const PERIOD_KEYS = ['preset', 'from', 'to']

/** Só o período da URL, na forma que a API espera. Sem período, vale hoje. */
export function queryString(params: { get(name: string): string | null }) {
  const next = new URLSearchParams()
  for (const key of PERIOD_KEYS) {
    const value = params.get(key)
    if (value) next.set(key, value)
  }
  return next.toString() || 'preset=hoje'
}
