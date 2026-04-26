/**
 * ProgramHeader · row 0 do AppHeader · MIRROR 1:1 do legacy b2b-shell.ui.js
 *
 * Estrutura legacy (cravada em b2b-shell.ui.js _renderHeader):
 *   <header class="b2b-header">
 *     <div class="b2b-header-top">
 *       <div>
 *         <div class="b2b-eyebrow">Círculo Mirian de Paula</div>
 *         <h1 class="b2b-title">Programa de <em>parcerias B2B</em></h1>
 *       </div>
 *       <div class="b2b-header-ctrl">
 *         {ScoutToggle} {BudgetBadge}
 *       </div>
 *     </div>
 *   </header>
 *
 * Server Component · fetcha scout consumption defensivo. Toggle e visual
 * (statico) por enquanto · interactividade vem com pedido especifico.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { ConsumptionDTO } from '@clinicai/repositories'

export async function ProgramHeader() {
  let consumption: ConsumptionDTO | null = null
  try {
    const { repos } = await loadMiraServerContext()
    consumption = await repos.b2bScout.consumedCurrentMonth().catch(() => null)
  } catch {
    consumption = null
  }

  const enabled = consumption?.scout_enabled ?? true
  const totalBrl = Number(consumption?.total_brl ?? 0)
  const capBrl = Number(consumption?.budget_cap_brl ?? 100)
  const pct = capBrl > 0 ? Math.min(100, (totalBrl / capBrl) * 100) : 0

  return (
    <header className="px-5 py-4 bg-[#0F0D0A] border-b border-[#C9A96E]/20">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        {/* Esq · eyebrow + title */}
        <div className="flex flex-col gap-1.5">
          <div
            className="text-[10px] uppercase font-semibold text-[#C9A96E]"
            style={{ letterSpacing: '4px' }}
          >
            Círculo Mirian de Paula
          </div>
          <h1
            className="font-display text-[32px] text-[#F5F0E8] leading-none"
            style={{ fontWeight: 300 }}
          >
            Programa de <em className="text-[#C9A96E]" style={{ fontStyle: 'italic' }}>parcerias B2B</em>
          </h1>
        </div>

        {/* Dir · Scout toggle + Budget badge */}
        <div className="flex items-center gap-3">
          {/* Scout toggle (visual · static por enquanto) */}
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-lg border border-[#C9A96E]/25 bg-white/[0.02]">
            <div className="flex flex-col leading-tight">
              <span
                className="text-[10px] uppercase font-bold text-[#9CA3AF]"
                style={{ letterSpacing: '2px' }}
              >
                Scout
              </span>
              <span className={`text-[11px] ${enabled ? 'text-[#C9A96E]' : 'text-[#7A7165]'}`}>
                {enabled ? 'Ativo' : 'Desligado'}
              </span>
            </div>
            <div
              className={`relative w-10 h-5 rounded-full transition-colors ${
                enabled ? 'bg-[#C9A96E]' : 'bg-white/10'
              }`}
              aria-pressed={enabled}
              role="img"
              aria-label={enabled ? 'Scout ativo' : 'Scout desligado'}
            >
              <div
                className={`absolute top-[2px] w-4 h-4 rounded-full bg-[#0F0D0A] transition-all ${
                  enabled ? 'left-[22px]' : 'left-[2px]'
                }`}
              />
            </div>
          </div>

          {/* Budget badge */}
          <div className="flex flex-col gap-1 px-3.5 py-2 rounded-lg border border-[#C9A96E]/25 bg-white/[0.02] min-w-[170px]">
            <div className="flex items-center justify-between">
              <span
                className="text-[10px] uppercase font-bold text-[#9CA3AF]"
                style={{ letterSpacing: '2px' }}
              >
                Budget
              </span>
              <span className="text-[11px] font-mono text-[#F5F0E8]">
                R$ {totalBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/{capBrl.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#C9A96E',
                  transition: 'width 400ms ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
