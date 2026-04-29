'use client'

/**
 * Section · Sistema (fuso, moeda, formato data).
 * Port da subsecao Sistema (clinic-dashboard/index.html linhas 1225-1261).
 */

import type { ClinicSettingsData } from '../types'

const FUSOS = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3) — padrão' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Belem', label: 'Belém (UTC-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (UTC-3)' },
  { value: 'America/Recife', label: 'Recife (UTC-3)' },
  { value: 'America/Bahia', label: 'Salvador (UTC-3)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (UTC-4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (UTC-4)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (UTC-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (UTC-5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
]

const MOEDAS = [
  { value: 'BRL', label: 'BRL – Real Brasileiro (R$)' },
  { value: 'USD', label: 'USD – Dólar Americano ($)' },
  { value: 'EUR', label: 'EUR – Euro (€)' },
]

const FORMATOS = [
  { value: 'dd/MM/yyyy', label: 'DD/MM/AAAA (padrão BR)' },
  { value: 'MM/dd/yyyy', label: 'MM/DD/AAAA' },
  { value: 'yyyy-MM-dd', label: 'AAAA-MM-DD (ISO 8601)' },
]

export function SistemaSection({
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
      <div className="b2b-form-sec">Configurações do Sistema</div>
      <div className="b2b-grid-2">
        <div className="b2b-field">
          <label className="b2b-field-lbl">Fuso Horário</label>
          <select
            className="b2b-input"
            value={data.fuso_horario || 'America/Sao_Paulo'}
            onChange={(e) => onChange({ fuso_horario: e.target.value })}
            disabled={ro}
          >
            {FUSOS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Moeda</label>
          <select
            className="b2b-input"
            value={data.moeda || 'BRL'}
            onChange={(e) => onChange({ moeda: e.target.value })}
            disabled={ro}
          >
            {MOEDAS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Formato de Data</label>
          <select
            className="b2b-input"
            value={data.formato_data || 'dd/MM/yyyy'}
            onChange={(e) => onChange({ formato_data: e.target.value })}
            disabled={ro}
          >
            {FORMATOS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  )
}
