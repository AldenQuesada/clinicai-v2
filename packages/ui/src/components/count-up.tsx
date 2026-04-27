'use client'

/**
 * CountUp · animacao numerica com requestAnimationFrame puro.
 *
 * Sem dep externa (zero Framer Motion). Easing easeOutExpo · re-anima
 * quando `value` muda. SSR-safe: primeiro paint mostra valor final
 * formatado (sem flicker visual quando JS nao roda · graceful degrade).
 *
 * Uso tipico:
 *   <CountUp value={1234} />
 *   <CountUp value={42.5} format={(n) => `${n.toFixed(1)}%`} />
 *   <CountUp value={9990} format={(n) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`} />
 *
 * Comportamento:
 *   - Anima de "ultimo valor renderizado" → "value novo" em `duration` ms
 *   - Primeira montagem: anima de 0 → value (efeito hero · pega atencao)
 *   - prefers-reduced-motion: pula direto pro valor final (a11y)
 */

import * as React from 'react'

export interface CountUpProps {
  /** Valor alvo · numerico */
  value: number
  /** Duracao da animacao em ms · default 800 */
  duration?: number
  /** Funcao de formatacao · default toLocaleString('pt-BR') */
  format?: (n: number) => string
  /** Override CSS */
  className?: string
}

const DEFAULT_DURATION = 800

function defaultFormat(n: number): string {
  // Mantem decimais pro caller que passa float (ex: 12.5%); arredonda
  // pra inteiros razoavelmente. Caller pode override via `format`.
  if (Number.isInteger(n)) return n.toLocaleString('pt-BR')
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

// easeOutExpo · 0→1 com decay exponencial. Sensacao "snap" no inicio,
// settle suave no final. Boa pra contadores ("conta rapido depois desacelera").
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function CountUp({
  value,
  duration = DEFAULT_DURATION,
  format = defaultFormat,
  className,
}: CountUpProps) {
  // Estado interno renderizado · SSR usa o `value` final (sem flicker).
  const [display, setDisplay] = React.useState<number>(value)
  const fromRef = React.useRef<number>(value)
  const rafRef = React.useRef<number | null>(null)
  const startRef = React.useRef<number>(0)
  // Flag pra distinguir mount inicial (anima de 0) de updates (anima de prev)
  const mountedRef = React.useRef<boolean>(false)

  React.useEffect(() => {
    // Reduced motion · pula animacao
    if (prefersReducedMotion()) {
      fromRef.current = value
      setDisplay(value)
      return
    }

    // Mount inicial · anima de 0 → value (hero effect)
    // Update · anima de display atual → value
    const from = mountedRef.current ? fromRef.current : 0
    const to = value
    mountedRef.current = true

    if (from === to) {
      setDisplay(to)
      return
    }

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
    }
    startRef.current = 0

    const tick = (ts: number) => {
      if (startRef.current === 0) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / duration)
      const eased = easeOutExpo(t)
      const current = from + (to - from) * eased
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [value, duration])

  return <span className={className}>{format(display)}</span>
}
