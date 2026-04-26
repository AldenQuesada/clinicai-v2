'use client'

/**
 * TimeRangePicker · seletor de janela temporal padrao das 6 tabs Analytics.
 *
 * Opcoes: 30d · 60d · 90d · Custom (start/end ISO yyyy-MM-dd)
 * Estado vive na URL (?days=30 ou ?from=YYYY-MM-DD&to=YYYY-MM-DD).
 * Sem state local · sempre reflete URL · navegacao via router.replace.
 *
 * Padrao de uso na page server:
 *   const { days, fromIso, toIso } = parseTimeRange(searchParams)
 *   <TimeRangePicker /> no client
 *
 * Deliberadamente NAO oferece "7d"/"hoje" · objetivos B2B exigem amostra
 * minima de 30d pra ter sinal estatistico (decisao 2026-04-25 Alden).
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

const PRESETS = [30, 60, 90] as const

export type TimeRange = {
  /** Dias desde hoje · 30/60/90 ou null se custom */
  days: number | null
  /** ISO YYYY-MM-DD · null se preset */
  fromIso: string | null
  toIso: string | null
}

/**
 * Helper pra Server Component parsear searchParams em TimeRange.
 * Default: 30d se nao tem nada na URL.
 */
export function parseTimeRange(sp: { days?: string; from?: string; to?: string }): TimeRange {
  const fromIso = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null
  const toIso = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null
  if (fromIso && toIso) return { days: null, fromIso, toIso }
  const d = Number(sp.days)
  if ((PRESETS as readonly number[]).includes(d)) return { days: d, fromIso: null, toIso: null }
  return { days: 30, fromIso: null, toIso: null }
}

/**
 * Helper pra converter TimeRange em sinceIso pra usar em queries.
 * Custom range usa fromIso · preset calcula a partir de hoje.
 */
export function timeRangeSinceIso(tr: TimeRange): string {
  if (tr.fromIso) return tr.fromIso + 'T00:00:00.000Z'
  const days = tr.days || 30
  return new Date(Date.now() - days * 86400000).toISOString()
}

export function timeRangeUntilIso(tr: TimeRange): string {
  if (tr.toIso) return tr.toIso + 'T23:59:59.999Z'
  return new Date().toISOString()
}

/**
 * Compact label pra exibir o range ativo (ex: "30 dias", "01/04 → 25/04").
 */
export function timeRangeLabel(tr: TimeRange): string {
  if (tr.fromIso && tr.toIso) {
    const fmt = (s: string) => {
      const [y, m, d] = s.split('-')
      return `${d}/${m}`
    }
    return `${fmt(tr.fromIso)} → ${fmt(tr.toIso)}`
  }
  return `${tr.days || 30} dias`
}

export function TimeRangePicker() {
  const router = useRouter()
  const pathname = usePathname() || ''
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [showCustom, setShowCustom] = useState(false)

  const current = parseTimeRange({
    days: sp?.get('days') || undefined,
    from: sp?.get('from') || undefined,
    to: sp?.get('to') || undefined,
  })

  function applyPreset(days: number) {
    const next = new URLSearchParams(sp?.toString() || '')
    next.set('days', String(days))
    next.delete('from')
    next.delete('to')
    setShowCustom(false)
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`)
      router.refresh()
    })
  }

  function applyCustom(fromIso: string, toIso: string) {
    if (!fromIso || !toIso) return
    const next = new URLSearchParams(sp?.toString() || '')
    next.delete('days')
    next.set('from', fromIso)
    next.set('to', toIso)
    setShowCustom(false)
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`)
      router.refresh()
    })
  }

  return (
    <div className="b2bm2-trange">
      <div className="b2bm2-trange-presets">
        {PRESETS.map((d) => {
          const active = current.days === d
          return (
            <button
              key={d}
              type="button"
              className={'b2b-tab' + (active ? ' active' : '')}
              onClick={() => applyPreset(d)}
              disabled={pending}
            >
              {d}d
            </button>
          )
        })}
        <button
          type="button"
          className={
            'b2b-tab' +
            (current.fromIso && current.toIso ? ' active' : '') +
            (showCustom ? ' open' : '')
          }
          onClick={() => setShowCustom((v) => !v)}
          disabled={pending}
          title="Período customizado"
        >
          {current.fromIso && current.toIso ? timeRangeLabel(current) : 'Período…'}
        </button>
      </div>

      {showCustom ? (
        <CustomRangeForm
          initialFrom={current.fromIso || ''}
          initialTo={current.toIso || ''}
          onApply={applyCustom}
          onCancel={() => setShowCustom(false)}
          pending={pending}
        />
      ) : null}
    </div>
  )
}

function CustomRangeForm({
  initialFrom,
  initialTo,
  onApply,
  onCancel,
  pending,
}: {
  initialFrom: string
  initialTo: string
  onApply: (from: string, to: string) => void
  onCancel: () => void
  pending: boolean
}) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  return (
    <div className="b2bm2-trange-custom">
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => setFrom(e.target.value)}
        className="b2b-input"
      />
      <span style={{ color: 'var(--b2b-text-muted)' }}>→</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => setTo(e.target.value)}
        className="b2b-input"
      />
      <button
        type="button"
        className="b2b-btn b2b-btn-primary b2b-btn-xs"
        disabled={!from || !to || pending}
        onClick={() => onApply(from, to)}
      >
        Aplicar
      </button>
      <button
        type="button"
        className="b2b-btn b2b-btn-xs"
        disabled={pending}
        onClick={onCancel}
      >
        Cancelar
      </button>
    </div>
  )
}
