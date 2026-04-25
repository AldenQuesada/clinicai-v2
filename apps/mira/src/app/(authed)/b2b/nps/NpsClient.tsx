'use client'

/**
 * NpsClient · espelho 1:1 de `b2b-nps.ui.js`.
 *
 * Banner com NPS + bucket counts · 5 chips de filtro · lista com score colorido
 * por bucket + comentário em italic. Link pro detail da parceria via Next.js
 * router (substitui b2b:open-detail event).
 */

import { useRouter } from 'next/navigation'
import { useTransition, useState } from 'react'
import type { NpsBucket, NpsResponseEntry, NpsSummary } from '@clinicai/repositories'

const FILTER_OPTIONS: { key: NpsBucket | null; label: string }[] = [
  { key: null, label: 'Todos' },
  { key: 'promoter', label: 'Promotores' },
  { key: 'passive', label: 'Passivos' },
  { key: 'detractor', label: 'Detratores' },
  { key: 'pending', label: 'Pendentes' },
]

const BUCKET_LABEL: Record<string, string> = {
  promoter: 'Promotora',
  passive: 'Passiva',
  detractor: 'Detratora',
  pending: 'Pendente',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

function fmtQuarter(d: string | null): string {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    const y = dt.getFullYear()
    const q = Math.floor(dt.getMonth() / 3) + 1
    return `${y}·Q${q}`
  } catch {
    return String(d)
  }
}

export function NpsClient({
  initialItems,
  initialSummary,
  initialBucket,
}: {
  initialItems: NpsResponseEntry[]
  initialSummary: NpsSummary | null
  initialBucket: NpsBucket | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [bucket, setBucket] = useState<NpsBucket | null>(initialBucket)

  function onFilterClick(next: NpsBucket | null) {
    setBucket(next)
    const params = new URLSearchParams()
    if (next) params.set('bucket', next)
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/b2b/nps?${qs}` : '/b2b/nps')
      router.refresh()
    })
  }

  return (
    <>
      <Banner summary={initialSummary} />

      <div className="b2b-nps-filters">
        {FILTER_OPTIONS.map((o) => {
          const active = bucket === o.key
          return (
            <button
              key={o.key || 'all'}
              type="button"
              className={'b2b-chip' + (active ? ' b2b-chip-active' : '')}
              disabled={pending}
              onClick={() => onFilterClick(o.key)}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      {initialItems.length === 0 ? (
        <div className="b2b-empty">
          {bucket
            ? 'Nenhuma resposta nesse filtro.'
            : 'Sem respostas de NPS ainda. O dispatch trimestral envia automaticamente — volte depois.'}
        </div>
      ) : (
        <div className="b2b-nps-list">
          {initialItems.map((n) => (
            <NpsRow key={n.id} n={n} onOpen={(id) => router.push(`/partnerships/${id}`)} />
          ))}
        </div>
      )}
    </>
  )
}

function Banner({ summary }: { summary: NpsSummary | null }) {
  if (!summary || !summary.ok) return null
  const total = Number(summary.responses_count || 0)
  const npsPct = summary.nps != null ? Number(summary.nps).toFixed(0) : '—'
  const promoterPct = total > 0 ? Math.round(((summary.promoters || 0) / total) * 100) : 0
  const passivePct = total > 0 ? Math.round(((summary.passives || 0) / total) * 100) : 0
  const detractorPct =
    total > 0 ? Math.round(((summary.detractors || 0) / total) * 100) : 0

  return (
    <div className="b2b-nps-banner">
      <div className="b2b-nps-banner-head">
        <div className="b2b-nps-banner-big">
          {npsPct}
          <span>NPS</span>
        </div>
        <div className="b2b-nps-banner-sub">
          {total} respostas ·{' '}
          <strong style={{ color: '#10B981' }}>
            {summary.promoters || 0} promotores
          </strong>{' '}
          · <span>{summary.passives || 0} passivos</span> ·{' '}
          <strong style={{ color: '#EF4444' }}>
            {summary.detractors || 0} detratores
          </strong>
        </div>
      </div>
      {total > 0 ? (
        <div className="b2b-nps-banner-bar">
          <div
            className="b2b-nps-seg b2b-nps-seg-promoter"
            style={{ flexBasis: `${promoterPct}%` }}
          />
          <div
            className="b2b-nps-seg b2b-nps-seg-passive"
            style={{ flexBasis: `${passivePct}%` }}
          />
          <div
            className="b2b-nps-seg b2b-nps-seg-detractor"
            style={{ flexBasis: `${detractorPct}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

function NpsRow({
  n,
  onOpen,
}: {
  n: NpsResponseEntry
  onOpen: (id: string) => void
}) {
  const bucket = n.bucket || 'pending'
  const scoreLbl = n.score != null ? `${n.score}/10` : '—'
  const pName = n.partnership_name || '(parceria removida)'
  const meta: string[] = []
  meta.push('Q ' + fmtQuarter(n.quarter_ref))
  if (n.responded_at) meta.push('respondido ' + fmtDate(n.responded_at))
  else if (n.opened_at) meta.push('aberto ' + fmtDate(n.opened_at))
  else meta.push('enviado ' + fmtDate(n.created_at))

  return (
    <div
      className="b2b-nps-row"
      role="button"
      tabIndex={0}
      onClick={() => {
        if (n.partnership_id) onOpen(n.partnership_id)
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && n.partnership_id) {
          e.preventDefault()
          onOpen(n.partnership_id)
        }
      }}
    >
      <div className="b2b-nps-score" data-bucket={bucket}>
        {scoreLbl}
      </div>
      <div className="b2b-nps-body">
        <div className="b2b-nps-top">
          <strong>{pName}</strong>
          <span className="b2b-pill b2b-pill-bucket" data-bucket={bucket}>
            {BUCKET_LABEL[bucket] || bucket}
          </span>
        </div>
        <div className="b2b-nps-meta">{meta.join(' · ')}</div>
        {n.comment ? (
          <div className="b2b-nps-comment">&ldquo;{n.comment}&rdquo;</div>
        ) : null}
      </div>
    </div>
  )
}
