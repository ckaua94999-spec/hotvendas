'use client'
import { CSSProperties, PointerEvent, useEffect, useRef, useState } from 'react'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Verdadeiro um quadro depois de montar: dispara as transições de entrada (barras que crescem). */
export function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return mounted
}

/**
 * Número que conta até o valor. Na primeira vez sai do zero; quando o painel
 * atualiza, sai do valor que estava na tela. Com movimento reduzido, só troca.
 */
export function AnimatedNumber({ value, format = String, precision = 0, className }: { value: number; format?: (value: number) => string; precision?: number; className?: string }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  const current = useRef(0)

  useEffect(() => {
    const from = current.current
    const to = Number.isFinite(value) ? value : 0
    if (from === to || reduced) {
      current.current = to
      setShown(to)
      return
    }
    const started = performance.now()
    const duration = 900
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 4)
      const next = progress === 1 ? to : from + (to - from) * eased
      current.current = next
      setShown(next)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, reduced])

  const factor = Math.pow(10, precision)
  return <span className={className}>{format(Math.round(shown * factor) / factor)}</span>
}

/** Posição do bloco na cascata de entrada. */
export function stagger(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

/** Guarda a posição do ponteiro no elemento, para o brilho do cartão acompanhar. */
export function spotlight(event: PointerEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`)
  event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`)
}
