'use client'

/**
 * BLOCO 3.4B · Modais de bulk actions em /leads.
 *
 * Estilo `b2b-*` themed pra consistência com LeadsClient (tabela em CSS grid
 * b2b, NÃO usa shared `<Modal>` do @clinicai/ui). Cada modal:
 *   - controla state local (motivo, fase escolhida)
 *   - validação client min/max
 *   - botão confirm disabled enquanto pending/inválido
 *   - escape/backdrop fecham apenas quando !busy
 *
 * `bulkAddLeadTagsAction` deliberadamente FORA · `leads.tags` removida em
 * prod durante REFACTOR_LEAD_MODEL · `repos.leads.addTags` LANÇA erro
 * desde Lote 2 P0.2 (2026-05-17). Ver `apps/lara/docs/OUT_P0_TAGS.md`.
 */

import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { LeadPhase } from '@clinicai/repositories'

const PHASE_OPTIONS: Array<{ value: LeadPhase; label: string; hint: string }> = [
  { value: 'lead', label: 'Lead', hint: 'Pipeline inicial · sem appointment/orçamento' },
  { value: 'agendado', label: 'Agendado', hint: 'Tem appointment ativo' },
  { value: 'paciente', label: 'Paciente', hint: 'Compareceu e virou paciente' },
  { value: 'orcamento', label: 'Orçamento', hint: 'Recebeu orçamento aberto' },
]

interface BulkChangePhaseModalProps {
  selectedCount: number
  busy: boolean
  onCancel: () => void
  onConfirm: (toPhase: LeadPhase, reason: string) => void | Promise<void>
}

export function BulkChangePhaseModal({
  selectedCount,
  busy,
  onCancel,
  onConfirm,
}: BulkChangePhaseModalProps) {
  const [toPhase, setToPhase] = useState<LeadPhase>('lead')
  const [reason, setReason] = useState('')
  const reasonTrim = reason.trim()
  const canSubmit = !busy && reasonTrim.length <= 500

  return (
    <div className="b2b-overlay" onClick={busy ? undefined : onCancel}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="b2b-modal-hdr">
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--b2b-champagne)',
            }}
          >
            <ArrowRight size={16} />
            Mudar fase em lote
          </h2>
          <button onClick={onCancel} className="b2b-close" aria-label="Fechar" disabled={busy}>
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p style={{ marginBottom: 12, color: 'var(--b2b-text-dim)', fontSize: 13 }}>
            <strong style={{ color: 'var(--b2b-ivory)' }}>
              {selectedCount} {selectedCount === 1 ? 'lead' : 'leads'}
            </strong>{' '}
            selecionados · a mudança é registrada no <code>phase_history</code>{' '}
            automaticamente. Leads em transições inválidas pela matriz canônica
            são pulados pela RPC e contam como falha agregada.
          </p>

          <label
            htmlFor="bulk-phase-select"
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'var(--b2b-text-muted)',
              fontWeight: 700,
            }}
          >
            Nova fase
          </label>
          <select
            id="bulk-phase-select"
            value={toPhase}
            onChange={(e) => setToPhase(e.target.value as LeadPhase)}
            disabled={busy}
            className="b2b-input"
            style={{ marginBottom: 4 }}
          >
            {PHASE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} · {p.hint}
              </option>
            ))}
          </select>

          <label
            htmlFor="bulk-phase-reason"
            style={{
              display: 'block',
              marginTop: 14,
              marginBottom: 6,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'var(--b2b-text-muted)',
              fontWeight: 700,
            }}
          >
            Motivo (opcional · até 500 caracteres)
          </label>
          <textarea
            id="bulk-phase-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            placeholder="Ex: revisão de pipeline · merge de campanhas..."
            rows={3}
            maxLength={500}
            className="b2b-input"
            style={{ minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div
            style={{
              fontSize: 10,
              color: 'var(--b2b-text-muted)',
              textAlign: 'right',
              marginTop: 2,
            }}
          >
            {reasonTrim.length}/500
          </div>

          <div className="b2b-form-actions">
            <button type="button" className="b2b-btn" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn b2b-btn-primary"
              disabled={!canSubmit}
              onClick={() => onConfirm(toPhase, reasonTrim)}
            >
              {busy ? 'Aplicando...' : `Aplicar para ${selectedCount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface BulkLostModalProps {
  selectedCount: number
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void | Promise<void>
}

export function BulkLostModal({
  selectedCount,
  busy,
  onCancel,
  onConfirm,
}: BulkLostModalProps) {
  const [reason, setReason] = useState('')
  const reasonTrim = reason.trim()
  const canSubmit = !busy && reasonTrim.length >= 3 && reasonTrim.length <= 500

  return (
    <div className="b2b-overlay" onClick={busy ? undefined : onCancel}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="b2b-modal-hdr">
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--b2b-red)',
            }}
          >
            <AlertTriangle size={16} />
            Marcar perdidos em lote
          </h2>
          <button onClick={onCancel} className="b2b-close" aria-label="Fechar" disabled={busy}>
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p style={{ marginBottom: 12, color: 'var(--b2b-text-dim)', fontSize: 13 }}>
            <strong style={{ color: 'var(--b2b-ivory)' }}>
              {selectedCount} {selectedCount === 1 ? 'lead' : 'leads'}
            </strong>{' '}
            irão pro lifecycle <code>perdido</code> · cada um preserva a phase
            atual em <code>lost_from_phase</code>. Recuperação continua possível
            via <code>/crm/recuperacao</code>.
          </p>
          <p
            style={{
              padding: '8px 10px',
              border: '1px solid rgba(217,122,122,0.30)',
              borderRadius: 6,
              background: 'rgba(217,122,122,0.08)',
              color: 'var(--b2b-red)',
              fontSize: 11,
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            ⚠ Operação NÃO é atômica · cada lead é processado individualmente.
            Se algum falhar (lifecycle já perdido, RLS, etc), o resultado mostra
            quantos foram marcados vs quantos falharam.
          </p>

          <label
            htmlFor="bulk-lost-reason"
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'var(--b2b-text-muted)',
              fontWeight: 700,
            }}
          >
            Motivo (obrigatório · mín 3 caracteres)
          </label>
          <textarea
            id="bulk-lost-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            placeholder="Ex: campanha encerrada, sem retorno, leads frios..."
            rows={3}
            maxLength={500}
            autoFocus
            className="b2b-input"
            style={{ minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div
            style={{
              fontSize: 10,
              color: 'var(--b2b-text-muted)',
              textAlign: 'right',
              marginTop: 2,
            }}
          >
            {reasonTrim.length}/500
          </div>

          <div className="b2b-form-actions">
            <button type="button" className="b2b-btn" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn"
              disabled={!canSubmit}
              onClick={() => onConfirm(reasonTrim)}
              style={{
                background: 'rgba(217,122,122,0.18)',
                color: 'var(--b2b-red)',
                borderColor: 'rgba(217,122,122,0.5)',
                fontWeight: 600,
              }}
            >
              {busy ? 'Marcando...' : `Marcar ${selectedCount} como perdido`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
