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

  return <GrowthClient data={data} partnership={partnership} />
}
