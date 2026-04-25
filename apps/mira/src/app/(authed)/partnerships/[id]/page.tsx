/**
 * Partnership detail · 4 abas (Detalhe / Vouchers / Performance / Health).
 *
 * Tabs renderizadas como sections empilhadas (server-side rendered, sem JS).
 * Tab "ativa" highlightada via search param `?tab=`.
 *
 * Visual mirror mira-config antigo · tabs com border-b 2px gold no active,
 * max-w-[960px] estreito, header denso sem icon-box luxury.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Info, Ticket, BarChart3, Activity } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { DetailTab } from './DetailTab'
import { VouchersTab } from './VouchersTab'
import { PerformanceTab } from './PerformanceTab'
import { HealthTab } from './HealthTab'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS = [
  { key: 'detail', label: 'Detalhe', icon: Info },
  { key: 'vouchers', label: 'Vouchers', icon: Ticket },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'health', label: 'Health', icon: Activity },
] as const

export default async function PartnershipDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const { ctx, repos } = await loadMiraServerContext()

  const partnership = await repos.b2bPartnerships.getById(id)
  if (!partnership || partnership.clinicId !== ctx.clinic_id) {
    notFound()
  }

  const activeTab = (sp.tab && TABS.some((t) => t.key === sp.tab) ? sp.tab : 'detail') as
    | 'detail' | 'vouchers' | 'performance' | 'health'

  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6 flex flex-col gap-3">
        <Link
          href="/partnerships"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#C9A96E] transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Voltar
        </Link>

        {/* Header denso */}
        <div className="pb-2 border-b border-white/10">
          <span className="eyebrow text-[#C9A96E]">Semana · Detalhe da parceria</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
            {partnership.name}
          </h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1 font-mono">
            {partnership.pillar} · {partnership.type} · slug: {partnership.slug}
          </p>
        </div>

        {/* Tabs · border-b 2px gold mirror b2b-config */}
        <div className="flex gap-1 border-b border-white/10 -mt-1">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <Link
                key={t.key}
                href={`/partnerships/${id}?tab=${t.key}`}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-[1px] border-b-2 transition-colors ${
                  isActive
                    ? 'text-[#C9A96E] border-[#C9A96E]'
                    : 'text-[#9CA3AF] border-transparent hover:text-[#F5F0E8]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </Link>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'detail' && (
          <DetailTab partnership={partnership} canManage={canManage} />
        )}
        {activeTab === 'vouchers' && (
          <VouchersTab partnershipId={partnership.id} />
        )}
        {activeTab === 'performance' && (
          <PerformanceTab partnership={partnership} />
        )}
        {activeTab === 'health' && (
          <HealthTab partnershipId={partnership.id} />
        )}
      </div>
    </main>
  )
}
