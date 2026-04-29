'use client'

/**
 * Repeater · CNAEs secundarios.
 * Port das funcoes csRenderCnaes/Add/Remove (clinic-settings.js linhas 257-286).
 */

import { Plus, X } from 'lucide-react'

export function CnaesRepeater({
  value,
  onChange,
  disabled = false,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  function update(i: number, val: string) {
    const next = value.slice()
    next[i] = val
    onChange(next)
  }
  function add() {
    onChange([...value, ''])
  }
  function remove(i: number) {
    const next = value.slice()
    next.splice(i, 1)
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label className="b2b-field-lbl" style={{ marginBottom: 0 }}>
          CNAE Secundários
        </label>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 10px' }}
        >
          <Plus size={10} /> Adicionar
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              className="b2b-input"
              placeholder="Ex: 8690-9/99 – Atividades de atenção à saúde humana"
              value={v}
              onChange={(e) => update(i, e.target.value)}
              disabled={disabled}
            />
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
          </div>
        ))}
      </div>
    </div>
  )
}
