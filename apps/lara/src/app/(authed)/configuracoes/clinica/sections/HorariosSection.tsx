'use client'

/**
 * Section · Horarios de Funcionamento.
 * Port da renderHorariosGrid + toggleDiaHorario + toggleHorarioPeriodo +
 * aplicarHorarioParaTodos + getHorarios (clinic-settings.js linhas 514-706).
 *
 * Replica fielmente:
 *  - Defaults Manhã 08:30-12:00 / Tarde 13:30-18:00 · Dom fechado
 *  - Toggle dia aberto/fechado
 *  - Toggle por periodo (Manhã/Tarde) com botoes [+ Manha] / [+ Tarde]
 *  - Botao "Aplicar para todos" copia o estado do dia atual pros outros
 *    apenas em dias ja marcados como abertos (linha 647)
 */

import { useState } from 'react'
import { Copy, X, Check } from 'lucide-react'
import type { ClinicSettingsData, HorariosMap } from '../types'
import { DIAS_SEMANA, normalizeHorarios, type HorarioDia } from '../lib/horarios'

export function HorariosSection({
  data,
  onChange,
  canEdit,
}: {
  data: ClinicSettingsData
  onChange: (patch: Partial<ClinicSettingsData>) => void
  canEdit: boolean
}) {
  const ro = !canEdit
  const horarios = normalizeHorarios(data.horarios || {})
  const [appliedFlash, setAppliedFlash] = useState<string | null>(null)

  function patchDia(diaKey: string, patch: Partial<HorarioDia>) {
    const next: HorariosMap = { ...horarios, [diaKey]: { ...horarios[diaKey], ...patch } }
    onChange({ horarios: next })
  }
  function patchPeriodo(diaKey: string, periodo: 'manha' | 'tarde', patch: Partial<HorarioDia[typeof periodo]>) {
    const cur = horarios[diaKey]
    const updated: HorarioDia = { ...cur, [periodo]: { ...cur[periodo], ...patch } }
    onChange({ horarios: { ...horarios, [diaKey]: updated } })
  }

  function aplicarParaTodos(origemKey: string) {
    const origem = horarios[origemKey]
    const next: HorariosMap = { ...horarios }
    for (const d of DIAS_SEMANA) {
      if (d.key === origemKey) continue
      const cur = next[d.key]
      if (!cur.aberto) continue
      next[d.key] = {
        aberto: true,
        manha: { ...origem.manha },
        tarde: { ...origem.tarde },
      }
    }
    onChange({ horarios: next })
    setAppliedFlash(origemKey)
    setTimeout(() => setAppliedFlash((cur) => (cur === origemKey ? null : cur)), 2000)
  }

  return (
    <section className="luxury-card" style={{ padding: '20px 24px 24px' }}>
      <div className="b2b-form-sec">Horário de Funcionamento</div>
      <div
        style={{
          background: 'var(--b2b-bg-1)',
          border: '1px solid var(--b2b-border)',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DIAS_SEMANA.map((d) => {
            const h = horarios[d.key]
            const manhaAtivo = h.manha.ativo !== false
            const tardeAtivo = h.tarde.ativo !== false
            return (
              <div
                key={d.key}
                style={{
                  border: '1px solid var(--b2b-border)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  background: h.aberto ? 'var(--b2b-bg-2)' : 'var(--b2b-bg-1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      cursor: ro ? 'not-allowed' : 'pointer',
                      minWidth: 96,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={h.aberto}
                      onChange={(e) => patchDia(d.key, { aberto: e.target.checked })}
                      disabled={ro}
                      style={{
                        width: 15,
                        height: 15,
                        accentColor: 'var(--b2b-champagne)',
                        cursor: ro ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: h.aberto ? 600 : 400,
                        color: h.aberto ? 'var(--b2b-ivory)' : 'var(--b2b-text-muted)',
                      }}
                    >
                      {d.label}
                    </span>
                  </label>

                  {h.aberto ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* Manha */}
                      {manhaAtivo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={tagStyle('#F5C76C')}>Manhã</span>
                          <input
                            type="time"
                            className="b2b-input"
                            style={{ width: 92, padding: '5px 7px', fontSize: 12 }}
                            value={h.manha.inicio}
                            onChange={(e) => patchPeriodo(d.key, 'manha', { inicio: e.target.value })}
                            disabled={ro}
                          />
                          <span style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>–</span>
                          <input
                            type="time"
                            className="b2b-input"
                            style={{ width: 92, padding: '5px 7px', fontSize: 12 }}
                            value={h.manha.fim}
                            onChange={(e) => patchPeriodo(d.key, 'manha', { fim: e.target.value })}
                            disabled={ro}
                          />
                          <button
                            type="button"
                            onClick={() => patchPeriodo(d.key, 'manha', { ativo: false })}
                            disabled={ro}
                            title="Remover período"
                            style={iconBtnStyle(ro)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => patchPeriodo(d.key, 'manha', { ativo: true })}
                          disabled={ro}
                          style={addBtnStyle(ro, '#F5C76C')}
                        >
                          + Manhã
                        </button>
                      )}

                      {manhaAtivo && tardeAtivo && (
                        <span style={{ fontSize: 13, color: 'var(--b2b-text-muted)' }}>|</span>
                      )}

                      {/* Tarde */}
                      {tardeAtivo ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={tagStyle('var(--b2b-champagne)')}>Tarde</span>
                          <input
                            type="time"
                            className="b2b-input"
                            style={{ width: 92, padding: '5px 7px', fontSize: 12 }}
                            value={h.tarde.inicio}
                            onChange={(e) => patchPeriodo(d.key, 'tarde', { inicio: e.target.value })}
                            disabled={ro}
                          />
                          <span style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>–</span>
                          <input
                            type="time"
                            className="b2b-input"
                            style={{ width: 92, padding: '5px 7px', fontSize: 12 }}
                            value={h.tarde.fim}
                            onChange={(e) => patchPeriodo(d.key, 'tarde', { fim: e.target.value })}
                            disabled={ro}
                          />
                          <button
                            type="button"
                            onClick={() => patchPeriodo(d.key, 'tarde', { ativo: false })}
                            disabled={ro}
                            title="Remover período"
                            style={iconBtnStyle(ro)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => patchPeriodo(d.key, 'tarde', { ativo: true })}
                          disabled={ro}
                          style={addBtnStyle(ro, 'var(--b2b-champagne)')}
                        >
                          + Tarde
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--b2b-text-muted)', fontStyle: 'italic' }}>
                      Fechado
                    </span>
                  )}

                  {h.aberto && (
                    <button
                      type="button"
                      onClick={() => aplicarParaTodos(d.key)}
                      disabled={ro}
                      title="Aplicar este horário para todos os outros dias"
                      style={{
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        border: `1px solid ${appliedFlash === d.key ? 'var(--b2b-sage)' : 'var(--b2b-border)'}`,
                        borderRadius: 5,
                        background: 'var(--b2b-bg-1)',
                        color: appliedFlash === d.key ? 'var(--b2b-sage)' : 'var(--b2b-text-dim)',
                        cursor: ro ? 'not-allowed' : 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {appliedFlash === d.key ? <Check size={11} /> : <Copy size={11} />}
                      {appliedFlash === d.key ? 'Aplicado!' : 'Aplicar para todos'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function tagStyle(color: string): React.CSSProperties {
  return {
    fontSize: 9,
    fontWeight: 700,
    color,
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    background: `${color === 'var(--b2b-champagne)' ? 'rgba(201,169,110,0.15)' : color + '22'}`,
    padding: '2px 7px',
    borderRadius: 10,
  }
}

function iconBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    border: '1px solid var(--b2b-border)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--b2b-red)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  }
}

function addBtnStyle(disabled: boolean, color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    border: `1px dashed ${color}`,
    borderRadius: 5,
    background: 'transparent',
    color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11,
    fontWeight: 600,
  }
}
