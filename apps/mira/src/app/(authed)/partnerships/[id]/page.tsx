/**
 * Partnership detail · 4 abas (Detalhe / Vouchers / Performance / Health).
 *
 * Tabs renderizadas como sections empilhadas (nao SPA · server-side rendered).
 * Tab "ativa" highlightada via search param `?tab=`. Funciona sem JS no client.
 *
 * ADR-012 · acesso via repositories. Permissions: owner/admin podem editar
 * dados basicos + aprovar/pausar.
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
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/partnerships"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] mb-4"
        >
          <ArrowLeft className="w-3 h-3" />
          Voltar
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-light">
            <span className="text-[hsl(var(--foreground))]">{partnership.name}</span>
          </h1>
          <p className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] mt-1">
            {partnership.pillar} · {partnership.type} · slug: {partnership.slug}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-[hsl(var(--chat-border))] mb-6 flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <Link
                key={t.key}
                href={`/partnerships/${id}?tab=${t.key}`}
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
