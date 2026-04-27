/**
 * GrowthTab · A2 painel "Crescer" do detail da parceria.
 *
 * Foco em CONVERSAO + efeito WOW. 3 secoes narrativas:
 *   🎯 Diagnostico (ImpactScore + Trend + Cost + Conversion lifetime)
 *   💡 Acao        (WowActions: Playbook + Dossie + Painel parceira)
 *   🚀 Pitch Mode  (botao no topo · abre modal fullscreen pra apresentar)
 *
 * Server Component carrega growth panel em 1 RPC (mig 800-17).
 * Client subcomponents fazem interacao (Pitch Mode, WowActions click).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BPartnershipDTO } from '@clinicai/repositories'
import { GrowthClient } from './GrowthClient'
import { TargetsSection } from './sections/TargetsSection'
import { EventsSection } from './sections/EventsSection'
import { ContentSection } from './sections/ContentSection'

export async function GrowthTab({ partnership }: { partnership: B2BPartnershipDTO }) {
  const { repos } = await loadMiraServerContext()
  const data = await repos.b2bGrowth.panel(partnership.id).catch(() => null)

  if (!data || !data.ok) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
        Sem dados de crescimento ainda.{' '}
        {data?.error ?? 'Aplique a migration 800-17 ou aguarde a primeira atividade.'}
      </div>
    )
  }

  // Top conversoes pro Pitch Mode · vouchers redeemed (proxy de "convertida")
  // pegamos os mais recentes pra ter nomes vivos · max 8 nomes nao-nulos.
  // Nao quebra a tela se falhar · so omite o slide.
  const recentVouchers = await repos.b2bVouchers
    .listByPartnership(partnership.id, 30)
    .catch(() => [])
  const topConversions = recentVouchers
    .filter((v) => v.status === 'redeemed' && v.recipientName)
    .map((v) => v.recipientName as string)
    .slice(0, 8)

  return (
    <div className="flex flex-col gap-6">
      <GrowthClient
        data={data}
        partnership={partnership}
        topConversions={topConversions}
      />
      {/* Sec 7 · Metas operacionais */}
      <TargetsSection partnershipId={partnership.id} />
      {/* Sec 8 · Eventos / exposicoes */}
      <EventsSection partnershipId={partnership.id} />
      {/* Sec 9 · Playbook de conteudo */}
      <ContentSection partnershipId={partnership.id} />
    </div>
  )
}
