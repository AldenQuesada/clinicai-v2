/**
 * PartnershipDetailLayout · server component compartilhado entre:
 *   - /partnerships/[id]/page.tsx          · full page (URL direta · share)
 *   - /partnerships/@modal/(.)[id]/page.tsx · intercepting modal (lista atras)
 *
 * Renderiza header luxury + tab bar + tab content. Recebe partnership ja
 * fetched + props · NAO faz fetch proprio (caller fetcha pra paralelizar
 * com outras necessidades · ex: managers).
 *
 * Pedido Alden 2026-04-26: card abre overlay, nao navega · este componente
 * vive em ambos os contextos sem duplicar logica.
 */

import Link from 'next/link'
import {
  Info,
  Ticket,
  BarChart3,
  FileSignature,
  TrendingUp,
  Activity,
  MessageSquare,
  Users,
  ScrollText,
} from 'lucide-react'
import type { B2BPartnershipDTO } from '@clinicai/repositories'
import { DetailTab } from './DetailTab'
import { VouchersTab } from './VouchersTab'
import { PerformanceTab } from './PerformanceTab'
import { HealthTab } from './HealthTab'
import { CommentsTab } from './CommentsTab'
import { GrowthTab } from './GrowthTab'
import { ContratoTab } from './ContratoTab'
import { DocumentosTab } from './DocumentosTab'

const TABS = [
  { key: 'detail', label: 'Detalhe', icon: Info },
  { key: 'vouchers', label: 'Vouchers', icon: Ticket },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'contrato', label: 'Contrato', icon: FileSignature },
  { key: 'documentos', label: 'Documentos', icon: ScrollText },
  { key: 'crescer', label: 'Crescer', icon: TrendingUp },
  { key: 'comments', label: 'Comentários', icon: MessageSquare },
  { key: 'health', label: 'Health', icon: Activity },
] as const

export type DetailTabKey = (typeof TABS)[number]['key']

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

export interface PartnershipDetailLayoutProps {
  partnership: B2BPartnershipDTO
  activeTab: DetailTabKey
  canManage: boolean
  managers: string[]
  /** Quando true · header e tabs usam URL relativa (modal mantem URL atual ·
   *  cada tab mantem ?tab=X sem navegar pra outra pagina). */
  inModal?: boolean
}

export function PartnershipDetailLayout({
  partnership,
  activeTab,
  canManage,
  managers,
  inModal = false,
}: PartnershipDetailLayoutProps) {
  const tierClass = partnership.tier ? `b2b-pill-tier-${partnership.tier}` : ''
  const id = partnership.id
  const tabHref = (key: string) => `/partnerships/${id}?tab=${key}`

  return (
    <div
      className={inModal ? 'flex flex-col gap-1' : 'max-w-[1080px] mx-auto px-7 py-7 flex flex-col gap-1'}
    >
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
              href={`/partnerships/${id}/editar`}
              className="b2b-btn"
              title="Wizard 3-step com 40+ campos"
            >
              Editar
            </Link>
          ) : null}
          <Link
            href={tabHref('vouchers')}
            className="b2b-btn"
            title="Emitir/gerenciar vouchers da parceria"
          >
            <Ticket className="w-3 h-3 inline mr-1" />
            Vouchers
          </Link>
          <Link
            href={`/partnerships/${id}/dossie`}
            target="_blank"
            rel="noopener"
            className="b2b-btn"
            title="Abre 6 slides imprimíveis"
          >
            Dossiê
          </Link>
          {partnership.isCollective ? (
            <Link
              href={tabHref('crescer')}
              className="b2b-btn"
              title="Registrar palestras, eventos e exposições ao grupo (sec Eventos)"
            >
              <Users className="w-3 h-3 inline mr-1" />
              Alcance grupo
            </Link>
          ) : null}
          <Link
            href={tabHref('crescer')}
            className="b2b-btn b2b-btn-primary"
            title="Pitch Mode + diagnóstico + ações"
          >
            Crescer
          </Link>
        </div>
      </header>

      {/* Tabs sub-internas */}
      <nav className="b2b-tab-bar">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.key
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`b2b-tab-link ${isActive ? 'is-active' : ''}`}
              scroll={false}
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
          managers={managers}
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
      {activeTab === 'documentos' && (
        <DocumentosTab
          partnershipId={partnership.id}
          partnershipName={partnership.name}
          partnershipPhone={partnership.contactPhone || ''}
          canManage={canManage}
        />
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
  )
}

export const VALID_TABS = TABS.map((t) => t.key) as readonly string[]
