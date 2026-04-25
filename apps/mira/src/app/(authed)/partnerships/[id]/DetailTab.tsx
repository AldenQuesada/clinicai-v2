/**
 * Partnership detail · tab "Detalhe" · dados gerais + edicao basica + acoes.
 * Server Component · forms via Server Actions.
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
    <div className="space-y-8">
      {/* Dados gerais */}
      <section className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
        <h3 className="text-xs font-display-uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
          Dados gerais
        </h3>

        <form action={updatePartnershipBasicAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="hidden" name="id" value={partnership.id} />

          <Field label="Contato (nome)" name="contactName" defaultValue={partnership.contactName ?? ''} disabled={!canManage} />
          <Field label="Telefone" name="contactPhone" defaultValue={partnership.contactPhone ?? ''} disabled={!canManage} />
          <Field label="Email" name="contactEmail" defaultValue={partnership.contactEmail ?? ''} disabled={!canManage} />
          <Field label="Instagram" name="contactInstagram" defaultValue={partnership.contactInstagram ?? ''} disabled={!canManage} />
          <Field label="Pilar" name="pillar" defaultValue={partnership.pillar} disabled={!canManage} />

          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
              Observações
            </label>
            <textarea
              name="notes"
              rows={3}
              disabled={!canManage}
              className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] disabled:opacity-50 resize-y"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            {canManage && (
              <button
                type="submit"
                className="px-5 py-2 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
              >
                Salvar
              </button>
            )}
            {!canManage && (
              <span className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                Apenas owner/admin podem editar.
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Metadados */}
      <section className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
        <h3 className="text-xs font-display-uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
          Metadados
        </h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <Meta label="Slug" value={partnership.slug} />
          <Meta label="Status" value={partnership.status} />
          <Meta label="Tipo" value={partnership.type} />
          <Meta label="Tier" value={partnership.tier?.toString() ?? '—'} />
          <Meta label="Combo padrão" value={partnership.voucherCombo ?? '—'} />
          <Meta label="Validade voucher (dias)" value={String(partnership.voucherValidityDays)} />
          <Meta label="Cap mensal" value={partnership.voucherMonthlyCap?.toString() ?? '—'} />
          <Meta label="Health" value={partnership.healthColor} />
          <Meta label="Criada em" value={fmtDate(partnership.createdAt)} />
          <Meta label="Última atualização" value={fmtDate(partnership.updatedAt)} />
        </dl>
      </section>

      {/* Acoes (status) */}
      {canManage && (
        <section className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
          <h3 className="text-xs font-display-uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
            Ações
          </h3>
          <div className="flex flex-wrap gap-3">
            {partnership.status === 'dna_check' && (
              <form action={approvePartnershipAction}>
                <input type="hidden" name="id" value={partnership.id} />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border border-[hsl(var(--success))]/30 hover:bg-[hsl(var(--success))]/25 transition-colors"
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
                  className="px-4 py-2 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border border-[hsl(var(--warning))]/30 hover:bg-[hsl(var(--warning))]/25 transition-colors"
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
                  className="px-4 py-2 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border border-[hsl(var(--success))]/30 hover:bg-[hsl(var(--success))]/25 transition-colors"
                >
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
}: {
  label: string
  name: string
  defaultValue: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
        {label}
      </label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] disabled:opacity-50"
      />
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[hsl(var(--chat-border))] pb-2">
      <dt className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
        {label}
      </dt>
      <dd className="text-[hsl(var(--foreground))]">{value}</dd>
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
