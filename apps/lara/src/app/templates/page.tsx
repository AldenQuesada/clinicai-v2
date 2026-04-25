/**
 * Templates de resposta rápida · Server Component.
 *
 * ADR-012 · TemplateRepository.listAll · separa active/inactive no caller
 * pra preservar UX de "mostrar inativos como collapse".
 * Multi-tenant ADR-028 · clinic_id resolvido via JWT.
 */

import { FileText, Plus } from 'lucide-react'
import { TemplateRow } from './TemplateRow'
import { createTemplateAction } from './actions'
import { loadServerReposContext } from '@/lib/repos'
import type { TemplateDTO } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

// Shape esperado pelo TemplateRow · snake_case (legacy frontend não migrou)
interface TemplateView {
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

function toView(t: TemplateDTO): TemplateView {
  return {
    id: t.id,
    name: t.name,
    message: t.message,
    content: t.content,
    category: t.category,
    trigger_phase: t.triggerPhase,
    active: t.active,
    is_active: t.isActive,
    sort_order: t.sortOrder,
    created_at: t.createdAt,
  }
}

async function loadTemplates(): Promise<{ templates: TemplateView[]; canManage: boolean }> {
  const { ctx, repos } = await loadServerReposContext()
  const dtos = await repos.templates.listAll(ctx.clinic_id)
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
  return { templates: dtos.map(toView), canManage }
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
