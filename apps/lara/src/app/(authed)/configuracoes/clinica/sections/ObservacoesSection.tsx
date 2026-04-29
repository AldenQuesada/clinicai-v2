'use client'

/**
 * Section · Observacoes Internas.
 * Port da subsecao Observacoes (clinic-dashboard/index.html linhas 1373-1377).
 */

import type { ClinicSettingsData } from '../types'

export function ObservacoesSection({
  data,
  onChange,
  canEdit,
}: {
  data: ClinicSettingsData
  onChange: (patch: Partial<ClinicSettingsData>) => void
  canEdit: boolean
}) {
  const ro = !canEdit

  return (
    <section className="luxury-card" style={{ padding: '20px 24px 24px' }}>
      <div className="b2b-form-sec">Observações Internas</div>
      <textarea
        rows={9}
        className="b2b-input"
        placeholder="Anotações internas, lembretes, configurações especiais, informações confidenciais..."
        value={data.observacoes_internas}
        onChange={(e) => onChange({ observacoes_internas: e.target.value })}
        disabled={ro}
      />
      <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 6 }}>
        Visível apenas para administradores. Nunca aparece para pacientes.
      </div>
    </section>
  )
}
