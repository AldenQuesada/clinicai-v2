'use client'

/**
 * Ranking · espelho 1:1 de `b2bm2-ranking.widget.js`.
 *
 * Tabela com classificacao rolling 90d. Click numa linha → detail.
 */

import { useRouter } from 'next/navigation'
import type {
  PartnerPerformanceRow,
  PartnerClassification,
} from '@clinicai/repositories'

const CLS_LABELS: Record<
  PartnerClassification,
  { label: string; color: string; icon: string }
> = {
  novo: { label: 'Novo', color: '#06B6D4', icon: '🌱' },
  ideal: { label: 'Ideal', color: '#10B981', icon: '🌟' },
  otimo: { label: 'Ótimo', color: '#84CC16', icon: '💚' },
  aceitavel: { label: 'Aceitável', color: '#EAB308', icon: '✅' },
  abaixo: { label: 'Abaixo', color: '#F97316', icon: '🟡' },
  critico: { label: 'Crítico', color: '#EF4444', icon: '🔴' },
  inativa: { label: 'Inativa', color: '#6B7280', icon: '⬛' },
}

export function Ranking({ rows }: { rows: PartnerPerformanceRow[] }) {
  const router = useRouter()

  if (!rows || rows.length === 0) {
    return (
      <div className="b2bm2-card b2bm2-empty">
        Sem parcerias ativas no período.
      </div>
    )
  }

  return (
    <div className="b2bm2-card">
      <div className="b2bm2-card-hdr">
        <h3>Ranking por performance · {rows.length} parceiras</h3>
        <div className="b2bm2-card-sub">
          Ordem: imagem primeiro · depois maior conversão · depois maior volume.
        </div>
      </div>
      <div className="b2bm2-rk-scroll">
        <table className="b2bm2-rk">
          <thead>
            <tr>
              <th>Parceria</th>
              <th>Classe</th>
              <th>Emitidos</th>
              <th>Agendaram</th>
              <th>Compareceram</th>
              <th>Pagaram</th>
              <th>Semanas ativas</th>
              <th>Último voucher</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = CLS_LABELS[r.classification] || CLS_LABELS.inativa
              return (
                <tr
                  key={r.partnership_id}
                  onClick={() => router.push(`/partnerships/${r.partnership_id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    {r.is_image_partner ? (
                      <span
                        className="b2bm2-img-pill"
                        title="Parceria de imagem"
                      >
                        💎
                      </span>
                    ) : null}
                    {r.name}
                    <div className="b2bm2-rk-sub">
                      {r.pillar || ''}
                      {r.category ? ` · ${r.category}` : ''}
                    </div>
                  </td>
                  <td className="b2bm2-rk-cls" style={{ color: c.color }}>
                    {c.icon} {c.label}
                  </td>
                  <td className="b2bm2-rk-n">{r.vouchers_emitted || 0}</td>
                  <td className="b2bm2-rk-n">{r.vouchers_scheduled || 0}</td>
                  <td className="b2bm2-rk-n">{r.vouchers_attended || 0}</td>
                  <td className="b2bm2-rk-n b2bm2-rk-conv">
                    {r.vouchers_converted || 0}
                    {r.vouchers_emitted > 0 ? (
                      <small> ({r.conversion_pct}%)</small>
                    ) : null}
                  </td>
                  <td className="b2bm2-rk-n">{r.weeks_with_voucher || 0}</td>
                  <td className="b2bm2-rk-n">
                    {r.last_voucher_at ? (
                      `${r.days_since_last_voucher}d atrás`
                    ) : (
                      <em>nunca</em>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
