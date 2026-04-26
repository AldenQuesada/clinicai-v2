/**
 * /partnerships/[id]/editar · wizard 3-step pre-preenchido pra edicao.
 *
 * Carrega o row cru + combos · passa pro WizardClient em mode='edit'.
 * Submit via updatePartnershipAction (mantem id e slug original).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { WizardClient } from '../../../estudio/cadastrar/WizardClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditarPartnershipPage({ params }: PageProps) {
  const { id } = await params
  const { repos } = await loadMiraServerContext()

  const [partnership, combosRaw, tierConfigsRaw] = await Promise.all([
    repos.b2bPartnerships.getRawById(id),
    repos.b2bVoucherCombos.list().catch(() => []),
    repos.b2bTierConfigs.list().catch(() => []),
  ])

  if (!partnership) notFound()

  const combos = combosRaw.map((c) => ({
    label: c.label,
    isActive: c.isActive,
    isDefault: c.isDefault,
  }))
  const tierConfigs = tierConfigsRaw.map((t) => ({
    tier: t.tier,
    label: t.label,
    description: t.description,
    colorHex: t.colorHex,
    defaultMonthlyCapBrl: t.defaultMonthlyCapBrl,
    defaultVoucherCombo: t.defaultVoucherCombo,
    defaultVoucherValidityDays: t.defaultVoucherValidityDays,
    defaultVoucherMonthlyCap: t.defaultVoucherMonthlyCap,
  }))

  const name = String(partnership.name ?? '—')

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="max-w-[840px] mx-auto px-6 md:px-8 py-8 md:py-10 flex flex-col gap-6">
        <div className="flex items-start gap-4 pb-5 border-b border-[var(--b2b-border)]">
          <Link
            href={`/partnerships/${id}`}
            className="mt-1.5 p-1.5 rounded text-[var(--b2b-text-muted)] hover:text-[var(--b2b-ivory)] hover:bg-[rgba(201,169,110,0.08)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <span className="eyebrow">Parceria · Edição</span>
            <h1 className="font-display text-[28px] md:text-[32px] text-[var(--b2b-ivory)] mt-1 leading-[1.15] truncate">
              {name}
            </h1>
            <p className="text-[13px] text-[var(--b2b-text-dim)] mt-1.5 italic">
              3 passos · Identidade · Operação · Detalhes — slug e histórico <span className="not-italic text-[var(--b2b-champagne)]">preservados</span>.
            </p>
          </div>
        </div>

        <WizardClient mode="edit" combos={combos} tierConfigs={tierConfigs} partnership={partnership} />
      </div>
    </main>
  )
}
