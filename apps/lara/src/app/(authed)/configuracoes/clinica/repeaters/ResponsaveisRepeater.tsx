'use client'

/**
 * Repeater · Responsaveis / Proprietarios.
 * Port 1:1 das funcoes csRenderResponsaveis/Add/Remove/Get (clinic-settings.js
 * linhas 170-254).
 */

import { Plus, X } from 'lucide-react'
import type { Responsavel } from '../types'
import { maskCPF, maskPhone } from '../lib/masks'

const CONSELHOS = [
  '',
  'CRM – Medicina',
  'CRO – Odontologia',
  'CREFITO – Fisioterapia',
  'CRN – Nutrição',
  'CRF – Farmácia',
  'COREN – Enfermagem',
  'CFP – Psicologia',
  'Outro',
]

function emptyResponsavel(): Responsavel {
  return { nome: '', cpf: '', nascimento: '', cargo: '', tel: '', email: '', conselho: '', conselho_num: '' }
}

export function ResponsaveisRepeater({
  value,
  onChange,
  disabled = false,
}: {
  value: Responsavel[]
  onChange: (next: Responsavel[]) => void
  disabled?: boolean
}) {
  function update(i: number, field: keyof Responsavel, val: string) {
    const next = value.slice()
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }
  function add() {
    onChange([...value, emptyResponsavel()])
  }
  function remove(i: number) {
    const next = value.slice()
    next.splice(i, 1)
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="b2b-form-sec" style={{ borderBottom: 'none', padding: 0, margin: 0 }}>
          Responsáveis / Proprietários
        </div>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 12px' }}
        >
          <Plus size={11} /> Adicionar Responsável
        </button>
      </div>

      {(!value || value.length === 0) && (
        <div className="b2b-empty">Nenhum responsável cadastrado. Clique em &ldquo;Adicionar Responsável&rdquo; acima.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {value.map((r, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--b2b-border)',
              borderRadius: 8,
              padding: 14,
              background: 'var(--b2b-bg-1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--b2b-champagne)', letterSpacing: 1, textTransform: 'uppercase' }}>
                Responsável #{i + 1}
                {r.nome ? ` — ${r.nome}` : ''}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--b2b-border)',
                  color: 'var(--b2b-red)',
                  borderRadius: 4,
                  width: 24,
                  height: 24,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Remover"
              >
                <X size={12} />
              </button>
            </div>

            <div className="b2b-grid-2">
              <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
                <label className="b2b-field-lbl">Nome Completo</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="Nome completo"
                  value={r.nome}
                  onChange={(e) => update(i, 'nome', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">CPF</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  value={r.cpf}
                  onChange={(e) => update(i, 'cpf', maskCPF(e.target.value))}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Data de Nascimento</label>
                <input
                  type="date"
                  className="b2b-input"
                  value={r.nascimento}
                  onChange={(e) => update(i, 'nascimento', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Cargo / Função</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="Proprietária, Diretora..."
                  value={r.cargo}
                  onChange={(e) => update(i, 'cargo', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Telefone</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  value={r.tel}
                  onChange={(e) => update(i, 'tel', maskPhone(e.target.value))}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">E-mail</label>
                <input
                  type="email"
                  className="b2b-input"
                  placeholder="nome@email.com"
                  value={r.email}
                  onChange={(e) => update(i, 'email', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Conselho Profissional</label>
                <select
                  className="b2b-input"
                  value={r.conselho}
                  onChange={(e) => update(i, 'conselho', e.target.value)}
                  disabled={disabled}
                >
                  {CONSELHOS.map((c) => (
                    <option key={c} value={c}>
                      {c || 'Sem conselho / N/A'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Número do Conselho</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="Ex: CRM/SP 123456"
                  value={r.conselho_num}
                  onChange={(e) => update(i, 'conselho_num', e.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
