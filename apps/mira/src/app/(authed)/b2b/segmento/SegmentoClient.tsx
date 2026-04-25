'use client'

/**
 * SegmentoClient · espelho 1:1 de `b2b-segment.ui.js` + `b2b-segment-preview.ui.js`.
 *
 * Layout:
 *   - Header (h2 "Segmentação de broadcast" + descrição)
 *   - Grid de 6 selects (pillar/tier/status/saúde/NPS/atividade)
 *   - Preview "X parcerias atendem os filtros" + sample list
 *   - Footer com hint + botão "Copiar IDs (count)"
 *
 * Debounce de 250ms igual ao original. Strings, classes (.b2b-seg-*) e
 * comportamento preservados.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  previewSegmentAction,
  fetchSegmentIdsAction,
} from './actions'
import type {
  BroadcastFilters,
  BroadcastPreview,
} from '@clinicai/repositories'

const PILLARS = [
  'imagem',
  'evento',
  'institucional',
  'fitness',
  'alimentacao',
  'saude',
  'status',
  'rede',
  'outros',
] as const

const STATUSES = [
  'active',
  'contract',
  'review',
  'prospect',
  'dna_check',
  'paused',
] as const

const HEALTH_COLORS = ['green', 'yellow', 'red', 'unknown'] as const

const NPS_BUCKETS: {
  value: '' | 'promoter' | 'passive' | 'detractor'
  label: string
  min?: number
  max?: number
}[] = [
  { value: '', label: 'Qualquer NPS' },
  { value: 'promoter', label: 'Promotores (≥9)', min: 9 },
  { value: 'passive', label: 'Passivos (7-8)', min: 7, max: 8 },
  { value: 'detractor', label: 'Detratores (≤6)', max: 6 },
]

type UIFilters = {
  pillar?: string
  tier?: number
  status?: string
  health_color?: 'green' | 'yellow' | 'red' | 'unknown'
  has_voucher_in_30d?: boolean
  nps_bucket?: '' | 'promoter' | 'passive' | 'detractor'
}

function toRpcFilters(f: UIFilters): BroadcastFilters {
  const out: BroadcastFilters = {}
  if (f.pillar) out.pillar = f.pillar
  if (f.tier) out.tier = f.tier
  if (f.status) out.status = f.status
  if (f.health_color) out.health_color = f.health_color
  if (f.has_voucher_in_30d != null) out.has_voucher_in_30d = f.has_voucher_in_30d
  if (f.nps_bucket) {
    const b = NPS_BUCKETS.find((x) => x.value === f.nps_bucket)
    if (b?.min != null) out.nps_min = b.min
    if (b?.max != null) out.nps_max = b.max
  }
  return out
}

export function SegmentoClient() {
  const [filters, setFilters] = useState<UIFilters>({})
  const [preview, setPreview] = useState<BroadcastPreview>({ count: 0, sample: [] })
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rpcFilters = useMemo(() => toRpcFilters(filters), [filters])

  const loadPreview = useCallback(async (rpc: BroadcastFilters) => {
    setLoading(true)
    try {
      const r = await previewSegmentAction(rpc)
      setPreview({ count: r?.count || 0, sample: r?.sample || [] })
    } catch {
      setPreview({ count: 0, sample: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce 250ms (igual ao original)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void loadPreview(rpcFilters)
    }, 250)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [rpcFilters, loadPreview])

  // Mount inicial
  useEffect(() => {
    void loadPreview({})
  }, [loadPreview])

  function patch<K extends keyof UIFilters>(key: K, value: UIFilters[K] | undefined) {
    setFilters((prev) => {
      const next = { ...prev }
      if (value === undefined || value === '' || value === null) {
        delete next[key]
      } else {
        next[key] = value
      }
      return next
    })
  }

  async function onCopyIds() {
    if (!preview.count) return
    setCopying(true)
    setFeedback(null)
    try {
      const r = await fetchSegmentIdsAction(rpcFilters)
      if (!r.ok) throw new Error(r.error || 'desconhecido')
      const text = (r.ids || []).join('\n')
      await navigator.clipboard.writeText(text)
      setFeedback(`${r.count} IDs copiados.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setFeedback(`Falha: ${msg}`)
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="b2b-seg-shell">
      <header className="b2b-seg-header">
        <h2>Segmentação de broadcast</h2>
        <p>
          Filtra parceiras por pillar, tier, status, saúde, NPS ou atividade. Veja
          quantas seriam alvo de um disparo antes de configurar template.
        </p>
      </header>

      <div className="b2b-seg-filters">
        <select
          className="b2b-input"
          value={filters.pillar || ''}
          onChange={(e) => patch('pillar', e.target.value || undefined)}
        >
          <option value="">Qualquer pilar</option>
          {PILLARS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className="b2b-input"
          value={filters.tier ?? ''}
          onChange={(e) =>
            patch('tier', e.target.value ? Number(e.target.value) : undefined)
          }
        >
          <option value="">Qualquer tier</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>

        <select
          className="b2b-input"
          value={filters.status || ''}
          onChange={(e) => patch('status', e.target.value || undefined)}
        >
          <option value="">Qualquer status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className="b2b-input"
          value={filters.health_color || ''}
          onChange={(e) =>
            patch(
              'health_color',
              (e.target.value as UIFilters['health_color']) || undefined,
            )
          }
        >
          <option value="">Qualquer saúde</option>
          {HEALTH_COLORS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          className="b2b-input"
          value={filters.nps_bucket || ''}
          onChange={(e) =>
            patch(
              'nps_bucket',
              (e.target.value as UIFilters['nps_bucket']) || undefined,
            )
          }
        >
          {NPS_BUCKETS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <select
          className="b2b-input"
          value={
            filters.has_voucher_in_30d == null
              ? ''
              : filters.has_voucher_in_30d
              ? 'true'
              : 'false'
          }
          onChange={(e) => {
            const v = e.target.value
            patch(
              'has_voucher_in_30d',
              v === '' ? undefined : v === 'true',
            )
          }}
        >
          <option value="">Qualquer atividade</option>
          <option value="true">Com voucher nos últimos 30d</option>
          <option value="false">Sem voucher nos últimos 30d</option>
        </select>
      </div>

      <PreviewBlock loading={loading} preview={preview} />

      <div className="b2b-seg-actions">
        <div className="b2b-seg-actions-hint">
          O disparo real ainda usa templates por evento (Templates tab). Esse
          painel mostra quem cairia no segmento — útil pra dimensionar antes de
          configurar um disparo.
        </div>
        <button
          type="button"
          className="b2b-btn"
          disabled={preview.count === 0 || copying}
          onClick={onCopyIds}
        >
          {copying ? 'Copiando…' : `Copiar IDs (${preview.count})`}
        </button>
      </div>

      {feedback ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: 'var(--b2b-text-dim)',
          }}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  )
}

function PreviewBlock({
  loading,
  preview,
}: {
  loading: boolean
  preview: BroadcastPreview
}) {
  if (loading) {
    return (
      <div className="b2b-seg-preview b2b-seg-preview-loading">
        Calculando segmento…
      </div>
    )
  }
  if (!preview.count) {
    return (
      <div className="b2b-seg-preview b2b-seg-preview-empty">
        Nenhuma parceria atende esses filtros.
      </div>
    )
  }
  return (
    <div className="b2b-seg-preview">
      <div className="b2b-seg-preview-hdr">
        <strong>{preview.count}</strong> parceria
        {preview.count === 1 ? '' : 's'} atende
        {preview.count === 1 ? '' : 'm'} os filtros
      </div>
      {preview.count > preview.sample.length ? (
        <div className="b2b-seg-preview-note">
          Mostrando primeiros {preview.sample.length}:
        </div>
      ) : null}
      <ul className="b2b-seg-preview-list">
        {preview.sample.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong>{' '}
            <span className="b2b-seg-meta">
              {p.tier ? `T${p.tier} · ` : ''}
              {p.pillar || '—'} · {p.status}
              {p.account_manager ? ` · @${p.account_manager}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
