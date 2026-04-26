'use client'

/**
 * ImageFocus · espelho 1:1 de `b2bm2-image-focus.widget.js`.
 *
 * Cards detalhados das parcerias de imagem agrupadas por classificacao.
 * Click navega pra detail.
 */

import { useRouter } from 'next/navigation'
import type {
  PartnerPerformanceRow,
  PartnerClassification,
} from '@clinicai/repositories'

const CLS: Record<
  PartnerClassification,
  { label: string; color: string; emoji: string }
> = {
  novo: { label: 'Novo', color: '#06B6D4', emoji: '🌱' },
  ideal: { label: 'Ideal', color: '#10B981', emoji: '🌟' },
  otimo: { label: 'Ótimo', color: '#84CC16', emoji: '💚' },
  aceitavel: { label: 'Aceitável', color: '#EAB308', emoji: '✅' },
  abaixo: { label: 'Abaixo', color: '#F97316', emoji: '🟡' },
  critico: { label: 'Crítico', color: '#EF4444', emoji: '🔴' },
  inativa: { label: 'Inativa', color: '#6B7280', emoji: '⬛' },
}

const ORDER: PartnerClassification[] = [
  'critico',
  'abaixo',
  'aceitavel',
  'otimo',
  'ideal',
  'inativa',
]

export function ImageFocus({ rows }: { rows: PartnerPerformanceRow[] }) {
  const router = useRouter()
  const imgs = rows.filter((r) => r.is_image_partner)

  if (imgs.length === 0) {
    return (
      <div className="b2bm2-card b2bm2-empty">
        <strong>Sem parcerias de imagem cadastradas.</strong>
        <p>
          No form de cadastro de parceria, marque <em>Parceria de imagem</em> pra:
        </p>
        <ul>
          <li>Lojas e boutiques de roupa</li>
          <li>Perfumarias de nicho</li>
          <li>Cabeleireiras / salões de beleza</li>
          <li>Manicure / unhas premium</li>
          <li>Mentoras de comunicação / curadoria de imagem</li>
        </ul>
        <p>
          Essas parcerias carregam a percepção pública da Dra. Mirian e ganham
          prioridade nos alertas.
        </p>
      </div>
    )
  }

  // Agrupa por classification em ORDER
  const by = new Map<PartnerClassification, PartnerPerformanceRow[]>()
  for (const r of imgs) {
    if (!by.has(r.classification)) by.set(r.classification, [])
    by.get(r.classification)!.push(r)
  }

  const cards = ORDER.flatMap((cls) => by.get(cls) || [])

  return (
    <div className="b2bm2-card">
      <div className="b2bm2-card-hdr">
        <h3>💎 Parcerias de imagem · {imgs.length} parceria(s)</h3>
        <div className="b2bm2-card-sub">
          Essas parcerias influenciam diretamente a imagem pública da Dra. Mirian.
          Qualquer queda de performance aqui merece atenção imediata.
        </div>
      </div>
      <div className="b2bm2-img-grid">
        {cards.map((r) => (
          <Card
            key={r.partnership_id}
            r={r}
            onClick={() => router.push(`/partnerships/${r.partnership_id}`)}
          />
        ))}
      </div>
    </div>
  )
}

function Card({
  r,
  onClick,
}: {
  r: PartnerPerformanceRow
  onClick: () => void
}) {
  const c = CLS[r.classification] || CLS.inativa
  const healthDot =
    r.health_color === 'green'
      ? '🟢'
      : r.health_color === 'yellow'
      ? '🟡'
      : r.health_color === 'red'
      ? '🔴'
      : '⚪'

  return (
    <div
      className={`b2bm2-img-card b2bm2-img-card-${r.classification}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="b2bm2-img-card-hdr">
        <div>
          <div className="b2bm2-img-name">
            💎 {r.name} {healthDot}
          </div>
          <div className="b2bm2-img-meta">
            {r.pillar || ''}
            {r.category ? ` · ${r.category}` : ''}
          </div>
        </div>
        <div className="b2bm2-img-cls" style={{ color: c.color }}>
          {c.emoji} {c.label}
        </div>
      </div>
      <div className="b2bm2-img-metrics">
        <Metric label="Emitidos" val={r.vouchers_emitted || 0} />
        <Metric label="Agendaram" val={r.vouchers_scheduled || 0} />
        <Metric label="Compareceram" val={r.vouchers_attended || 0} />
        <Metric label="Pagaram" val={r.vouchers_converted || 0} color={c.color} />
        <Metric label="% Conv." val={`${r.conversion_pct || 0}%`} />
        <Metric
          label="Últ. voucher"
          val={r.last_voucher_at ? `${r.days_since_last_voucher}d` : '—'}
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  val,
  color,
}: {
  label: string
  val: number | string
  color?: string
}) {
  const style = color
    ? ({ ['--v' as never]: color } as React.CSSProperties)
    : undefined
  return (
    <div className="b2bm2-img-metric" style={style}>
      <div className="b2bm2-img-metric-n">{val}</div>
      <div className="b2bm2-img-metric-l">{label}</div>
    </div>
  )
}
