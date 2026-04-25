/**
 * /templates · b2b_comm_templates · lista admin densa + edicao inline.
 *
 * 13 seeds em prod cobrem partnership_activated, voucher_issued_*,
 * voucher_expiring/expired, voucher_cap_reached, monthly_report.
 *
 * Visual mirror b2b-config antigo · "Novo template" em form gold-tinted
 * (bcfg-admin-form), templates como rows densos.
 */

import { Plus } from 'lucide-react'
import { TemplateRow } from './TemplateRow'
import { createTemplateAction } from './actions'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

const RECIPIENT_OPTIONS = [
  { value: 'partner', label: 'Parceira' },
  { value: 'beneficiary', label: 'Beneficiária' },
  { value: 'admin', label: 'Admin (Mirian/Paula)' },
]

const CHANNEL_OPTIONS = [
  { value: 'text', label: 'Texto' },
  { value: 'audio', label: 'Áudio' },
  { value: 'both', label: 'Ambos' },
]

export default async function TemplatesPage() {
  const { ctx, repos } = await loadMiraServerContext()
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
  const templates = await repos.b2bTemplates.listAll(ctx.clinic_id)

  const active = templates.filter((t) => t.isActive)
  const inactive = templates.filter((t) => !t.isActive)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header denso */}
        <div className="flex items-center justify-between pb-2 border-b border-white/8">
          <div>
            <h1 className="text-base font-semibold text-[#F5F5F5]">Templates B2B</h1>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">
              {active.length} ativo{active.length === 1 ? '' : 's'} · {inactive.length} inativo{inactive.length === 1 ? '' : 's'} · editável pela Mirian
            </p>
          </div>
        </div>

        {/* Novo template · gold tinted form (collapsible) */}
        {canManage && (
          <details className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04]">
            <summary className="cursor-pointer px-3.5 py-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#C9A96E] hover:bg-[#C9A96E]/[0.06] rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Novo template
            </summary>
            <form action={createTemplateAction} className="px-3.5 pb-3.5 pt-1 flex flex-col gap-2.5 border-t border-[#C9A96E]/15">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-2.5">
                <FormField label="Event Key">
                  <input
                    name="eventKey"
                    required
                    placeholder="ex: referral_acknowledged"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] text-[#F5F5F5] text-xs focus:outline-none focus:border-[#C9A96E]/50 font-mono"
                  />
                </FormField>
                <FormField label="Recipient">
                  <select
                    name="recipientRole"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] text-[#F5F5F5] text-xs focus:outline-none focus:border-[#C9A96E]/50"
                  >
                    {RECIPIENT_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Canal">
                  <select
                    name="channel"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] text-[#F5F5F5] text-xs focus:outline-none focus:border-[#C9A96E]/50"
                  >
                    {CHANNEL_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Texto (text_template) · use {{name}} pra placeholders">
                <textarea
                  name="textTemplate"
                  rows={4}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] text-[#F5F5F5] text-xs focus:outline-none focus:border-[#C9A96E]/50 resize-y font-mono"
                />
              </FormField>

              <FormField label="Audio Script (opcional)">
                <textarea
                  name="audioScript"
                  rows={2}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] text-[#F5F5F5] text-xs focus:outline-none focus:border-[#C9A96E]/50 resize-y font-mono"
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <FormField label="Sender Instance">
                  <input
                    name="senderInstance"
                    defaultValue="mira-mirian"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] text-[#F5F5F5] text-xs focus:outline-none focus:border-[#C9A96E]/50 font-mono"
                  />
                </FormField>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/8">
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
                >
                  Criar template
                </button>
              </div>
            </form>
          </details>
        )}

        {templates.length === 0 ? (
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
            Nenhum template B2B cadastrado · use o formulário acima.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {active.map((t) => (
              <TemplateRow key={t.id} template={t} canManage={canManage} />
            ))}
            {inactive.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[1px] text-[#6B7280] hover:text-[#F5F5F5] py-2 px-1">
                  Inativos ({inactive.length})
                </summary>
                <div className="flex flex-col gap-1.5 mt-1.5">
                  {inactive.map((t) => (
                    <TemplateRow key={t.id} template={t} canManage={canManage} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
        {label}
      </label>
      {children}
    </div>
  )
}
