/**
 * /templates · b2b_comm_templates · lista + edicao inline.
 *
 * 13 seeds em prod cobrem partnership_activated, voucher_issued_*,
 * voucher_expiring/expired, voucher_cap_reached, monthly_report.
 *
 * UI suporta event_keys novos (referral_acknowledged, partnership_welcome_text,
 * feedback_acknowledged) que Alden vai semear via "Novo template".
 */

import { FileText, Plus } from 'lucide-react'
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
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">Templates</span>
              <span className="ml-2 text-base text-[hsl(var(--muted-foreground))]">B2B</span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {active.length} ativo{active.length === 1 ? '' : 's'} · {inactive.length} inativo{inactive.length === 1 ? '' : 's'} · editável pela Mirian
            </p>
          </div>
        </div>

        {canManage && (
          <details className="mb-8 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
            <summary className="cursor-pointer px-5 py-4 flex items-center gap-2 text-sm font-display-uppercase tracking-widest text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/20 rounded-card transition-colors">
              <Plus className="w-4 h-4" />
              Novo template
            </summary>
            <form action={createTemplateAction} className="p-5 space-y-4 border-t border-[hsl(var(--chat-border))]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                    Event Key
                  </label>
                  <input
                    name="eventKey"
                    required
                    placeholder="ex: referral_acknowledged"
                    className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                    Recipient
                  </label>
                  <select
                    name="recipientRole"
                    className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]"
                  >
                    {RECIPIENT_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                    Canal
                  </label>
                  <select
                    name="channel"
                    className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]"
                  >
                    {CHANNEL_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Texto (text_template) · use {'{{name}}'} pra placeholders
                </label>
                <textarea
                  name="textTemplate"
                  rows={4}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] resize-y font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Audio Script (opcional)
                </label>
                <textarea
                  name="audioScript"
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] resize-y font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                    Sender Instance
                  </label>
                  <input
                    name="senderInstance"
                    defaultValue="mira-mirian"
                    className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] font-mono text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-5 py-2 rounded-pill font-display-uppercase text-xs tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
              >
                Criar template
              </button>
            </form>
          </details>
        )}

        {templates.length === 0 ? (
          <div className="text-center py-16 text-[hsl(var(--muted-foreground))] text-sm">
            Nenhum template B2B cadastrado · use o formulário acima.
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((t) => (
              <TemplateRow key={t.id} template={t} canManage={canManage} />
            ))}
            {inactive.length > 0 && (
              <details className="mt-8">
                <summary className="cursor-pointer text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] py-3">
                  Inativos ({inactive.length})
                </summary>
                <div className="space-y-3 mt-2">
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
