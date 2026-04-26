'use client'

/**
 * Heatmap · espelho 1:1 de `b2bm2-heatmap.widget.js`.
 *
 * Grid parceria × ultimas 12 semanas. Calcula client-side a partir das
 * issuances brutas + linhas de performance · ordena imagem primeiro.
 */

import { useRouter } from 'next/navigation'
import type { PartnerPerformanceRow } from '@clinicai/repositories'

const WEEKS = 12

function weekStart(d: Date | string): Date {
  const dt = new Date(d)
  const dow = dt.getDay() || 7
  dt.setHours(0, 0, 0, 0)
  dt.setDate(dt.getDate() - (dow - 1))
  return dt
}

function weekKey(d: Date | string): string {
  return weekStart(d).toISOString().slice(0, 10)
}

function intensityClass(n: number): string {
  if (n === 0) return 'b2bm2-hm-0'
  if (n === 1) return 'b2bm2-hm-1'
  if (n === 2) return 'b2bm2-hm-2'
  if (n === 3) return 'b2bm2-hm-3'
  return 'b2bm2-hm-4'
}

export function Heatmap({
  rows,
  vouchers,
}: {
  rows: PartnerPerformanceRow[]
  vouchers: Array<{ partnership_id: string; issued_at: string }>
}) {
  const router = useRouter()

  // Indice partnershipId → weekKey → count
  const idx = new Map<string, Map<string, number>>()
  for (const v of vouchers) {
    if (!v.partnership_id || !v.issued_at) continue
    const wk = weekKey(v.issued_at)
    if (!idx.has(v.partnership_id)) idx.set(v.partnership_id, new Map())
    const m = idx.get(v.partnership_id)!
    m.set(wk, (m.get(wk) ?? 0) + 1)
  }

  // 12 semanas mais antigas → recentes
  const now = new Date()
  const thisWeekStart = weekStart(now)
  const weeks: string[] = []
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(thisWeekStart)
    d.setDate(d.getDate() - i * 7)
    weeks.push(d.toISOString().slice(0, 10))
  }

  // Filtra: imagem ou tem atividade no periodo
  const displayed = rows
    .filter((p) => p.is_image_partner || idx.has(p.partnership_id))
    .sort((a, b) => {
      if (a.is_image_partner !== b.is_image_partner) {
        return a.is_image_partner ? -1 : 1
      }
      return (b.vouchers_emitted || 0) - (a.vouchers_emitted || 0)
    })

  if (displayed.length === 0) {
    return (
      <div className="b2bm2-card b2bm2-empty">
        Sem parcerias com atividade nas últimas {WEEKS} semanas.
      </div>
    )
  }

  return (
    <div className="b2bm2-card">
      <div className="b2bm2-card-hdr">
        <h3>Heatmap de atividade · últimas {WEEKS} semanas</h3>
        <div className="b2bm2-card-sub">
          Cada célula = vouchers emitidos na semana. Quanto mais verde, mais
          atividade.
        </div>
      </div>
      <div className="b2bm2-hm">
        <div className="b2bm2-hm-weekhead">
          <div className="b2bm2-hm-name" />
          <div className="b2bm2-hm-cells">
            {weeks.map((wk) => {
              const d = new Date(wk + 'T00:00:00')
              const lbl =
                String(d.getDate()).padStart(2, '0') +
                '/' +
                String(d.getMonth() + 1).padStart(2, '0')
              return (
                <span key={wk} className="b2bm2-hm-wlbl">
                  {lbl}
                </span>
              )
            })}
          </div>
        </div>
        {displayed.map((p) => (
          <div
            key={p.partnership_id}
            className="b2bm2-hm-row"
            onClick={() => router.push(`/partnerships/${p.partnership_id}`)}
            role="button"
            tabIndex={0}
          >
            <div className="b2bm2-hm-name">
              {p.is_image_partner ? (
                <span className="b2bm2-img-pill" title="Parceria de imagem">
                  💎
                </span>
              ) : null}
              {p.name}
            </div>
            <div className="b2bm2-hm-cells">
              {weeks.map((wk) => {
                const n = idx.get(p.partnership_id)?.get(wk) ?? 0
                return (
                  <span
                    key={wk}
                    className={`b2bm2-hm-cell ${intensityClass(n)}`}
                    title={`${wk}: ${n} voucher(s)`}
                  >
                    {n > 0 ? n : ''}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
