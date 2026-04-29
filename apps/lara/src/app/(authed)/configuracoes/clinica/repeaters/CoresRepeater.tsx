'use client'

/**
 * Repeater · Cores da Marca.
 * Port das funcoes csRenderCores/Add/Remove/Get (clinic-settings.js linhas 359-398).
 *
 * Regras:
 *  - Cor #1 e #2 nao podem ser removidas (no original o botao remover so aparece com i > 1).
 *  - Hex valido segue regex /^#[0-9A-Fa-f]{6}$/. Se invalido, mantem o picker no
 *    valor anterior · igual o legacy.
 */

import { Plus, X } from 'lucide-react'
import type { CorMarca } from '../types'
import { HEX_COLOR_REGEX } from '../lib/masks'

function emptyCor(): CorMarca {
  return { nome: '', valor: '#374151' }
}

export function CoresRepeater({
  value,
  onChange,
  disabled = false,
}: {
  value: CorMarca[]
  onChange: (next: CorMarca[]) => void
  disabled?: boolean
}) {
  function update(i: number, field: keyof CorMarca, val: string) {
    const next = value.slice()
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }
  function updateHex(i: number, hex: string) {
    // mesmo comportamento do legacy: se hex valido, sincroniza picker; senao
    // mantem o input texto (vai ser trimmed na hora de salvar)
    const next = value.slice()
    if (HEX_COLOR_REGEX.test(hex)) {
      next[i] = { ...next[i], valor: hex }
    } else {
      next[i] = { ...next[i], valor: next[i].valor }
    }
    // sempre atualiza o "texto" sob o picker (controlled input)
    onChange(next)
  }
  function add() {
    onChange([...value, emptyCor()])
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
          Cores da Marca
        </div>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 12px' }}
        >
          <Plus size={11} /> Adicionar Cor
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.map((c, i) => {
          const safeVal = HEX_COLOR_REGEX.test(c.valor) ? c.valor : '#7C3AED'
          return (
            <div
              key={i}
              style={{
                border: '1px solid var(--b2b-border)',
                borderRadius: 8,
                padding: '10px 14px',
                background: 'var(--b2b-bg-1)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <input
                type="color"
                value={safeVal}
                onChange={(e) => update(i, 'valor', e.target.value)}
                disabled={disabled}
                style={{
                  width: 38,
                  height: 34,
                  border: '1px solid var(--b2b-border)',
                  borderRadius: 6,
                  padding: 2,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  background: 'var(--b2b-bg-2)',
                }}
              />
              <input
                type="text"
                className="b2b-input"
                value={c.valor}
                maxLength={7}
                placeholder="#7C3AED"
                onChange={(e) => updateHex(i, e.target.value)}
                disabled={disabled}
                style={{ width: 110, flexShrink: 0, fontFamily: 'ui-monospace, monospace' }}
              />
              <input
                type="text"
                className="b2b-input"
                value={c.nome}
                placeholder="Ex: Primária, Secundária, Fundo..."
                onChange={(e) => update(i, 'nome', e.target.value)}
                disabled={disabled}
                style={{ flex: 1 }}
              />
              {i > 1 ? (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={disabled}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--b2b-border)',
                    color: 'var(--b2b-red)',
                    borderRadius: 4,
                    width: 28,
                    height: 28,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  title="Remover"
                >
                  <X size={12} />
                </button>
              ) : (
                <div style={{ width: 28, flexShrink: 0 }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
