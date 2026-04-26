/**
 * DnaBar · sec 4 do modal admin legacy.
 *
 * Mirror das classes `b2b-dna-*` em css/b2b.css. Visualiza DNA em 3 dimensoes
 * (Excelencia / Estetica / Proposito · 0-10 cada). Score = media.
 *
 * Health bands (mirror legacy B2BUIHelpers.dnaBarHtml):
 *   >= 8  green  · ressonancia alta
 *   >= 6  yellow · em construcao
 *   <  6  red    · revisar fit
 *   null  unknown · nao avaliado
 */

import type { B2BPartnershipDTO } from '@clinicai/repositories'

const DIMENSIONS: Array<{
  key: keyof Pick<B2BPartnershipDTO, 'dnaExcelencia' | 'dnaEstetica' | 'dnaProposito'>
  label: string
  hint: string
}> = [
  { key: 'dnaExcelencia', label: 'Excelencia', hint: 'Padrao tecnico/qualidade do que entrega' },
  { key: 'dnaEstetica', label: 'Estetica', hint: 'Visual + voz/identidade alinhada com a clinica' },
  { key: 'dnaProposito', label: 'Proposito', hint: 'Causa/missao que ressoa com o publico' },
]

function bandFor(value: number | null): 'green' | 'yellow' | 'red' | 'unknown' {
  if (value == null) return 'unknown'
  if (value >= 8) return 'green'
  if (value >= 6) return 'yellow'
  return 'red'
}

export function DnaBar({ partnership }: { partnership: B2BPartnershipDTO }) {
  const score = partnership.dnaScore
  const overall = bandFor(score)
  const filled =
    partnership.dnaExcelencia != null ||
    partnership.dnaEstetica != null ||
    partnership.dnaProposito != null

  if (!filled) {
    return (
      <div
        className="b2b-dna-bar"
        title="DNA = scoring 0-10 em 3 dimensões (Excelência, Estética, Propósito). Score >= 7 libera ativação. Não avaliado ainda."
      >
        <div className="b2b-dna-hdr">
          <span className="b2b-sec-title" style={{ marginTop: 0 }}>DNA</span>
          <span
            className="b2b-dna-compact"
            data-health="unknown"
            title="Sem dado · DNA não foi avaliado ainda."
          >
            — · nao avaliado
          </span>
        </div>
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          DNA ainda nao avaliado. Edite a parceria pra preencher as 3 dimensoes (0-10).
        </div>
      </div>
    )
  }

  return (
    <div className="b2b-dna-bar">
      <div className="b2b-dna-hdr">
        <span className="b2b-sec-title" style={{ marginTop: 0 }}>DNA</span>
        <span
          className="b2b-dna-score"
          data-health={overall}
          title={`Score DNA = média das 3 dimensões. Bandas: >=8 ressonância alta · >=6 em construção · <6 revisar fit. Mínimo 7 pra ativar.`}
        >
          <strong>{score != null ? score.toFixed(1) : '—'}</strong>
          <span style={{ opacity: 0.6, fontSize: 12 }}> / 10</span>
        </span>
      </div>
      <div className="flex flex-col gap-2 mt-2">
        {DIMENSIONS.map((d) => {
          const v = partnership[d.key]
          const band = bandFor(v)
          const pct = v != null ? Math.min(100, Math.max(0, (v / 10) * 100)) : 0
          return (
            <div key={d.key} className="b2b-dna-row">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11.5px] font-semibold" style={{ color: 'var(--b2b-ivory)' }}>
                    {d.label}
                  </span>
                  <span className="text-[10px] text-[var(--b2b-text-muted)]">
                    {d.hint}
                  </span>
                </div>
                <span
                  className="text-[12px] font-mono font-semibold"
                  data-health={band}
                  style={{
                    color:
                      band === 'green'
                        ? '#10B981'
                        : band === 'yellow'
                        ? '#F59E0B'
                        : band === 'red'
                        ? '#EF4444'
                        : '#9CA3AF',
                  }}
                  title={`${d.label}: ${v != null ? v.toFixed(1) : '—'}/10. ${
                    band === 'green'
                      ? 'Verde · ressonância alta (>=8).'
                      : band === 'yellow'
                      ? 'Amarelo · em construção (6-7.9).'
                      : band === 'red'
                      ? 'Vermelho · revisar fit (<6).'
                      : 'Sem nota.'
                  }`}
                >
                  {v != null ? v.toFixed(1) : '—'}/10
                </span>
              </div>
              <div className="b2b-dna-bar__track" style={{
                height: 6,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div
                  className="b2b-dna-bar__fill"
                  data-health={band}
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'var(--dna-color, #9CA3AF)',
                    transition: 'width 600ms ease',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
