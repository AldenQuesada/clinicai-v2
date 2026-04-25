/**
 * /configuracoes · 4 abas (Overview / Professionals / Channels / Logs).
 *
 * Restrito a owner/admin. Cada tab e Server Component dedicado.
 * Tabs via search param ?tab= (sem JS client).
 *
 * Visual MIRROR mira-config antigo · header denso, tabs com border-b 2px gold
 * no active, max-w-[960px], sem icon-box luxury, Inter only.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, Users, Network, Activity } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { OverviewTab } from './OverviewTab'
import { ProfessionalsTab } from './ProfessionalsTab'
import { ChannelsTab } from './ChannelsTab'
import { LogsTab } from './LogsTab'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'overview', label: 'Visão geral', icon: BarChart3 },
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
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header denso */}
        <div className="flex items-center justify-between pb-2 border-b border-white/8">
          <div>
            <span className="eyebrow text-[#C9A96E]">Estúdio · Configurações</span>
            <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Configurações</h1>
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              Mira admin · saúde interna · profissionais · canais · audit logs
            </p>
          </div>
        </div>

        {/* Tabs · border-b 2px gold mirror b2b-config tab pattern */}
        <div className="flex gap-1 border-b border-white/8 -mt-1">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <Link
                key={t.key}
                href={`/configuracoes?tab=${t.key}`}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-[1px] border-b-2 transition-colors ${
                  isActive
                    ? 'text-[#C9A96E] border-[#C9A96E]'
                    : 'text-[#9CA3AF] border-transparent hover:text-[#F5F5F5]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
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
