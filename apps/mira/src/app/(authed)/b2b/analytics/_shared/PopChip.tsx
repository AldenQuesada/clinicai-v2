/**
 * PopChip · chip visual de Period-over-Period delta.
 *
 * Renders ↑/↓/= + N% + cor (verde/vermelho/cinza).
 * Tooltip explica "vs ultimos Nd (DD/MM a DD/MM)".
 *
 * Quando amostra anterior < 10 eventos, exibe '—' com tooltip
 * "amostra anterior insuficiente" (regra BI · estatisticamente irrelevante).
 *
 * Server Component-safe (sem 'use client'). Tooltip via title nativo do HTML.
 */

import type { PopDelta } from './popUtils'

const TONE_COLORS = {
  green: { fg: '#10B981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
  red: { fg: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
  gray: { fg: '#9CA3AF', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.25)' },
  neutral: { fg: '#7A7165', bg: 'rgba(122,113,101,0.08)', border: 'rgba(122,113,101,0.2)' },
} as const

export function PopChip({
  delta,
  tooltip,
  unit = '%',
}: {
  delta: PopDelta
  /** Texto explicativo no hover · ex: "vs ultimos 30d (28/03 a 26/04)" */
  tooltip: string
  /** Sufixo para abs · '' se ja eh percentual */
  unit?: string
}) {
  // Amostra insuficiente · '—' com tooltip especifico
  if (!delta.sufficient && delta.pct == null) {
    return (
      <span
        title="Amostra anterior insuficiente · esperado ≥10 eventos para PoP estatisticamente válido."
        style={{
          fontSize: 9.5,
          color: TONE_COLORS.neutral.fg,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 500,
          padding: '1px 5px',
          borderRadius: 999,
          border: `1px dashed ${TONE_COLORS.neutral.border}`,
          marginLeft: 4,
        }}
      >
        —
      </span>
    )
  }
  if (!delta.sufficient) {
    // Tem delta calculavel mas amostra fraca · mostra tons "neutros" com aviso
    return (
      <span
        title={`${tooltip} · amostra anterior fraca (${delta.pct ?? 0}%)`}
        style={{
          fontSize: 9.5,
          color: TONE_COLORS.neutral.fg,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 500,
          padding: '1px 5px',
          borderRadius: 999,
          border: `1px dashed ${TONE_COLORS.neutral.border}`,
          marginLeft: 4,
        }}
      >
        {delta.arrow} {Math.abs(delta.pct ?? 0)}%*
      </span>
    )
  }
  const c = TONE_COLORS[delta.tone]
  const label =
    delta.pct == null
      ? '—'
      : `${delta.arrow} ${Math.abs(delta.pct)}${unit}`
  return (
    <span
      title={tooltip}
      style={{
        fontSize: 9.5,
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: 999,
        marginLeft: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {label}
    </span>
  )
}
