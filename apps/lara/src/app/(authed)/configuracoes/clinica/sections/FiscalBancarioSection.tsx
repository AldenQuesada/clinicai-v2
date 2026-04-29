'use client'

/**
 * Section · Fiscal & Bancario.
 * Port da subsecao Dados Fiscais + CNAEs + Bancos
 * (clinic-dashboard/index.html linhas 1030-1099).
 *
 * Owner-only · a section inteira fica disabled quando !canEditOwner
 * (replicar logica de _applyClinicPermissionGuards · linhas 902-908).
 */

import type { ClinicSettingsData } from '../types'
import { CnaesRepeater } from '../repeaters/CnaesRepeater'
import { BancosRepeater } from '../repeaters/BancosRepeater'
import { maskCNPJ } from '../lib/masks'

const REGIMES = [
  { value: '', label: 'Selecione...' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
  { value: 'autonomo', label: 'Autônomo / Pessoa Física' },
]

const NFE_OPTS = [
  { value: '', label: 'Selecione...' },
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'em_implantacao', label: 'Em implantação' },
]

export function FiscalBancarioSection({
  data,
  onChange,
  canEditOwner,
}: {
  data: ClinicSettingsData
  onChange: (patch: Partial<ClinicSettingsData>) => void
  canEditOwner: boolean
}) {
  const ro = !canEditOwner

  return (
    <section
      className="luxury-card"
      style={{
        padding: '20px 24px 24px',
        opacity: canEditOwner ? 1 : 0.5,
        pointerEvents: canEditOwner ? 'auto' : 'none',
      }}
      title={canEditOwner ? undefined : 'Somente o proprietário pode editar dados fiscais'}
    >
      <div className="b2b-form-sec">Dados Fiscais</div>

      {!canEditOwner && (
        <div
          style={{
            marginBottom: 16,
            padding: '8px 12px',
            background: 'rgba(201, 169, 110, 0.08)',
            border: '1px solid rgba(201, 169, 110, 0.25)',
            borderRadius: 5,
            fontSize: 11,
            color: 'var(--b2b-champagne)',
          }}
        >
          Apenas o proprietário pode editar dados fiscais.
        </div>
      )}

      <div className="b2b-grid-2">
        <div className="b2b-field">
          <label className="b2b-field-lbl">CNPJ</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="00.000.000/0001-00"
            maxLength={18}
            value={data.cnpj}
            onChange={(e) => onChange({ cnpj: maskCNPJ(e.target.value) })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Inscrição Estadual</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="000.000.000.000 ou ISENTO"
            value={data.ie}
            onChange={(e) => onChange({ ie: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Inscrição Municipal</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="00000-0"
            value={data.im}
            onChange={(e) => onChange({ im: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Regime Tributário</label>
          <select
            className="b2b-input"
            value={data.regime_tributario}
            onChange={(e) => onChange({ regime_tributario: e.target.value })}
            disabled={ro}
          >
            {REGIMES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Alíquota ISS (%)</label>
          <input
            type="number"
            className="b2b-input"
            min={2}
            max={5}
            step={0.01}
            placeholder="5.00"
            value={data.iss_pct}
            onChange={(e) => onChange({ iss_pct: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Emite Nota Fiscal (NF-e)?</label>
          <select
            className="b2b-input"
            value={data.nfe}
            onChange={(e) => onChange({ nfe: e.target.value })}
            disabled={ro}
          >
            {NFE_OPTS.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CNAE principal */}
      <div style={{ marginTop: 18 }}>
        <div className="b2b-field">
          <label className="b2b-field-lbl">CNAE Principal</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="Ex: 9602-5/01 – Cabeleireiros, manicure e pedicure"
            value={data.cnae}
            onChange={(e) => onChange({ cnae: e.target.value })}
            disabled={ro}
          />
        </div>
        <CnaesRepeater
          value={data.cnaes_secundarios}
          onChange={(cnaes_secundarios) => onChange({ cnaes_secundarios })}
          disabled={ro}
        />
      </div>

      {/* Bancos */}
      <div style={{ marginTop: 24 }}>
        <BancosRepeater
          value={data.bancos}
          onChange={(bancos) => onChange({ bancos })}
          disabled={ro}
        />
      </div>
    </section>
  )
}
