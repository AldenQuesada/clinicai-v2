/**
 * Funnel · espelho 1:1 de `b2bm2-funnel.widget.js`.
 *
 * Pipeline de conversao Candidatos → Prospect → DNA → Contrato → Ativa.
 * 2 numeros por etapa: cumulativo (passaram por) + atual (estao agora).
 */

import type { PipelineFunnel } from '@clinicai/repositories'

const STAGES = [
  { key: 'candidatos', label: 'Candidatos', color: '#64748B' },
  { key: 'prospect', label: 'Prospect', color: '#3B82F6' },
  { key: 'dna_check', label: 'DNA Aprovado', color: '#A78BFA' },
  { key: 'contract', label: 'Contrato', color: '#F59E0B' },
  { key: 'active', label: 'Ativa', color: '#10B981' },
] as const

type StageKey = (typeof STAGES)[number]['key']

export function Funnel({ data }: { data: PipelineFunnel | null }) {
  if (!data || !data.ok) {
    return <div className="b2bm2-card b2bm2-empty">Sem dados do pipeline</div>
  }

  const cum = data.cumulative
  const cur = data.current
  const total = Number(cum.candidatos || 0)

  return (
    <div className="b2bm2-card">
      <div className="b2bm2-card-hdr">
        <h3>
          Pipeline de conversão{' '}
          <small>· últimos {data.period_days || 30}d</small>
        </h3>
        <div className="b2bm2-card-sub">
          Cumulativo (passaram por) × atual (estão agora). Conversão geral:{' '}
          <strong>{data.conversion_rate || 0}%</strong> candidatos → ativas.
        </div>
      </div>
      <div className="b2bm2-funnel">
        {STAGES.map((s) => {
          const n = Number(cum[s.key as StageKey] || 0)
          const isCandidates = s.key === 'candidatos'
          const currentN = isCandidates
            ? null
            : Number((cur as Record<string, number>)[s.key] || 0)
          const pct = total > 0 ? Math.round((100 * n) / total) : 0
          return (
            <div key={s.key} className="b2bm2-funnel-row">
              <div className="b2bm2-funnel-lbl">{s.label}</div>
              <div className="b2bm2-funnel-bar">
                <div
                  className="b2bm2-funnel-fill"
                  style={{ width: `${pct}%`, background: s.color }}
                />
              </div>
              <div className="b2bm2-funnel-cum" title="Passaram por este ponto">
                {n}
              </div>
              <div className="b2bm2-funnel-cur" title="Estão nesse status hoje">
                {currentN !== null ? `${currentN} hoje` : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
