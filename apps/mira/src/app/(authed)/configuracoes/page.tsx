/**
 * /configuracoes · 6 abas: overview | pessoas | channels | logs | automacao | (legacy: professionals).
 *
 * 2026-04-26: tab "pessoas" 2-col (Admins + Profissionais) + tab "automacao"
 * 2-col (Padroes + Rotinas). Antigos /b2b/config/admins, /estudio/padroes,
 * /b2b/config/rotinas e ?tab=professionals redirecionam pra ca.
 *
 * Restrito a owner/admin. Cada tab e Server Component dedicado.
 * Tabs via search param ?tab= (sem JS client).
 */

import { redirect } from 'next/navigation'
import { loadMiraServerContext } from '@/lib/server-context'
import { OverviewTab } from './OverviewTab'
import { PessoasTab } from './PessoasTab'
import { ChannelsTab } from './ChannelsTab'
import { LogsTab } from './LogsTab'
import { AutomacaoTab } from './AutomacaoTab'
import { DocsLegaisTab } from './DocsLegaisTab'

export const dynamic = 'force-dynamic'

const VALID_TABS = [
  'overview',
  'pessoas',
  'channels',
  'logs',
  'automacao',
  'docs-legais',
] as const
type Tab = (typeof VALID_TABS)[number]

interface PageProps {
  searchParams: Promise<{
    tab?: string
    phone?: string
    intent?: string
    success?: string
    page?: string
    days?: string
    from?: string
    to?: string
    audit_action?: string
  }>
}

export default async function ConfigPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { ctx } = await loadMiraServerContext()

  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    redirect('/dashboard')
  }

  // Legacy alias: ?tab=professionals -> tab=pessoas (mantém URLs antigas)
  if (sp.tab === 'professionals') {
    redirect('/configuracoes?tab=pessoas')
  }

  const activeTab: Tab =
    sp.tab && (VALID_TABS as readonly string[]).includes(sp.tab) ? (sp.tab as Tab) : 'overview'

  // Tabs com 2 blocos lado a lado (overview/pessoas/logs/channels/automacao/
  // docs-legais) usam wrap maior · docs-legais precisa de espaco pro preview
  // lado-a-lado dentro do modal.
  const wrapMax =
    activeTab === 'overview' ||
    activeTab === 'pessoas' ||
    activeTab === 'logs' ||
    activeTab === 'channels' ||
    activeTab === 'automacao' ||
    activeTab === 'docs-legais'
      ? 'max-w-[1200px]'
      : 'max-w-[960px]'

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className={`${wrapMax} mx-auto px-6 py-6`}>
        {activeTab === 'overview' && (
          <OverviewTab days={sp.days} from={sp.from} to={sp.to} />
        )}
        {activeTab === 'pessoas' && <PessoasTab />}
        {activeTab === 'channels' && <ChannelsTab />}
        {activeTab === 'logs' && (
          <LogsTab
            phone={sp.phone || ''}
            intent={sp.intent || ''}
            successFilter={sp.success || ''}
            page={Math.max(1, parseInt(sp.page || '1', 10))}
            auditAction={sp.audit_action || ''}
          />
        )}
        {activeTab === 'automacao' && <AutomacaoTab />}
        {activeTab === 'docs-legais' && <DocsLegaisTab />}
      </div>
    </main>
  )
}
