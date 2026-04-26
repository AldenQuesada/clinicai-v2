/**
 * /configuracoes · 4 abas (Overview / Professionals / Channels / Logs).
 *
 * Restrito a owner/admin. Cada tab e Server Component dedicado.
 * Tabs via search param ?tab= (sem JS client).
 *
 * Visual MIRROR mira-config antigo · header denso, tabs com border-b 2px gold
 * no active, max-w-[960px], sem icon-box luxury, Inter only.
 */

import { redirect } from 'next/navigation'
import { loadMiraServerContext } from '@/lib/server-context'
import { OverviewTab } from './OverviewTab'
import { ProfessionalsTab } from './ProfessionalsTab'
import { ChannelsTab } from './ChannelsTab'
import { LogsTab } from './LogsTab'

export const dynamic = 'force-dynamic'

// Whitelist de tabs validos · controle vem do sub-menu Configuracoes na
// AppNav (sem tabs duplicados na pagina · zero header repetido).
const VALID_TABS = ['overview', 'professionals', 'channels', 'logs'] as const
type Tab = (typeof VALID_TABS)[number]

interface PageProps {
  searchParams: Promise<{
    tab?: string
    phone?: string
    intent?: string
    success?: string
    page?: string
  }>
}

export default async function ConfigPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { ctx } = await loadMiraServerContext()

  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    redirect('/dashboard')
  }

  const activeTab: Tab =
    sp.tab && (VALID_TABS as readonly string[]).includes(sp.tab) ? (sp.tab as Tab) : 'overview'

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'professionals' && <ProfessionalsTab />}
        {activeTab === 'channels' && <ChannelsTab />}
        {activeTab === 'logs' && (
          <LogsTab
            phone={sp.phone || ''}
            intent={sp.intent || ''}
            successFilter={sp.success || ''}
            page={Math.max(1, parseInt(sp.page || '1', 10))}
          />
        )}
      </div>
    </main>
  )
}
