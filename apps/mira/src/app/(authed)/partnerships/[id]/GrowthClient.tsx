'use client'

/**
 * GrowthClient · orquestra Diagnostico + Acao + botao Pitch Mode.
 * Mantem state da PitchMode (open/closed) sem precisar Server Action.
 */

import { useState } from 'react'
import { Sparkles, Presentation } from 'lucide-react'
import type { GrowthPanel, B2BPartnershipDTO } from '@clinicai/repositories'
import { DiagnosticSection } from './DiagnosticSection'
import { ActionSection } from './ActionSection'
import { PitchMode } from './PitchMode'

export function GrowthClient({
  data,
  partnership,
}: {
  data: GrowthPanel
  partnership: B2BPartnershipDTO
}) {
  const [pitchOpen, setPitchOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* Banner topo · CTA Pitch Mode (efeito wow principal) */}
      <div
        className="rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background:
            'linear-gradient(135deg, rgba(201,169,110,0.12) 0%, rgba(201,169,110,0.04) 100%)',
          border: '1px solid rgba(201,169,110,0.25)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{
              background:
                'radial-gradient(circle, rgba(201,169,110,0.3) 0%, rgba(201,169,110,0.05) 100%)',
            }}
          >
            <Sparkles className="w-6 h-6 text-[#C9A96E]" />
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-[2px] text-[#C9A96E] font-bold"
              style={{ letterSpacing: '2px' }}
            >
              Pitch Mode
            </div>
            <div
              className="text-xl text-[#F5F0E8] mt-0.5"
              style={{
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontWeight: 500,
              }}
            >
              Apresentar pra {partnership.name.split(' ')[0]} em reunião
            </div>
            <div className="text-[11px] text-[#9CA3AF] mt-1">
              Modo apresentação fullscreen · use ESC pra sair · setas ←/→ navegar
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPitchOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-[1.5px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors shrink-0"
        >
          <Presentation className="w-4 h-4" />
          Iniciar Pitch
        </button>
      </div>

      {/* Seção 1 · Diagnóstico */}
      <DiagnosticSection data={data} />

      {/* Seção 2 · Ação */}
      <ActionSection data={data} partnership={partnership} />

      {/* Pitch Mode (fullscreen modal) */}
      {pitchOpen ? (
        <PitchMode
          partnership={partnership}
          data={data}
          onClose={() => setPitchOpen(false)}
        />
      ) : null}
    </div>
  )
}
