/**
 * /configuracoes · 4 abas (Overview / Professionals / Channels / Logs).
 *
 * Restrito a owner/admin. Cada tab e Server Component dedicado.
 * Tabs via search param ?tab= (sem JS client).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Settings, BarChart3, Users, Network, Activity } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { OverviewTab } from './OverviewTab'
import { ProfessionalsTab } from './ProfessionalsTab'
import { ChannelsTab } from './ChannelsTab'
import { LogsTab } from './LogsTab'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'professionals', label: 'Profissionais', icon: Users },
  { key: 'channels', label: 'Canais', icon: Network },
  { key: 'logs', label: 'Logs', icon: Activity },
] as const

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

  const activeTab = (sp.tab && TABS.some((t) => t.key === sp.tab) ? sp.tab : 'overview') as
    | 'overview' | 'professionals' | 'channels' | 'logs'

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">Configurações</span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Mira · saúde interna + admins + canais + audit logs
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[hsl(var(--chat-border))] mb-6 flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <Link
                key={t.key}
                href={`/configuracoes?tab=${t.key}`}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest border-b-2 transition-colors ${
                  isActive
                    ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </Link>
            )
          })}
        </div>

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
