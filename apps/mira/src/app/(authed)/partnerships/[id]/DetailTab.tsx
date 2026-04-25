/**
 * Partnership detail · tab "Detalhe" · dados gerais + edicao + acoes.
 * Server Component · forms via Server Actions.
 *
 * Visual mirror b2b-config.css `.bcfg-admin-form` (gold tinted form),
 * `.bcfg-about-row` (metadata grid), `.bcfg-form-actions`.
 */

import {
  updatePartnershipBasicAction,
  approvePartnershipAction,
  setPartnershipStatusAction,
} from '../actions'
import type { B2BPartnershipDTO } from '@clinicai/repositories'

export function DetailTab({
  partnership,
  canManage,
}: {
  partnership: B2BPartnershipDTO
  canManage: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Dados gerais · gold tinted form */}
      <Section title="Dados gerais">
        <form
          action={updatePartnershipBasicAction}
          className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={partnership.id} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <Field label="Contato (nome)" name="contactName" defaultValue={partnership.contactName ?? ''} disabled={!canManage} />
            <Field label="Telefone" name="contactPhone" defaultValue={partnership.contactPhone ?? ''} disabled={!canManage} mono />
            <Field label="Email" name="contactEmail" defaultValue={partnership.contactEmail ?? ''} disabled={!canManage} />
            <Field label="Instagram" name="contactInstagram" defaultValue={partnership.contactInstagram ?? ''} disabled={!canManage} />
            <Field label="Pilar" name="pillar" defaultValue={partnership.pillar} disabled={!canManage} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
              Observações
            </label>
            <textarea
              name="notes"
              rows={3}
              disabled={!canManage}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50 resize-y"
            />
          </div>

          <div className="flex items-center gap-2 pt-1.5 border-t border-white/10">
            {canManage ? (
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
              >
                Salvar
              </button>
            ) : (
              <span className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
                Apenas owner/admin podem editar.
              </span>
            )}
          </div>
        </form>
      </Section>

      {/* Metadados · about-row pattern */}
      <Section title="Metadados">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 flex flex-col">
          <Meta label="Slug" value={partnership.slug} mono />
          <Meta label="Status" value={partnership.status} />
          <Meta label="Tipo" value={partnership.type} />
          <Meta label="Tier" value={partnership.tier?.toString() ?? '—'} />
          <Meta label="Combo padrão" value={partnership.voucherCombo ?? '—'} />
          <Meta label="Validade voucher (dias)" value={String(partnership.voucherValidityDays)} />
          <Meta label="Cap mensal" value={partnership.voucherMonthlyCap?.toString() ?? '—'} />
          <Meta label="Health" value={partnership.healthColor} />
          <Meta label="Criada em" value={fmtDate(partnership.createdAt)} />
          <Meta label="Última atualização" value={fmtDate(partnership.updatedAt)} last />
        </div>
      </Section>

      {/* Acoes · status changes */}
      {canManage && (
        <Section title="Ações">
          <div className="flex flex-wrap gap-2">
            {partnership.status === 'dna_check' && (
              <form action={approvePartnershipAction}>
                <input type="hidden" name="id" value={partnership.id} />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 hover:bg-[#10B981]/25 transition-colors"
                >
                  Aprovar parceria
                </button>
              </form>
            )}

            {partnership.status === 'active' && (
              <form action={setPartnershipStatusAction}>
                <input type="hidden" name="id" value={partnership.id} />
                <input type="hidden" name="status" value="paused" />
                <input type="hidden" name="reason" value="paused_via_ui" />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 hover:bg-[#F59E0B]/25 transition-colors"
                >
                  Pausar
                </button>
              </form>
            )}

            {partnership.status === 'paused' && (
              <form action={setPartnershipStatusAction}>
                <input type="hidden" name="id" value={partnership.id} />
                <input type="hidden" name="status" value="active" />
                <input type="hidden" name="reason" value="reactivated_via_ui" />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 hover:bg-[#10B981]/25 transition-colors"
                >
                  Reativar
                </button>
              </form>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
        {title}
      </h3>
      {children}
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
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
        {label}
      </label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`w-full px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function Meta({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 text-[11.5px] ${last ? '' : 'border-b border-dashed border-white/10'}`}>
      <span className="text-[#9CA3AF]">{label}</span>
      <span className={`text-[#F5F0E8] ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
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
