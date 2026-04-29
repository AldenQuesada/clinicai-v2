'use client'

/**
 * Section · Atendimento.
 * Port das opcoes Atendimento (clinic-dashboard/index.html linhas 1133-1176).
 */

import type { ClinicSettingsData } from '../types'

const DURACOES = [
  { value: '', label: 'Selecione...' },
  { value: '15', label: '15 minutos' },
  { value: '20', label: '20 minutos' },
  { value: '30', label: '30 minutos' },
  { value: '45', label: '45 minutos' },
  { value: '60', label: '60 minutos (1h)' },
  { value: '90', label: '90 minutos (1h30)' },
  { value: '120', label: '120 minutos (2h)' },
]

const INTERVALOS = [
  { value: '0', label: 'Sem intervalo' },
  { value: '5', label: '5 minutos' },
  { value: '10', label: '10 minutos' },
  { value: '15', label: '15 minutos' },
  { value: '30', label: '30 minutos' },
]

export function AtendimentoSection({
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
      <div className="b2b-form-sec">Configurações de Atendimento</div>
      <div className="b2b-grid-2">
        <div className="b2b-field">
          <label className="b2b-field-lbl">Duração Padrão da Consulta</label>
          <select
            className="b2b-input"
            value={data.duracao_padrao}
            onChange={(e) => onChange({ duracao_padrao: e.target.value })}
            disabled={ro}
          >
            {DURACOES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Intervalo entre Consultas</label>
          <select
            className="b2b-input"
            value={data.intervalo_consulta}
            onChange={(e) => onChange({ intervalo_consulta: e.target.value })}
            disabled={ro}
          >
            {INTERVALOS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Antecedência Mínima (horas)</label>
          <input
            type="number"
            className="b2b-input"
            min={0}
            max={72}
            placeholder="2"
            value={data.antecedencia_min}
            onChange={(e) => onChange({ antecedencia_min: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Limite de Agendamento Futuro (dias)</label>
          <input
            type="number"
            className="b2b-input"
            min={1}
            max={365}
            placeholder="60"
            value={data.limite_agendamento}
            onChange={(e) => onChange({ limite_agendamento: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
          <label className="b2b-field-lbl">Política de Cancelamento</label>
          <textarea
            rows={3}
            className="b2b-input"
            placeholder="Ex: Cancelamentos devem ser feitos com no mínimo 24h de antecedência..."
            value={data.politica_cancelamento}
            onChange={(e) => onChange({ politica_cancelamento: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
          <label className="b2b-field-lbl">Termos de Consentimento / Anamnese</label>
          <textarea
            rows={4}
            className="b2b-input"
            placeholder="Termos de uso, consentimento para procedimentos, dados LGPD..."
            value={data.termos_consentimento}
            onChange={(e) => onChange({ termos_consentimento: e.target.value })}
            disabled={ro}
          />
        </div>
      </div>
    </section>
  )
}
