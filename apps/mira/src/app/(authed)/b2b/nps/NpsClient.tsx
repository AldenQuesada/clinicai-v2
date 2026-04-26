'use client'

/**
 * NpsClient · refactor 2026-04-26 · BI interpretativo.
 *
 * Antes: banner com NPS + counts · 5 chips de filtro · lista cards. "Vazio
 * e nao sei o valor que tem".
 *
 * Agora · layers (espelha /b2b/analytics/imagem):
 *   1. DiagnosticBanner    · status global vs benchmark (50/70)
 *   2. SnapshotRow 4-col   · score · promotoras% · detratoras% · respostas
 *   3. Heatmap parceria    · 1 linha por parceria com NPS + buckets
 *   4. NextActions         · max 3 acoes com link
 *   5. Tabela respostas    · filtros + lista compacta
 *   6. Footer educacional
 *
 * Empty state (zero respostas): banner neutral · snapshot com "—" · esconde
 * heatmap+tabela · NextActions vira how-to (cron / template / saude).
 */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTransition, useState } from 'react'
import type {
  NpsBucket,
  NpsResponseEntry,
  NpsSummary,
} from '@clinicai/repositories'
import {
  analyzeNps,
  npsTone,
  NPS_BENCHMARKS,
  type NpsDiagnostic,
  type NpsPerPartnership,
  type NpsStatus,
} from './npsAnalyzer'

// ─── Constantes visuais ───────────────────────────────────────────────────

const FILTER_OPTIONS: { key: NpsBucket | null; label: string }[] = [
  { key: null, label: 'Todos' },
  { key: 'promoter', label: 'Promotoras' },
  { key: 'passive', label: 'Passivas' },
  { key: 'detractor', label: 'Detratoras' },
  { key: 'pending', label: 'Pendentes' },
]

const BUCKET_LABEL: Record<string, string> = {
  promoter: 'Promotora',
  passive: 'Passiva',
  detractor: 'Detratora',
  pending: 'Pendente',
}

const STATUS_COLORS: Record<NpsStatus, { bg: string; border: string; text: string }> = {
  green: {
    bg: 'rgba(16, 185, 129, 0.06)',
    border: 'rgba(16, 185, 129, 0.3)',
    text: '#6EE7B7',
  },
  amber: {
    bg: 'rgba(245, 158, 11, 0.06)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#FCD34D',
  },
  red: {
    bg: 'rgba(239, 68, 68, 0.06)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#FCA5A5',
  },
  neutral: {
    bg: 'rgba(201, 169, 110, 0.04)',
    border: 'rgba(201, 169, 110, 0.2)',
    text: '#D4B785',
  },
}

const TONE_COLOR: Record<NpsStatus, string> = {
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  neutral: '#9CA3AF',
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + '…'
}

// ═══════════════════════════════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════════════════════════════

export function NpsClient({
  initialItems,
  fullItems,
  initialSummary,
  initialBucket,
}: {
  initialItems: NpsResponseEntry[]
  fullItems: NpsResponseEntry[]
  initialSummary: NpsSummary | null
  initialBucket: NpsBucket | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [bucket, setBucket] = useState<NpsBucket | null>(initialBucket)

  // Diagnostico usa fullItems (universo total) · summary global
  const diag = analyzeNps(initialSummary, fullItems)
  const isEmpty = diag.totals.responses === 0

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DiagnosticBanner diag={diag} />
      <SnapshotRow diag={diag} />
      {!isEmpty && diag.perPartnership.length > 0 ? (
        <PartnershipHeatmap rows={diag.perPartnership} />
      ) : null}
      <NextActions actions={diag.actions} isEmpty={isEmpty} />
      {!isEmpty ? (
        <ResponsesPanel
          items={initialItems}
          activeBucket={bucket}
          pending={pending}
          onFilterClick={onFilterClick}
        />
      ) : null}
      <FooterTip emphasized={isEmpty} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Diagnostic banner · headline interpretativo
// ═══════════════════════════════════════════════════════════════════════════

function StatusIcon({ status, size = 28 }: { status: NpsStatus; size?: number }) {
  const c = STATUS_COLORS[status]
  if (status === 'green') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill={c.bg} stroke={c.text} strokeWidth="2" />
        <path
          d="M7 12l3 3 7-7"
          stroke={c.text}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (status === 'amber') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3 L22 21 L2 21 Z"
          fill={c.bg}
          stroke={c.text}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <line
          x1="12"
          y1="10"
          x2="12"
          y2="15"
          stroke={c.text}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="18" r="1.2" fill={c.text} />
      </svg>
    )
  }
  if (status === 'red') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <polygon
          points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8"
          fill={c.bg}
          stroke={c.text}
          strokeWidth="2"
        />
        <line
          x1="8"
          y1="8"
          x2="16"
          y2="16"
          stroke={c.text}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="16"
          y1="8"
          x2="8"
          y2="16"
          stroke={c.text}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={c.bg} stroke={c.text} strokeWidth="2" />
      <line x1="12" y1="8" x2="12" y2="13" stroke={c.text} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.2" fill={c.text} />
    </svg>
  )
}

