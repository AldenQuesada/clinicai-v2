/**
 * Partnership detail · tab "Detalhe" · ficha completa em estilo legado
 * b2b-detail.ui.js (KV blocks 2-cols com b2b-sec-title +  b2b-kv).
 *
 * Sections (ordem mirror legacy modal):
 *   3 NextStepHint     · proximo passo do funil
 *   4 DnaBar           · 3 dimensoes scoring
 *   1 ManagementWidget · status switcher + account manager (gestao)
 *      Edicao rapida   · form gold-tinted (pre-existente · mantido)
 *   6 KvSection        · 2-col KV (Contato/Voucher/Vigencia + Narrativa/...)
 *   18 TimelineSection · historico cronologico (no rodape antes de LGPD)
 *   19 LgpdSection     · acoes anonymize/export/consent
 */

import Link from 'next/link'
import { Pencil } from 'lucide-react'
import {
  updatePartnershipBasicAction,
  approvePartnershipAction,
  setPartnershipStatusAction,
} from '../actions'
import type { B2BPartnershipDTO } from '@clinicai/repositories'
import { ManagementWidget } from './ManagementWidget'
import { NextStepHint } from './sections/NextStepHint'
import { DnaBar } from './sections/DnaBar'
import { KvSection } from './sections/KvSection'
import { TimelineSection } from './sections/TimelineSection'
import { LgpdSection } from './sections/LgpdSection'

const STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  dna_check: 'Avaliar DNA',
  contract: 'Em contrato',
  active: 'Ativa',
  review: 'Em revisão',
  paused: 'Pausada',
  closed: 'Encerrada',
}

export function DetailTab({
  partnership,
  canManage,
  managers,
}: {
  partnership: B2BPartnershipDTO
  canManage: boolean
  managers: string[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Sec 3 · Next step hint */}
      <NextStepHint partnership={partnership} />

      {/* Sec 4 · DNA bar */}
      <DnaBar partnership={partnership} />

      {/* Sec 1 · Gestao (status + account manager) */}
      <section className="flex flex-col gap-2">
        <h2 className="b2b-sec-title" style={{ marginTop: 0 }}>Gestão</h2>
        <ManagementWidget
          partnershipId={partnership.id}
          currentStatus={partnership.status}
          currentManager={partnership.accountManager}
          managers={managers}
          canManage={canManage}
        />
      </section>

      {/* CTA edicao completa */}
      {canManage && (
        <div className="b2b-card b2b-card-gold flex-row items-center justify-between" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold text-[var(--b2b-ivory)]">
              Edição completa da parceria
            </span>
            <span className="text-[11px] text-[var(--b2b-text-muted)]">
              DNA, voucher, contrato, profissionais, narrativa — wizard 3-step.
            </span>
          </div>
          <Link
            href={`/partnerships/${partnership.id}/editar`}
            className="b2b-btn b2b-btn-primary inline-flex items-center gap-1.5"
            title="Wizard 3-step: DNA + voucher + contrato + profissionais + narrativa."
          >
            <Pencil className="w-3 h-3" aria-label="Editar" /> Abrir editor
          </Link>
        </div>
      )}

      {/* Dados gerais · edicao rapida (form gold-tinted) */}
      <section className="flex flex-col gap-2">
        <h2 className="b2b-sec-title" style={{ marginTop: 0 }}>Dados gerais (edição rápida)</h2>
        <form action={updatePartnershipBasicAction} className="b2b-card b2b-card-gold">
          <input type="hidden" name="id" value={partnership.id} />

          <div className="b2b-grid-2" style={{ marginTop: 4 }}>
            <Field label="Contato (nome)" name="contactName" defaultValue={partnership.contactName ?? ''} disabled={!canManage} />
            <Field label="Telefone" name="contactPhone" defaultValue={partnership.contactPhone ?? ''} disabled={!canManage} mono />
            <Field label="Email" name="contactEmail" defaultValue={partnership.contactEmail ?? ''} disabled={!canManage} />
            <Field label="Instagram" name="contactInstagram" defaultValue={partnership.contactInstagram ?? ''} disabled={!canManage} />
            <Field label="Pilar" name="pillar" defaultValue={partnership.pillar} disabled={!canManage} />
          </div>

          <div className="b2b-field">
            <label className="b2b-field-lbl">Observações</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={partnership.notes ?? ''}
              disabled={!canManage}
              className="b2b-input"
              style={{ resize: 'vertical', minHeight: 64 }}
            />
          </div>

          <div className="b2b-form-actions">
            {canManage ? (
              <button type="submit" className="b2b-btn b2b-btn-primary">
                Salvar
              </button>
            ) : (
              <span className="text-[10px] uppercase tracking-[1.2px] text-[var(--b2b-text-muted)]">
                Apenas owner/admin podem editar.
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Sec 6 · 2-col KV (ficha completa) */}
      <KvSection partnership={partnership} />

      {/* Acoes · status changes (mantem) */}
      {canManage && (
        <section className="flex flex-col gap-2">
          <h2 className="b2b-sec-title">Ações rápidas de status</h2>
          <div className="flex flex-wrap gap-2">
            {partnership.status === 'dna_check' && (
              <form action={approvePartnershipAction}>
                <input type="hidden" name="id" value={partnership.id} />
                <button type="submit" className="b2b-btn" style={{ borderColor: 'rgba(16,185,129,0.4)', color: '#10B981' }}>
                  Aprovar parceria
                </button>
              </form>
            )}

            {partnership.status === 'active' && (
              <form action={setPartnershipStatusAction}>
                <input type="hidden" name="id" value={partnership.id} />
                <input type="hidden" name="status" value="paused" />
                <input type="hidden" name="reason" value="paused_via_ui" />
                <button type="submit" className="b2b-btn" style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#F59E0B' }}>
                  Pausar
                </button>
              </form>
            )}

            {partnership.status === 'paused' && (
              <form action={setPartnershipStatusAction}>
                <input type="hidden" name="id" value={partnership.id} />
                <input type="hidden" name="status" value="active" />
                <input type="hidden" name="reason" value="reactivated_via_ui" />
                <button type="submit" className="b2b-btn" style={{ borderColor: 'rgba(16,185,129,0.4)', color: '#10B981' }}>
                  Reativar
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {/* Sec 18 · Timeline (historico cronologico) */}
      <TimelineSection partnershipId={partnership.id} />

      {/* Sec 19 · LGPD compliance (rodape) */}
      <LgpdSection
        partnershipId={partnership.id}
        partnershipName={partnership.name}
        canManage={canManage}
      />
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
  disabled,
  mono,
}: {
  label: string
  name: string
  defaultValue: string
  disabled?: boolean
  mono?: boolean
}) {
  return (
    <div className="b2b-field" style={{ marginBottom: 0 }}>
      <label className="b2b-field-lbl">{label}</label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="b2b-input"
        style={mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } : undefined}
      />
    </div>
  )
}

// fmtDate moved out (no longer used here · KvSection ja formata)
// (kept for stability of imports if any — unused but harmless)
export function _fmtDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

void STATUS_LABELS
