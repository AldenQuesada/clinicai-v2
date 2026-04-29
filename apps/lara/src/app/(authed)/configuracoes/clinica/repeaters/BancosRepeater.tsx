'use client'

/**
 * Repeater · Contas Bancarias PJ.
 * Port das funcoes csRenderBancos/Add/Remove/Get (clinic-settings.js linhas 289-356).
 */

import { Plus, X } from 'lucide-react'
import type { BancoPJ } from '../types'

const TIPOS = ['', 'Conta Corrente PJ', 'Conta Pagamento PJ', 'Conta Poupança PJ']
const BANCO_LIST = [
  'Nubank',
  'Itaú Unibanco',
  'Bradesco',
  'Banco do Brasil',
  'Caixa Econômica Federal',
  'Santander',
  'Banco Inter',
  'C6 Bank',
  'Sicoob',
  'Sicredi',
  'PagBank',
  'Mercado Pago',
  'BTG Pactual',
]

function emptyBanco(): BancoPJ {
  return { banco: '', tipo: '', agencia: '', conta: '', titular: '', pix: '' }
}

export function BancosRepeater({
  value,
  onChange,
  disabled = false,
}: {
  value: BancoPJ[]
  onChange: (next: BancoPJ[]) => void
  disabled?: boolean
}) {
  function update(i: number, field: keyof BancoPJ, val: string) {
    const next = value.slice()
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }
  function add() {
    onChange([...value, emptyBanco()])
  }
  function remove(i: number) {
    const next = value.slice()
    next.splice(i, 1)
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="b2b-form-sec" style={{ borderBottom: 'none', padding: 0, margin: 0 }}>
            Contas Bancárias
          </div>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              background: 'rgba(201,169,110,0.18)',
              color: 'var(--b2b-champagne)',
              padding: '2px 8px',
              borderRadius: 8,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Sempre PJ
          </span>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 12px' }}
        >
          <Plus size={11} /> Adicionar Conta
        </button>
      </div>

      {(!value || value.length === 0) && (
        <div className="b2b-empty">Nenhuma conta bancária cadastrada.</div>
      )}

      <datalist id="cs-banco-options">
        {BANCO_LIST.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {value.map((b, i) => (
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
                Conta #{i + 1}
                {b.banco ? ` — ${b.banco}` : ''}
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
              <div className="b2b-field">
                <label className="b2b-field-lbl">Banco</label>
                <input
                  type="text"
                  className="b2b-input"
                  list="cs-banco-options"
                  placeholder="Nubank, Itaú..."
                  value={b.banco}
                  onChange={(e) => update(i, 'banco', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Tipo de Conta</label>
                <select
                  className="b2b-input"
                  value={b.tipo}
                  onChange={(e) => update(i, 'tipo', e.target.value)}
                  disabled={disabled}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t || 'Selecione...'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Agência</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="0000-0"
                  value={b.agencia}
                  onChange={(e) => update(i, 'agencia', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Conta</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="00000-0"
                  value={b.conta}
                  onChange={(e) => update(i, 'conta', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
                <label className="b2b-field-lbl">Titular da Conta</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="Razão social exata"
                  value={b.titular}
                  onChange={(e) => update(i, 'titular', e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="b2b-field" style={{ gridColumn: '1 / span 2' }}>
                <label className="b2b-field-lbl">Chave PIX</label>
                <input
                  type="text"
                  className="b2b-input"
                  placeholder="CNPJ, e-mail, telefone ou chave aleatória"
                  value={b.pix}
                  onChange={(e) => update(i, 'pix', e.target.value)}
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
