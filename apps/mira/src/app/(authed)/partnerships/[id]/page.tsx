/**
 * Partnership detail · 6 abas (Detalhe / Vouchers / Performance / Crescer / Comentarios / Health).
 *
 * Header luxury espelha 1:1 b2b-detail.ui.js legacy:
 *   - Eyebrow `pillar · category` em champagne
 *   - Nome em Cormorant Garamond 32px
 *   - Pills: Tier N (gold-tinted), health (semantico), status (data-status)
 *   - Sub linha mono · slug · type
 *   - Tabs sub-internas com border-bottom champagne (b2b-tab-bar)
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Info, Ticket, BarChart3, TrendingUp, Activity, MessageSquare, FileSignature } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { DetailTab } from './DetailTab'
import { VouchersTab } from './VouchersTab'
import { PerformanceTab } from './PerformanceTab'
import { HealthTab } from './HealthTab'
import { CommentsTab } from './CommentsTab'
import { GrowthTab } from './GrowthTab'
import { ContratoTab } from './ContratoTab'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS = [
  { key: 'detail', label: 'Detalhe', icon: Info },
  { key: 'vouchers', label: 'Vouchers', icon: Ticket },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'contrato', label: 'Contrato', icon: FileSignature },
  { key: 'crescer', label: 'Crescer', icon: TrendingUp },
  { key: 'comments', label: 'Comentários', icon: MessageSquare },
  { key: 'health', label: 'Health', icon: Activity },
] as const

type TabKey = (typeof TABS)[number]['key']

const STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  dna_check: 'Avaliar DNA',
  contract: 'Em contrato',
  active: 'Ativa',
  review: 'Em revisão',
  paused: 'Pausada',
  closed: 'Encerrada',
}

const TYPE_LABELS: Record<string, string> = {
  transactional: 'Transacional',
  occasion: 'Ocasião',
  institutional: 'Institucional',
}

export default async function PartnershipDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const { ctx, repos } = await loadMiraServerContext()

  const partnership = await repos.b2bPartnerships.getById(id)
  if (!partnership || partnership.clinicId !== ctx.clinic_id) {
    notFound()
  }

  const activeTab: TabKey =
    sp.tab && TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : 'detail'

  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

  // Carrega managers em paralelo se a tab Detalhe esta ativa (passa pra AccountManager)
  const managers =
    activeTab === 'detail'
      ? await repos.b2bCollab.teamManagers().catch(() => [])
      : []

  const tierClass = partnership.tier ? `b2b-pill-tier-${partnership.tier}` : ''

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="max-w-[1080px] mx-auto px-7 py-7 flex flex-col gap-1">
        <Link href="/partnerships" className="b2b-back-link mb-3">
          <ArrowLeft className="w-3 h-3" />
          Voltar
        </Link>

        {/* Header luxury · espelho b2b-detail-hdr legado */}
        <header className="b2b-detail-hdr">
          <div className="b2b-detail-hdr-main">
            <div className="eyebrow">
              {partnership.pillar}
              {partnership.category ? ` · ${partnership.category}` : ''}
            </div>
            <h1 className="b2b-detail-name">{partnership.name}</h1>
            <div className="b2b-detail-sub">
              {TYPE_LABELS[partnership.type] || partnership.type} · slug {partnership.slug}
            </div>
            <div className="b2b-detail-meta">
              {partnership.tier ? (
                <span className={`b2b-pill ${tierClass}`}>Tier {partnership.tier}</span>
              ) : null}
              <span
                className="b2b-pill b2b-pill-health"
                data-health={partnership.healthColor}
              >
                Saúde · {partnership.healthColor}
              </span>
              <span
                className="b2b-pill b2b-pill-status"
                data-status={partnership.status}
              >
                {STATUS_LABELS[partnership.status] || partnership.status}
              </span>
              <span className="b2b-pill b2b-pill-type">
                {TYPE_LABELS[partnership.type] || partnership.type}
              </span>
              {partnership.dnaScore != null ? (
                <span className="b2b-pill b2b-pill-tier">
                  DNA {partnership.dnaScore.toFixed(1)}/10
                </span>
              ) : null}
              {partnership.accountManager ? (
                <span className="b2b-pill" title="Account manager">
                  @{partnership.accountManager}
                </span>
              ) : null}
            </div>
          </div>
          <div className="b2b-detail-actions">
            {canManage ? (
              <Link
                href={`/partnerships/${partnership.id}/editar`}
                className="b2b-btn"
                title="Wizard 3-step com 40+ campos"
              >
                Editar
              </Link>
            ) : null}
            <Link
              href={`/partnerships/${partnership.id}/dossie`}
              target="_blank"
              rel="noopener"
              className="b2b-btn"
              title="Abre 6 slides imprimíveis"
            >
              Dossiê
            </Link>
            <Link
              href={`/partnerships/${partnership.id}?tab=crescer`}
              className="b2b-btn b2b-btn-primary"
              title="Pitch Mode + diagnóstico + ações"
            >
              Crescer
            </Link>
          </div>
        </header>

        {/* Tabs sub-internas (b2b-tab-bar mirror b2b-app-tabs legado) */}
        <nav className="b2b-tab-bar">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <Link
                key={t.key}
                href={`/partnerships/${id}?tab=${t.key}`}
                className={`b2b-tab-link ${isActive ? 'is-active' : ''}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </Link>
            )
          })}
        </nav>

        {/* Tab content */}
        {activeTab === 'detail' && (
          <DetailTab
            partnership={partnership}
            canManage={canManage}
            managers={managers.map((m) => m.name || m.email || 'sem-nome').filter(Boolean)}
          />
        )}
        {activeTab === 'vouchers' && (
          <VouchersTab
            partnershipId={partnership.id}
            partnershipName={partnership.name}
            partnershipPhone={partnership.contactPhone || ''}
            canManage={canManage}
          />
        )}
        {activeTab === 'performance' && (
          <PerformanceTab partnership={partnership} />
        )}
        {activeTab === 'contrato' && (
          <ContratoTab partnershipId={partnership.id} canManage={canManage} />
        )}
        {activeTab === 'crescer' && (
          <GrowthTab partnership={partnership} />
        )}
        {activeTab === 'comments' && (
          <CommentsTab partnershipId={partnership.id} canManage={canManage} />
        )}
        {activeTab === 'health' && (
          <HealthTab partnershipId={partnership.id} />
        )}
      </div>
    </main>
  )
}
