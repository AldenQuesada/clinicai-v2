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

  const [partnership, combosRaw] = await Promise.all([
    repos.b2bPartnerships.getRawById(id),
    repos.b2bVoucherCombos.list().catch(() => []),
  ])

  if (!partnership) notFound()

  const combos = combosRaw.map((c) => ({
    label: c.label,
    isActive: c.isActive,
    isDefault: c.isDefault,
  }))

  const name = String(partnership.name ?? '—')

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[860px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href={`/partnerships/${id}`}
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div>
              <span className="text-[10px] uppercase tracking-[2px] font-bold text-[#C9A96E]">
                Parceria · Edição
              </span>
              <h1 className="font-display text-xl text-[#F5F0E8] mt-0.5">{name}</h1>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                3 passos · Identidade · Operação · Detalhes. Slug e histórico preservados.
              </p>
            </div>
          </div>
        </div>

        <WizardClient mode="edit" combos={combos} partnership={partnership} />
      </div>
    </main>
  )
}
