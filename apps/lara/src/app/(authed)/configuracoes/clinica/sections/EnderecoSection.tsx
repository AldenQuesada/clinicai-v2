'use client'

/**
 * Section · Endereço.
 * Port da subsecao Endereço (clinic-dashboard/index.html linhas 947-1004) +
 * comportamento auto-fetch ViaCEP no blur (linhas 951 e 36-56 do JS).
 */

import { useState } from 'react'
import type { ClinicSettingsData } from '../types'
import { maskCEP } from '../lib/masks'
import { fetchCEP } from '../lib/viacep'

const UFS = [
  { value: '', label: 'Selecione...' },
  { value: 'AC', label: 'AC – Acre' },
  { value: 'AL', label: 'AL – Alagoas' },
  { value: 'AP', label: 'AP – Amapá' },
  { value: 'AM', label: 'AM – Amazonas' },
  { value: 'BA', label: 'BA – Bahia' },
  { value: 'CE', label: 'CE – Ceará' },
  { value: 'DF', label: 'DF – Distrito Federal' },
  { value: 'ES', label: 'ES – Espírito Santo' },
  { value: 'GO', label: 'GO – Goiás' },
  { value: 'MA', label: 'MA – Maranhão' },
  { value: 'MT', label: 'MT – Mato Grosso' },
  { value: 'MS', label: 'MS – Mato Grosso do Sul' },
  { value: 'MG', label: 'MG – Minas Gerais' },
  { value: 'PA', label: 'PA – Pará' },
  { value: 'PB', label: 'PB – Paraíba' },
  { value: 'PR', label: 'PR – Paraná' },
  { value: 'PE', label: 'PE – Pernambuco' },
  { value: 'PI', label: 'PI – Piauí' },
  { value: 'RJ', label: 'RJ – Rio de Janeiro' },
  { value: 'RN', label: 'RN – Rio Grande do Norte' },
  { value: 'RS', label: 'RS – Rio Grande do Sul' },
  { value: 'RO', label: 'RO – Rondônia' },
  { value: 'RR', label: 'RR – Roraima' },
  { value: 'SC', label: 'SC – Santa Catarina' },
  { value: 'SP', label: 'SP – São Paulo' },
  { value: 'SE', label: 'SE – Sergipe' },
  { value: 'TO', label: 'TO – Tocantins' },
]

const CIDADES_DATALIST = [
  'São Paulo',
  'Rio de Janeiro',
  'Belo Horizonte',
  'Curitiba',
  'Porto Alegre',
  'Brasília',
  'Fortaleza',
  'Salvador',
  'Manaus',
  'Recife',
  'Goiânia',
  'Florianópolis',
  'Campinas',
  'Santos',
  'Maceió',
]

export function EnderecoSection({
  data,
  onChange,
  canEdit,
}: {
  data: ClinicSettingsData
  onChange: (patch: Partial<ClinicSettingsData>) => void
  canEdit: boolean
}) {
  const ro = !canEdit
  const [loadingCep, setLoadingCep] = useState(false)

  async function handleCepBlur() {
    if (!data.cep) return
    setLoadingCep(true)
    try {
      const result = await fetchCEP(data.cep)
      if (result) {
        // patch parcial — preserva campos ja preenchidos pelo usuario? Legacy
        // sobrescreve sempre que veio valor (linhas 45 do JS). Replicamos isso.
        const patch: Partial<ClinicSettingsData> = {}
        if (result.rua) patch.rua = result.rua
        if (result.bairro) patch.bairro = result.bairro
        if (result.cidade) patch.cidade = result.cidade
        if (result.estado) patch.estado = result.estado
        if (Object.keys(patch).length) onChange(patch)
      }
    } finally {
      setLoadingCep(false)
    }
  }

  return (
    <section className="luxury-card" style={{ padding: '20px 24px 24px' }}>
      <div className="b2b-form-sec">Endereço</div>
      <div className="b2b-grid-2">
        <div className="b2b-field">
          <label className="b2b-field-lbl">CEP</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="00000-000"
            maxLength={9}
            value={data.cep}
            onChange={(e) => onChange({ cep: maskCEP(e.target.value) })}
            onBlur={handleCepBlur}
            disabled={ro}
          />
          {loadingCep && (
            <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 4 }}>
              Buscando endereço...
            </div>
          )}
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Rua / Av.</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="Rua das Flores"
            value={data.rua}
            onChange={(e) => onChange({ rua: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Número</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="123"
            value={data.num}
            onChange={(e) => onChange({ num: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Complemento</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="Sala 5, 2º andar"
            value={data.comp}
            onChange={(e) => onChange({ comp: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Bairro</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="Centro"
            value={data.bairro}
            onChange={(e) => onChange({ bairro: e.target.value })}
            disabled={ro}
          />
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Cidade</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="São Paulo"
            list="cs-cidade-list"
            value={data.cidade}
            onChange={(e) => onChange({ cidade: e.target.value })}
            disabled={ro}
          />
          <datalist id="cs-cidade-list">
            {CIDADES_DATALIST.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Estado</label>
          <select
            className="b2b-input"
            value={data.estado}
            onChange={(e) => onChange({ estado: e.target.value })}
            disabled={ro}
          >
            {UFS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
          <label className="b2b-field-lbl">Link Google Maps</label>
          <input
            type="text"
            className="b2b-input"
            placeholder="https://maps.google.com/..."
            value={data.maps}
            onChange={(e) => onChange({ maps: e.target.value })}
            disabled={ro}
          />
        </div>
      </div>
    </section>
  )
}
