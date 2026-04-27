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

/**
 * Format types · server-safe (string identifier · serializavel).
 * Use isso em Server Components em vez de `format` (function), que crasha
 * no boundary RSC/client com digest opaco.
 */
export type CountUpFormatType =
  | 'integer'         // 1234
  | 'decimal-1'       // 12.3
  | 'decimal-2'       // 12.34
  | 'percent-int'     // 12%
  | 'percent-1d'      // 12.5%
  | 'percent-signed'  // +12.5% / -12.5%
  | 'currency-brl'    // R$ 1.234
  | 'currency-brl-cents' // R$ 1.234,56

export interface CountUpProps {
  /** Valor alvo · numerico */
  value: number
  /** Duracao da animacao em ms · default 800 */
  duration?: number
  /**
   * Funcao de formatacao customizada (CLIENT-SIDE only · funcoes nao
   * cruzam boundary RSC). Use em componentes 'use client'.
   */
  format?: (n: number) => string
  /**
   * String identifier do formatter · server-safe. Use em Server Components
   * em vez de `format` function. Mig 2026-04-26 (digest opaco fix).
   */
  formatType?: CountUpFormatType
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

/** Resolve formatType identifier → formatter function (client-side). */
function resolveFormatType(t: CountUpFormatType): (n: number) => string {
  switch (t) {
    case 'integer':
      return (n) => Math.round(n).toLocaleString('pt-BR')
    case 'decimal-1':
      return (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case 'decimal-2':
      return (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'percent-int':
      return (n) => `${Math.round(n)}%`
    case 'percent-1d':
      return (n) => `${n.toFixed(1)}%`
    case 'percent-signed':
      return (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
    case 'currency-brl':
      return (n) =>
        Math.round(n).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          maximumFractionDigits: 0,
        })
    case 'currency-brl-cents':
      return (n) =>
        n.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  }
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
  format,
  formatType,
  className,
}: CountUpProps) {
  // Resolve formatter · prioridade: format function > formatType string > default
  const fmt = format ?? (formatType ? resolveFormatType(formatType) : defaultFormat)
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

  return <span className={className}>{fmt(display)}</span>
}
