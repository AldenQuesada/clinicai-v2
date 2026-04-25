/**
 * Templates de resposta rápida · Server Component.
 *
 * Reutiliza tabela wa_message_templates (existente · 42+ rows). Filtro por
 * clinic_id resolvido via JWT (multi-tenant ADR-028).
 *
 * Atendente pode:
 *   - Ver todos templates ativos
 *   - Criar novo (Server Action createTemplateAction)
 *   - Copiar pro clipboard pra colar no chat
 *   - Editar/excluir (apenas owner/admin)
 */

import { cookies } from 'next/headers'
import { createServerClient, requireClinicContext } from '@clinicai/supabase'
import { FileText, Plus } from 'lucide-react'
import { TemplateRow } from './TemplateRow'
import { createTemplateAction } from './actions'

export const dynamic = 'force-dynamic'

interface Template {
  id: string
  name: string
  message: string | null
  content: string | null
  category: string | null
  trigger_phase: string | null
  active: boolean
  is_active: boolean
  sort_order: number | null
  created_at: string
}

async function loadTemplates(): Promise<{ templates: Template[]; canManage: boolean }> {
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    },
  })

  const ctx = await requireClinicContext(supabase)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('wa_message_templates') as any)
    .select('id, name, message, content, category, trigger_phase, active, is_active, sort_order, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
  return { templates: (data ?? []) as Template[], canManage }
}

export default async function TemplatesPage() {
  const { templates, canManage } = await loadTemplates()
  const active = templates.filter((t) => t.is_active !== false && t.active !== false)
  const inactive = templates.filter((t) => t.is_active === false || t.active === false)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-light">
                <span className="font-cursive-italic text-[hsl(var(--primary))]">Templates</span>
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Respostas rápidas pra colar nas conversas · {active.length} ativos
              </p>
            </div>
          </div>
        </div>

        {canManage && (
          <details className="mb-8 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
            <summary className="cursor-pointer px-5 py-4 flex items-center gap-2 text-sm font-display-uppercase tracking-widest text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))] rounded-card transition-colors">
              <Plus className="w-4 h-4" />
              Novo template
            </summary>
            <form action={createTemplateAction} className="p-5 space-y-4 border-t border-[hsl(var(--chat-border))]">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Nome (curto · ex: &quot;Saudação manhã&quot;)
                </label>
                <input
                  name="name"
                  required
                  maxLength={80}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Mensagem (texto a enviar)
                </label>
                <textarea
                  name="content"
                  required
                  rows={4}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                    Categoria
                  </label>
                  <input
                    name="category"
                    placeholder="ex: saudacao, agendamento, fechamento..."
                    className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                    Ordem (menor = topo)
                  </label>
                  <input
                    type="number"
                    name="sort_order"
                    defaultValue={0}
                    className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
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

        {active.length === 0 && inactive.length === 0 ? (
          <div className="text-center py-16 text-[hsl(var(--muted-foreground))] text-sm">
            Nenhum template criado ainda · use o formulário acima
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
                <div className="space-y-3 mt-2 opacity-50">
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