function DiagnosticBanner({ diag }: { diag: NpsDiagnostic }) {
  const c = STATUS_COLORS[diag.status]
  return (
    <div
      role="region"
      aria-label={`Diagnostico do NPS B2B: ${diag.headline} ${diag.subtitle}`}
      style={{
        padding: '14px 18px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <StatusIcon status={diag.status} size={28} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: c.text,
            fontFamily: 'Inter, system-ui, sans-serif',
            marginBottom: 4,
          }}
        >
          💯 Diagnostico do NPS B2B
        </div>
        <div
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 22,
            fontWeight: 500,
            color: '#F5F0E8',
            lineHeight: 1.15,
            marginBottom: 4,
          }}
        >
          {diag.headline}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#9CA3AF',
            fontFamily: 'Inter, system-ui, sans-serif',
            lineHeight: 1.4,
          }}
        >
          {diag.subtitle}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Snapshot row · 4 KPIs sempre visiveis (mesmo vazio)
// ═══════════════════════════════════════════════════════════════════════════

function SnapshotRow({ diag }: { diag: NpsDiagnostic }) {
  const t = diag.totals
  const isEmpty = t.responses === 0
  const scoreTone = npsTone(t.nps)

  const scoreVal = isEmpty ? '—' : t.nps != null ? String(t.nps) : '—'
  const scoreSub = isEmpty
    ? 'aguardando respostas'
    : t.nps == null
      ? 'sem score · respostas pendentes'
      : t.nps >= NPS_BENCHMARKS.great
        ? `acima de ${NPS_BENCHMARKS.great} · excelencia`
        : t.nps >= NPS_BENCHMARKS.good
          ? `acima de ${NPS_BENCHMARKS.good} · benchmark bom`
          : t.nps >= NPS_BENCHMARKS.bad
            ? `${NPS_BENCHMARKS.bad}-${NPS_BENCHMARKS.good} · pode melhorar`
            : `abaixo de ${NPS_BENCHMARKS.bad} · acao urgente`

  const promoterTone: NpsStatus = isEmpty
    ? 'neutral'
    : t.promoterPct >= 60
      ? 'green'
      : t.promoterPct >= 40
        ? 'amber'
        : 'red'

  const detractorTone: NpsStatus = isEmpty
    ? 'neutral'
    : t.detractorPct === 0
      ? 'green'
      : t.detractorPct <= 10
        ? 'green'
        : t.detractorPct <= 25
          ? 'amber'
          : 'red'

  return (
    <div
      className="b2bm-nps-snapshot"
      role="region"
      aria-label="Snapshot do NPS"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 8,
        padding: '12px 14px',
        background: 'rgba(201, 169, 110, 0.04)',
        border: '1px solid rgba(201, 169, 110, 0.2)',
        borderRadius: 10,
      }}
    >
      <Kpi
        lbl="Score NPS"
        val={scoreVal}
        sub={scoreSub}
        tone={scoreTone}
      />
      <Kpi
        lbl="Promotoras"
        val={isEmpty ? '—' : `${t.promoterPct}%`}
        sub={isEmpty ? 'sem dados' : `${t.promoters} · score 9-10`}
        tone={promoterTone}
      />
      <Kpi
        lbl="Detratoras"
        val={isEmpty ? '—' : `${t.detractorPct}%`}
        sub={isEmpty ? 'sem dados' : `${t.detractors} · score 0-6`}
        tone={detractorTone}
      />
      <Kpi
        lbl="Respostas"
        val={isEmpty ? '—' : String(t.responses)}
        sub={
          isEmpty
            ? 'aguardando primeiro disparo'
            : `${t.responded} respondidas · ${t.pending} pendentes`
        }
        tone="neutral"
      />
      <style>{`
        @media (max-width: 640px) {
          .b2bm-nps-snapshot { grid-template-columns: repeat(2, 1fr) !important; }
          .b2bm-nps-heatmap-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function Kpi({
  lbl,
  val,
  sub,
  tone,
}: {
  lbl: string
  val: string
  sub: string
  tone: NpsStatus
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontSize: 24,
          fontWeight: 500,
          color: tone === 'neutral' ? '#F5F0E8' : TONE_COLOR[tone],
          lineHeight: 1,
        }}
      >
        {val}
      </span>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: '#7A7165',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {lbl}
      </div>
      <div
        style={{
          fontSize: 10,
          color: '#9CA3AF',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {sub}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Heatmap por parceria · tabela compacta
// ═══════════════════════════════════════════════════════════════════════════

function PartnershipHeatmap({ rows }: { rows: NpsPerPartnership[] }) {
  const router = useRouter()

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(201, 169, 110, 0.15)',
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            color: '#F5F0E8',
            letterSpacing: '0.3px',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>🔥</span>
          NPS por parceria · {rows.length}
        </h3>
        <div
          style={{
            fontSize: 10.5,
            color: '#B5A894',
            marginTop: 2,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Detratoras primeiro · click numa linha abre o detalhe da parceria.
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 12,
          }}
        >
          <thead>
            <tr
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: '#7A7165',
              }}
            >
              <Th align="left">Parceria</Th>
              <Th align="right">NPS</Th>
              <Th align="right">Promotoras</Th>
              <Th align="right">Passivas</Th>
              <Th align="right">Detratoras</Th>
              <Th align="right">Pendentes</Th>
              <Th align="center">Saude</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <HeatmapRow
                key={r.partnership_id ?? `__no_id_${i}`}
                r={r}
                onClick={() => {
                  if (r.partnership_id) router.push(`/partnerships/${r.partnership_id}`)
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({
  children,
  align,
}: {
  children?: React.ReactNode
  align: 'left' | 'right' | 'center'
}) {
  return (
    <th
      style={{
        padding: '6px 8px',
        textAlign: align,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function HeatmapRow({
  r,
  onClick,
}: {
  r: NpsPerPartnership
  onClick: () => void
}) {
  const tone = npsTone(r.nps)
  const clickable = !!r.partnership_id
  const cellSty = {
    padding: '10px 8px',
    textAlign: 'right' as const,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontVariantNumeric: 'tabular-nums' as const,
    color: '#F5F0E8',
  }

  return (
    <tr
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) => {
        if (clickable) e.currentTarget.style.background = 'rgba(201,169,110,0.05)'
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td
        style={{
          padding: '10px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          color: '#F5F0E8',
          fontWeight: 500,
          fontSize: 12.5,
        }}
      >
        {r.partnership_name}
      </td>
      <td
        style={{
          ...cellSty,
          color: tone === 'neutral' ? '#7A7165' : TONE_COLOR[tone],
          fontWeight: 600,
        }}
        title={
          r.nps != null
            ? `NPS ${r.nps} · ${r.responded} respostas`
            : 'Sem respostas ainda'
        }
      >
        {r.nps != null ? r.nps : '—'}
      </td>
      <td style={{ ...cellSty, color: r.promoters > 0 ? '#10B981' : '#7A7165' }}>
        {r.promoters || '—'}
      </td>
      <td style={cellSty}>{r.passives || '—'}</td>
      <td style={{ ...cellSty, color: r.detractors > 0 ? '#EF4444' : '#7A7165' }}>
        {r.detractors || '—'}
      </td>
      <td style={cellSty}>{r.pending || '—'}</td>
      <td
        style={{
          padding: '10px 8px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <HealthShape tone={tone} />
      </td>
      <td
        style={{
          padding: '10px 8px',
          textAlign: 'right',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          color: clickable ? '#C9A96E' : '#7A7165',
          fontSize: 14,
        }}
      >
        {clickable ? '→' : ''}
      </td>
    </tr>
  )
}

/** Forma redundante a cor (color-blind safe). */
function HealthShape({ tone }: { tone: NpsStatus }) {
  const color = TONE_COLOR[tone]
  if (tone === 'green') {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" aria-label="excelente">
        <circle cx="7" cy="7" r="5" fill={color} />
      </svg>
    )
  }
  if (tone === 'amber') {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" aria-label="atencao">
        <path d="M7 2 L12 11 L2 11 Z" fill={color} />
      </svg>
    )
  }
  if (tone === 'red') {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" aria-label="risco">
        <rect x="3" y="3" width="8" height="8" fill={color} />
      </svg>
    )
  }
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-label="sem dado">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Next actions · max 3 acoes prioritarias
// ═══════════════════════════════════════════════════════════════════════════

function NextActions({
  actions,
  isEmpty,
}: {
  actions: NpsDiagnostic['actions']
  isEmpty: boolean
}) {
  if (!actions || actions.length === 0) return null
  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'rgba(201, 169, 110, 0.05)',
        border: '1px solid rgba(201, 169, 110, 0.25)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '2.5px',
          textTransform: 'uppercase',
          color: '#C9A96E',
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: 10,
        }}
      >
        {isEmpty ? '🛠 Como ativar a pesquisa NPS' : '🎯 Proximos passos sugeridos'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((act, i) => (
          <Link key={`${act.priority}-${i}`} href={act.href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                  fontSize: 18,
                  fontWeight: 500,
                  color: '#C9A96E',
                  lineHeight: 1,
                  minWidth: 16,
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#F5F0E8',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    marginBottom: 2,
                  }}
                >
                  {act.title}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: '#9CA3AF',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    lineHeight: 1.4,
                  }}
                >
                  {act.rationale}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: '#C9A96E',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  marginTop: 2,
                }}
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Responses panel · filtros + lista compacta
// ═══════════════════════════════════════════════════════════════════════════

function ResponsesPanel({
  items,
  activeBucket,
  pending,
  onFilterClick,
}: {
  items: NpsResponseEntry[]
  activeBucket: NpsBucket | null
  pending: boolean
  onFilterClick: (next: NpsBucket | null) => void
}) {
  const router = useRouter()

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(201, 169, 110, 0.15)',
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 600,
              color: '#F5F0E8',
              letterSpacing: '0.3px',
              fontFamily: 'Inter, system-ui, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📋</span>
            Respostas individuais
          </h3>
          <div
            style={{
              fontSize: 10.5,
              color: '#B5A894',
              marginTop: 2,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Click numa linha abre a parceria · NPS &le; 6 vira tarefa de followup automatica.
          </div>
        </div>
        <div className="b2b-nps-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FILTER_OPTIONS.map((o) => {
            const active = activeBucket === o.key
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
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: 12,
            fontFamily: 'Inter, system-ui, sans-serif',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(201, 169, 110, 0.18)',
            borderRadius: 6,
          }}
        >
          {activeBucket
            ? `Nenhuma resposta no filtro "${BUCKET_LABEL[activeBucket]}".`
            : 'Sem respostas individuais.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((n) => (
            <ResponseRow
              key={n.id}
              n={n}
              onOpen={(id) => router.push(`/partnerships/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ResponseRow({
  n,
  onOpen,
}: {
  n: NpsResponseEntry
  onOpen: (id: string) => void
}) {
  const bucket = (n.bucket ?? 'pending') as NpsBucket
  const tone: NpsStatus =
    bucket === 'promoter'
      ? 'green'
      : bucket === 'passive'
        ? 'amber'
        : bucket === 'detractor'
          ? 'red'
          : 'neutral'
  const scoreLbl = n.score != null ? String(n.score) : '—'
  const pName = n.partnership_name || '(parceria removida)'
  const meta: string[] = []
  meta.push('Q ' + fmtQuarter(n.quarter_ref))
  if (n.responded_at) meta.push('respondido ' + fmtDate(n.responded_at))
  else if (n.opened_at) meta.push('aberto ' + fmtDate(n.opened_at))
  else meta.push('enviado ' + fmtDate(n.created_at))

  const clickable = !!n.partnership_id

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => clickable && onOpen(n.partnership_id as string)}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen(n.partnership_id as string)
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr auto',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 10px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) => {
        if (clickable) e.currentTarget.style.background = 'rgba(201,169,110,0.05)'
      }}
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')
      }
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: STATUS_COLORS[tone].bg,
          border: `1px solid ${STATUS_COLORS[tone].border}`,
          color: TONE_COLOR[tone],
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontSize: 18,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
        title={`Score ${scoreLbl} · ${BUCKET_LABEL[bucket] || bucket}`}
      >
        {scoreLbl}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 2,
          }}
        >
          <strong
            style={{
              fontSize: 12.5,
              color: '#F5F0E8',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 600,
            }}
          >
            {pName}
          </strong>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: 999,
              background: STATUS_COLORS[tone].bg,
              color: TONE_COLOR[tone],
              border: `1px solid ${STATUS_COLORS[tone].border}`,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            {BUCKET_LABEL[bucket] || bucket}
          </span>
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: '#7A7165',
            fontFamily: 'Inter, system-ui, sans-serif',
            marginBottom: n.comment ? 4 : 0,
          }}
        >
          {meta.join(' · ')}
        </div>
        {n.comment ? (
          <div
            style={{
              fontSize: 11.5,
              color: '#B5A894',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontStyle: 'italic',
              lineHeight: 1.45,
            }}
            title={n.comment}
          >
            &ldquo;{truncate(n.comment, 140)}&rdquo;
          </div>
        ) : null}
      </div>
      <div
        style={{
          color: clickable ? '#C9A96E' : 'transparent',
          fontSize: 14,
          alignSelf: 'center',
        }}
      >
        →
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Footer · tip educacional
// ═══════════════════════════════════════════════════════════════════════════

