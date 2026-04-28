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
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div style={{ marginBottom: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            Painel · Lara
          </p>
          <h1
            className="font-display"
            style={{ fontSize: 36, lineHeight: 1.05, color: 'var(--b2b-ivory)' }}
          >
            Templates de <em>resposta rápida</em>
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--b2b-text-dim)',
              fontStyle: 'italic',
              marginTop: 6,
            }}
          >
            Respostas rápidas pra colar nas conversas · {active.length} ativos
          </p>
        </div>

        {canManage && (
          <details className="luxury-card" style={{ marginBottom: 24 }}>
            <summary
              style={{
                cursor: 'pointer',
                listStyle: 'none',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: 600,
                color: 'var(--b2b-champagne)',
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Novo template
            </summary>
            <form
              action={createTemplateAction}
              style={{ padding: '8px 18px 18px', borderTop: '1px solid var(--b2b-border)' }}
            >
              <div className="b2b-form-sec">Identificação</div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">
                  Nome (curto · ex: &quot;Saudação manhã&quot;) <em>*</em>
                </label>
                <input name="name" required maxLength={80} className="b2b-input" />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Mensagem (texto a enviar) <em>*</em></label>
                <textarea name="content" required rows={4} className="b2b-input" />
              </div>
              <div className="b2b-grid-2">
                <div className="b2b-field">
                  <label className="b2b-field-lbl">Categoria</label>
                  <input
                    name="category"
                    placeholder="ex: saudacao, agendamento, fechamento..."
                    className="b2b-input"
                  />
                </div>
                <div className="b2b-field">
                  <label className="b2b-field-lbl">Ordem (menor = topo)</label>
                  <input type="number" name="sort_order" defaultValue={0} className="b2b-input" />
                </div>
              </div>
              <div className="b2b-form-actions">
                <button type="submit" className="b2b-btn b2b-btn-primary">
                  Criar template
                </button>
              </div>
            </form>
          </details>
        )}

        {active.length === 0 && inactive.length === 0 ? (
          <div className="b2b-empty">Nenhum template criado ainda · use o formulário acima</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map((t) => (
              <TemplateRow key={t.id} template={t} canManage={canManage} />
            ))}
            {inactive.length > 0 && (
              <details style={{ marginTop: 24 }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: 10,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: 'var(--b2b-text-muted)',
                    padding: '10px 0',
                  }}
                >
                  Inativos ({inactive.length})
                </summary>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginTop: 8,
                    opacity: 0.5,
                  }}
                >
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
