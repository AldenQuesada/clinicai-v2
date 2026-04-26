/**
 * Partnership detail · tab "Detalhe" · ficha completa em estilo legado
 * b2b-detail.ui.js (KV blocks 2-cols com b2b-sec-title +  b2b-kv).
 *
 * Sections:
 *   Gestao         · ManagementWidget (status switcher + account manager)
 *   Dados gerais   · edicao rapida (form gold-tinted · b2b-card-gold)
 *   Contato        · b2b-kv list (responsavel/telefone/email/instagram)
 *   Voucher        · b2b-kv list (combo/validade/cap)
 *   Vigencia       · b2b-kv list (teto/duracao)
 *   Operacional    · slug/health/criada (b2b-kv mono em valores tecnicos)
 *   Acoes          · status changes (aprovar/pausar/reativar)
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

const STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  dna_check: 'Avaliar DNA',
  contract: 'Em contrato',
  active: 'Ativa',
  review: 'Em revisão',
  paused: 'Pausada',
  closed: 'Encerrada',
}

const TYPE_LABELS: Record<string, string> = {
  transactional: 'Transacional',
  occasion: 'Ocasião',
  institutional: 'Institucional',
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
      {/* Gestao · status + account manager */}
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
          >
            <Pencil className="w-3 h-3" /> Abrir editor
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

      {/* Ficha completa · 2-col KV */}
      <div className="b2b-detail-cols">
        {/* Coluna 1 · Contato + Voucher */}
        <div>
          <div className="b2b-sec-title">Contato</div>
          <KV label="Responsável" value={partnership.contactName} />
          <KV label="Telefone" value={partnership.contactPhone} mono />
          <KV label="E-mail" value={partnership.contactEmail} />
          <KV label="Instagram" value={partnership.contactInstagram} />

          <div className="b2b-sec-title">Voucher</div>
          <KV label="Combo padrão" value={partnership.voucherCombo} />
          <KV label="Validade" value={`${partnership.voucherValidityDays} dias`} />
          <KV
            label="Cap mensal"
            value={partnership.voucherMonthlyCap ? `${partnership.voucherMonthlyCap} un.` : null}
          />

          <div className="b2b-sec-title">Vigência</div>
          <KV
            label="Duração contrato"
            value={partnership.contractDurationMonths ? `${partnership.contractDurationMonths} meses` : null}
          />
        </div>

        {/* Coluna 2 · Operacional + Acoes */}
        <div>
          <div className="b2b-sec-title">Operacional</div>
          <KV label="Slug" value={partnership.slug} mono />
          <KV label="Tipo" value={TYPE_LABELS[partnership.type] || partnership.type} />
          <KV label="Tier" value={partnership.tier?.toString() ?? null} />
          <KV label="Status" value={STATUS_LABELS[partnership.status] || partnership.status} />
          <KV label="Health" value={partnership.healthColor} />
          <KV label="DNA score" value={partnership.dnaScore != null ? `${partnership.dnaScore.toFixed(1)}/10` : null} />
          <KV label="Account manager" value={partnership.accountManager} />

          <div className="b2b-sec-title">Histórico</div>
          <KV label="Criada em" value={fmtDate(partnership.createdAt)} mono />
          <KV label="Atualizada" value={fmtDate(partnership.updatedAt)} mono />
          {partnership.assignedAt ? (
            <KV label="Manager atribuído" value={fmtDate(partnership.assignedAt)} mono />
          ) : null}
        </div>
      </div>

      {/* Acoes · status changes */}
      {canManage && (
        <section className="flex flex-col gap-2">
          <h2 className="b2b-sec-title">Ações</h2>
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

function KV({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  if (value == null || value === '') return null
  return (
    <div className="b2b-kv">
      <span className="b2b-kv-lbl">{label}</span>
      <span className={`b2b-kv-val${mono ? ' is-mono' : ''}`}>{value}</span>
    </div>
  )
}

function fmtDate(iso: string): string {
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