function FooterTip({ emphasized }: { emphasized: boolean }) {
  return (
    <div
      style={{
        padding: emphasized ? '14px 16px' : '10px 14px',
        background: emphasized
          ? 'rgba(201, 169, 110, 0.05)'
          : 'rgba(255,255,255,0.02)',
        border: emphasized
          ? '1px solid rgba(201, 169, 110, 0.25)'
          : '1px dashed rgba(201, 169, 110, 0.2)',
        borderRadius: 8,
        fontSize: emphasized ? 11.5 : 10.5,
        color: emphasized ? '#B5A894' : '#7A7165',
        fontFamily: 'Inter, system-ui, sans-serif',
        lineHeight: 1.5,
        fontStyle: emphasized ? 'normal' : 'italic',
      }}
    >
      <strong style={{ color: '#C9A96E', fontStyle: 'normal' }}>💯 Como funciona o NPS B2B</strong>
      <div style={{ marginTop: 4 }}>
        Net Promoter Score = % promotoras (score 9-10) menos % detratoras (0-6)
        sobre o total de respostas. Vai de -100 a +100.{' '}
        <strong style={{ color: '#10B981', fontStyle: 'normal' }}>50+ e bom</strong>
        ,{' '}
        <strong style={{ color: '#10B981', fontStyle: 'normal' }}>70+ e excelencia</strong>
        ,{' '}
        <strong style={{ color: '#EF4444', fontStyle: 'normal' }}>abaixo de 30 exige acao</strong>
        .
      </div>
      <div style={{ marginTop: 6 }}>
        A pesquisa e disparada via WhatsApp pelo cron <code style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.95em',
          color: '#C9A96E',
        }}>b2b_nps_quarterly_dispatch</code> uma vez por trimestre pras parcerias
        ativas. Score &le; 6 abre tarefa de followup automatica (Mira).
      </div>
    </div>
  )
}
