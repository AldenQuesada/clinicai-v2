/**
 * ContentSection · sec 9 do modal admin legacy.
 *
 * Mirror de `_renderContent(content)` em b2b-detail.ui.js (linha 300).
 * Posts/stories/reels planejados pelo playbook ou IA.
 *
 * Server Component · 1 RPC b2b_partnership_content_list.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { EmptyState } from '@clinicai/ui'

const KIND_LABELS: Record<string, string> = {
  post: 'Post',
  story: 'Story',
  reels: 'Reels',
  email: 'E-mail',
  wa_broadcast: 'WhatsApp broadcast',
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planejado',
  published: 'Publicado',
  skipped: 'Pulado',
}

export async function ContentSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const items = await repos.b2bPartnerships.listContent(partnershipId)

  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="b2b-sec-title">Playbook de conteudo</h3>
        <EmptyState
          variant="generic"
          title="Sem conteúdo planejado"
          message='Aplique o playbook ou use "IA conteúdo" pra gerar carrosséis e ganchos automaticamente.'
        />
      </section>
    )
  }

  // Agrupa por kind
  const groups: Record<string, typeof items> = {}
  for (const c of items) {
    if (!groups[c.kind]) groups[c.kind] = []
    groups[c.kind].push(c)
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="b2b-sec-title">Playbook de conteudo</h3>
      {Object.entries(groups).map(([kind, list]) => (
        <div key={kind} className="b2b-card">
          <div
            className="text-[10px] uppercase tracking-[1.4px] font-bold mb-2"
            style={{ color: 'var(--b2b-champagne)' }}
          >
            {KIND_LABELS[kind] || kind} <span style={{ opacity: 0.6 }}>· {list.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {list.map((c) => (
              <div
                key={c.id}
                className="flex items-baseline justify-between gap-2 text-[12.5px]"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  paddingBottom: 6,
                }}
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span style={{ color: 'var(--b2b-ivory)' }}>{c.title}</span>
                  {c.schedule ? (
                    <span className="text-[10px] font-mono text-[var(--b2b-text-muted)]">
                      {c.schedule}
                    </span>
                  ) : null}
                </div>
                <span
                  className="text-[10px] uppercase tracking-[1.2px] font-semibold"
                  style={{
                    color:
                      c.status === 'published'
                        ? '#10B981'
                        : c.status === 'skipped'
                        ? '#9CA3AF'
                        : 'var(--b2b-champagne)',
                  }}
                  title={
                    c.status === 'published'
                      ? 'Publicado · conteúdo já foi ao ar.'
                      : c.status === 'skipped'
                      ? 'Pulado · decidiu não publicar.'
                      : 'Planejado · ainda não publicou.'
                  }
                >
                  {STATUS_LABELS[c.status] || c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
