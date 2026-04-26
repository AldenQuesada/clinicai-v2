'use client'

/**
 * Tooltip · zero-deps · CSS+React state.
 *
 * Wrapper accessibility-friendly que mostra hint contextual on hover/focus.
 * Suporta posicionamento top/bottom/left/right + delay configuravel.
 *
 * Uso:
 *   <Tooltip content="Conv. media vs benchmark 25%">
 *     <span className="kpi">32%</span>
 *   </Tooltip>
 *
 * Diferenca vs `title=` HTML nativo:
 *   - Estilo champagne consistente com Mira aesthetic
 *   - Aparece imediato (vs delay grande do title nativo)
 *   - Suporta JSX (ex: <strong> ou linhas)
 *   - aria-describedby pra screen readers
 */

import { useState, useRef, useId, type ReactNode } from 'react'

type Side = 'top' | 'bottom' | 'left' | 'right'

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 200,
  maxWidth = 240,
}: {
  content: ReactNode
  children: ReactNode
  side?: Side
  delay?: number
  maxWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), delay)
  }
  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setOpen(false)
  }

  // Posicionamento via translate · sem JS getBoundingClientRect (zero reflow)
  const positions: Record<Side, React.CSSProperties> = {
    top: { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' },
    left: { right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' },
    right: { left: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' },
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 100,
            maxWidth,
            padding: '6px 10px',
            background: '#1A1814',
            color: '#F5F0E8',
            border: '1px solid rgba(201, 169, 110, 0.3)',
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.45,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 400,
            boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
            textAlign: 'left',
            ...positions[side],
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
