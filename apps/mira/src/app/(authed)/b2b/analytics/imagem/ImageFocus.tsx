'use client'

/**
 * ImageFocus · refactor 2026-04-26 · minimalismo interpretativo.
 *
 * Antes: grid de cards detalhados agrupados por classificacao · 6 metricas crus
 * por card sem comparacao. Reclamacao Alden: "dado unico em texto, nao me aporta
 * nada".
 *
 * Agora · 4 camadas BI:
 *   1. DiagnosticBanner   · headline + subtitle interpretativo
 *   2. SnapshotRow 4-col  · totais com tone (saudaveis/atencao/risco/conv-media)
 *   3. Tabela compacta    · 1 linha por parceria, conv com delta vs media,
 *                           ultimo voucher com tone, click → detail
 *   4. NextActions        · max 3 acoes prioritarias com link direto
 *
 * Cor accent gold #C9A96E pra parceria imagem · shapes color-blind safe.
 */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PartnerPerformanceRow } from '@clinicai/repositories'
import { analyzeImage, type ImageStatus, type ImageDiagnostic } from './imageAnalyzer'

const STATUS_COLORS: Record<
  ImageStatus,
  { bg: string; border: string; text: string }
> = {
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

const TONE_COLOR: Record<'green' | 'amber' | 'red' | 'neutral', string> = {
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  neutral: '#9CA3AF',
}

export function ImageFocus({
  rows,
  days,
}: {
  rows: PartnerPerformanceRow[]
  days: number
}) {
  const imgs = rows.filter((r) => r.is_image_partner)

  if (imgs.length === 0) {
    return <EmptyState />
  }

  const diag = analyzeImage(imgs, days)

  // Ordem da tabela: risco/cold primeiro, depois conv asc, depois saudaveis
  const sorted = [...imgs].sort((a, b) => {
    const aRisk = riskRank(a)
    const bRisk = riskRank(b)
    if (aRisk !== bRisk) return aRisk - bRisk
    return (a.conversion_pct || 0) - (b.conversion_pct || 0)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DiagnosticBanner diag={diag} />
      <SnapshotRow diag={diag} />
      <CompactTable rows={sorted} avgConversion={diag.avgConversion} />
      <NextActions actions={diag.actions} />
      <FooterTip />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Empty state · pilar nao iniciado
// ═══════════════════════════════════════════════════════════════════════

function EmptyState() {
  return (
    <div className="b2bm2-card b2bm2-empty">
      <strong>Sem parcerias de imagem cadastradas.</strong>
      <p>
        No form de cadastro de parceria, marque <em>Parceria de imagem</em> pra:
      </p>
      <ul>
        <li>Lojas e boutiques de roupa</li>
        <li>Perfumarias de nicho</li>
        <li>Cabeleireiras / saloes de beleza</li>
        <li>Manicure / unhas premium</li>
        <li>Mentoras de comunicacao / curadoria de imagem</li>
      </ul>
      <p>
        Essas parcerias carregam a percepcao publica da Dra. Mirian e ganham
        prioridade nos alertas.
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Diagnostic banner · headline interpretativo
// ═══════════════════════════════════════════════════════════════════════

function StatusIcon({ status, size = 28 }: { status: ImageStatus; size?: number }) {
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
      <path
        d="M12 2 L15 8.5 L22 9.3 L17 14.2 L18.2 21 L12 17.8 L5.8 21 L7 14.2 L2 9.3 L9 8.5 Z"
        fill={c.bg}
        stroke={c.text}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DiagnosticBanner({ diag }: { diag: ImageDiagnostic }) {
  const c = STATUS_COLORS[diag.status]
  return (
    <div
      role="region"
      aria-label={`Diagnostico do pilar imagem: ${diag.headline} ${diag.subtitle}`}
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
          💎 Diagnóstico do pilar imagem
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

// ═══════════════════════════════════════════════════════════════════════
// Snapshot row · 4 KPIs
// ═══════════════════════════════════════════════════════════════════════

function SnapshotRow({ diag }: { diag: ImageDiagnostic }) {
  const { totals, avgConversion } = diag
  const convTone =
    totals.total === 0 || avgConversion === 0
      ? 'neutral'
      : avgConversion >= 25
        ? 'green'
        : avgConversion >= 12
          ? 'amber'
          : 'red'

  return (
    <div
      className="b2bm-img-snapshot"
      role="region"
      aria-label="Snapshot do pilar imagem"
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
        lbl="Total imagem"
        val={String(totals.total)}
        sub="parcerias estrategicas"
        tone="neutral"
      />
      <Kpi
        lbl="Saudaveis"
        val={`${totals.healthy}/${totals.total}`}
        sub={totals.healthy === totals.total ? 'todas em ritmo' : 'em ritmo'}
        tone={totals.healthy === totals.total ? 'green' : 'neutral'}
      />
      <Kpi
        lbl="Em risco"
        val={String(totals.risk + totals.cold)}
        sub={
          totals.cold > 0
            ? `${totals.risk} criticas · ${totals.cold} frias`
            : `${totals.risk} criticas`
        }
        tone={totals.risk + totals.cold > 0 ? 'red' : 'green'}
      />
      <Kpi
        lbl="Conv. media"
        val={avgConversion > 0 ? `${avgConversion}%` : '—'}
        sub={
          avgConversion > 0
            ? convTone === 'green'
              ? 'acima da meta 25%'
              : convTone === 'amber'
                ? 'na banda 12-25%'
                : 'abaixo do minimo 12%'
            : 'sem vouchers'
        }
        tone={convTone}
      />
      <style>{`
        @media (max-width: 640px) {
          .b2bm-img-snapshot { grid-template-columns: repeat(2, 1fr) !important; }
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
  tone: 'green' | 'amber' | 'red' | 'neutral'
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontSize: 24,
          fontWeight: 500,
          color: TONE_COLOR[tone] === '#9CA3AF' ? '#F5F0E8' : TONE_COLOR[tone],
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

// ═══════════════════════════════════════════════════════════════════════
// Compact table · 1 linha por parceria
// ═══════════════════════════════════════════════════════════════════════

function CompactTable({
  rows,
  avgConversion,
}: {
  rows: PartnerPerformanceRow[]
  avgConversion: number
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
          <span>💎</span>
          Parcerias de imagem · {rows.length}
        </h3>
        <div
          style={{
            fontSize: 10.5,
            color: '#B5A894',
            marginTop: 2,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Ordenadas por risco · click numa linha abre o detalhe.
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
              <Th align="right">Vouchers</Th>
              <Th align="right">Conv (vs media)</Th>
              <Th align="right">Ult. voucher</Th>
              <Th align="center">Saude</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row
                key={r.partnership_id}
                r={r}
                avgConversion={avgConversion}
                onClick={() => router.push(`/partnerships/${r.partnership_id}`)}
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

function Row({
  r,
  avgConversion,
  onClick,
}: {
  r: PartnerPerformanceRow
  avgConversion: number
  onClick: () => void
}) {
  const conv = r.conversion_pct || 0
  const emitted = r.vouchers_emitted || 0
  const paid = r.vouchers_converted || 0
  const days = r.days_since_last_voucher
  const hasVoucher = !!r.last_voucher_at && days != null

  // Tone do conv vs media (delta absoluto pp)
  const delta = avgConversion > 0 ? conv - avgConversion : null
  const convTone: 'green' | 'amber' | 'red' | 'neutral' =
    emitted === 0
      ? 'neutral'
      : conv >= 25
        ? 'green'
        : conv >= 12
          ? 'amber'
          : 'red'

  // Tone da idade do ultimo voucher
  const lastTone: 'green' | 'amber' | 'red' | 'neutral' = !hasVoucher
    ? 'red'
    : (days as number) <= 7
      ? 'green'
      : (days as number) <= 21
        ? 'amber'
        : 'red'

  // Tone health
  const healthTone: 'green' | 'amber' | 'red' | 'neutral' =
    r.health_color === 'green'
      ? 'green'
      : r.health_color === 'yellow'
        ? 'amber'
        : r.health_color === 'red'
          ? 'red'
          : 'neutral'

  return (
    <tr
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        cursor: 'pointer',
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = 'rgba(201,169,110,0.05)')
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td
        style={{
          padding: '10px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#F5F0E8',
            fontWeight: 500,
            fontSize: 12.5,
          }}
        >
          <span style={{ color: '#C9A96E' }} title="Parceria de imagem">
            💎
          </span>
          {r.name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: '#7A7165',
            marginTop: 2,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          {r.pillar || ''}
          {r.category ? ` · ${r.category}` : ''}
        </div>
      </td>
      <td
        style={{
          padding: '10px 8px',
          textAlign: 'right',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          fontVariantNumeric: 'tabular-nums',
          color: '#F5F0E8',
        }}
      >
        {emitted === 0 ? (
          <span style={{ color: '#7A7165' }}>—</span>
        ) : (
          <>
            <span style={{ color: '#F5F0E8' }}>{paid}</span>
            <span style={{ color: '#7A7165', fontSize: 11 }}>/{emitted}</span>
          </>
        )}
      </td>
      <td
        style={{
          padding: '10px 8px',
          textAlign: 'right',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {emitted === 0 ? (
          <span style={{ color: '#7A7165' }}>—</span>
        ) : (
          <span
            style={{
              color: TONE_COLOR[convTone],
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 5,
            }}
          >
            {conv}%
            {delta != null && Math.abs(delta) >= 1 ? (
              <span
                style={{
                  fontSize: 10.5,
                  color: delta > 0 ? '#10B981' : delta < 0 ? '#EF4444' : '#9CA3AF',
                  fontWeight: 500,
                }}
                title={`vs media imagem ${avgConversion}%`}
              >
                {delta > 0 ? '+' : ''}
                {delta.toFixed(0)}pp
              </span>
            ) : null}
          </span>
        )}
      </td>
      <td
        style={{
          padding: '10px 8px',
          textAlign: 'right',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          color: TONE_COLOR[lastTone],
          fontVariantNumeric: 'tabular-nums',
          fontSize: 11.5,
        }}
        title={
          hasVoucher
            ? `${days}d atras${(days as number) > 21 ? ' · parceria fria' : ''}`
            : 'Nunca emitiu voucher'
        }
      >
        {hasVoucher ? `${days}d` : <em>nunca</em>}
      </td>
      <td
        style={{
          padding: '10px 8px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <HealthShape tone={healthTone} />
      </td>
      <td
        style={{
          padding: '10px 8px',
          textAlign: 'right',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          color: '#C9A96E',
          fontSize: 14,
        }}
      >
        →
      </td>
    </tr>
  )
}

/** Forma redundante a cor (color-blind safe) · BI win acessibilidade. */
function HealthShape({ tone }: { tone: 'green' | 'amber' | 'red' | 'neutral' }) {
  const color = TONE_COLOR[tone]
  if (tone === 'green') {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" aria-label="saudavel">
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

// ═══════════════════════════════════════════════════════════════════════
// Next actions · max 3 acoes prioritarias
// ═══════════════════════════════════════════════════════════════════════

function NextActions({ actions }: { actions: ImageDiagnostic['actions'] }) {
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
        🎯 Próximos passos sugeridos
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((act, i) => (
          <Link
            key={`${act.priority}-${act.title}-${i}`}
            href={act.href}
            style={{ textDecoration: 'none' }}
          >
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

// ═══════════════════════════════════════════════════════════════════════
// Footer · tip educacional
// ═══════════════════════════════════════════════════════════════════════

function FooterTip() {
  return (
    <div
      style={{
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(201, 169, 110, 0.2)',
        borderRadius: 8,
        fontSize: 10.5,
        color: '#7A7165',
        fontFamily: 'Inter, system-ui, sans-serif',
        lineHeight: 1.5,
        fontStyle: 'italic',
      }}
    >
      💎 <strong style={{ color: '#B5A894', fontStyle: 'normal' }}>Parceria de imagem</strong>{' '}
      e quem carrega a percepcao publica da clinica · boutiques, perfumarias,
      saloes, mentoras de imagem. Qualquer queda aqui merece atencao imediata
      porque impacta posicionamento, nao so volume.
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function riskRank(r: PartnerPerformanceRow): number {
  // Menor = mais grave (vai pro topo da tabela)
  if (r.health_color === 'red' || r.classification === 'critico') return 0
  if (
    r.last_voucher_at &&
    typeof r.days_since_last_voucher === 'number' &&
    r.days_since_last_voucher > 21
  ) {
    return 1
  }
  if (r.classification === 'abaixo' || r.health_color === 'yellow') return 2
  if (r.classification === 'aceitavel') return 3
  if (r.classification === 'inativa') return 4
  return 5
}
