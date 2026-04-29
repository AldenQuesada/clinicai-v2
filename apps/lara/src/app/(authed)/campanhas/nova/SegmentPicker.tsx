'use client'

/**
 * SegmentPicker · 4 selects de filtro + chips de leads manuais.
 *
 * Espelho de _renderBroadcastFormBody linhas 529–582 (broadcast.ui.js).
 *
 * NOTA: a busca de leads manuais por nome (linha 428–520 broadcast-events.ui.js)
 * usa LeadsService.loadAll() do clinic-dashboard. Como nao temos uma RPC
 * dedicada de "search leads" exposta no Lara nem cache global, este picker
 * versao 1 NAO faz autocomplete em tempo real. Os ids manuais entram via
 * prefill ?leads=id1,id2 (vindos da tabela de leads quando port for feito)
 * ou via "Reaproveitar" de outro broadcast. UX aproximada do clinic-dashboard
 * (que tambem so funcionava com leads carregados em cache).
 */

import {
  PHASE_OPTIONS,
  TEMPERATURE_OPTIONS,
  FUNNEL_OPTIONS,
  SOURCE_OPTIONS,
} from '../lib/filters'

export interface SegmentState {
  filter_phase: string
  filter_temperature: string
  filter_funnel: string
  filter_source_type: string
  selected_leads: Array<{ id: string; nome: string; phone: string }>
  target_queixa: string
}

export function SegmentPicker({
  state,
  onChange,
}: {
  state: SegmentState
  onChange: (next: Partial<SegmentState>) => void
}) {
  function removeLead(id: string) {
    onChange({
      selected_leads: state.selected_leads.filter((l) => l.id !== id),
    })
  }

  return (
    <div>
      <div
        className="b2b-form-sec"
        style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}
      >
        Segmentação
        <span
          style={{
            fontSize: 10,
            color: 'var(--b2b-text-muted)',
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          (opcional se selecionar leads manualmente)
        </span>
      </div>

      <div className="b2b-grid-2" style={{ marginBottom: 8 }}>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Fase</label>
          <select
            className="b2b-input"
            value={state.filter_phase}
            onChange={(e) => onChange({ filter_phase: e.target.value })}
          >
            <option value="">—</option>
            {PHASE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Temperatura</label>
          <select
            className="b2b-input"
            value={state.filter_temperature}
            onChange={(e) => onChange({ filter_temperature: e.target.value })}
          >
            <option value="">—</option>
            {TEMPERATURE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Funil</label>
          <select
            className="b2b-input"
            value={state.filter_funnel}
            onChange={(e) => onChange({ filter_funnel: e.target.value })}
          >
            <option value="">—</option>
            {FUNNEL_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="b2b-field">
          <label className="b2b-field-lbl">Origem</label>
          <select
            className="b2b-input"
            value={state.filter_source_type}
            onChange={(e) => onChange({ filter_source_type: e.target.value })}
          >
            <option value="">—</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.target_queixa && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--b2b-champagne)',
            background: 'rgba(201,169,110,0.10)',
            border: '1px solid var(--b2b-border)',
            padding: '6px 10px',
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          Queixa filtrada na origem: <b>{state.target_queixa}</b> · use [queixa] na
          mensagem para interpolar
        </div>
      )}

      {state.selected_leads.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="b2b-field-lbl" style={{ marginBottom: 6 }}>
            Leads selecionados manualmente ({state.selected_leads.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {state.selected_leads.map((l) => (
              <span
                key={l.id}
                className="b2b-pill"
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                {l.nome || '(sem nome)'}
                <button
                  type="button"
                  onClick={() => removeLead(l.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--b2b-text-muted)',
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  title="Remover"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <small
            style={{
              fontSize: 10,
              color: 'var(--b2b-text-muted)',
              display: 'block',
              marginTop: 6,
            }}
          >
            Leads selecionados recebem o disparo independente dos filtros (OR).
          </small>
        </div>
      )}
    </div>
  )
}
