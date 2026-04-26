'use client'

/**
 * GrowthClient · orquestra Diagnostico + Acao + botao Pitch Mode.
 * Mantem state da PitchMode (open/closed) sem precisar Server Action.
 *
 * Visual luxury · b2b-pitch-banner com gradient gold + Cormorant 22px.
 */

import { useState } from 'react'
import { Sparkles, Presentation } from 'lucide-react'
import type { GrowthPanel, B2BPartnershipDTO } from '@clinicai/repositories'
import { DiagnosticSection } from './DiagnosticSection'
import { ActionSection } from './ActionSection'
import { PitchMode } from './PitchMode'
import { WowActionsSection } from './sections/WowActionsSection'

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
      <div className="b2b-pitch-banner">
        <div className="b2b-pitch-banner-left">
          <div className="b2b-pitch-banner-icon">
            <Sparkles className="w-6 h-6 text-[var(--b2b-champagne)]" />
          </div>
          <div>
            <div className="b2b-pitch-banner-eyebrow">Pitch Mode</div>
            <div className="b2b-pitch-banner-title">
              Apresentar pra {partnership.name.split(' ')[0]} em reunião
            </div>
            <div className="b2b-pitch-banner-sub">
              Modo apresentação fullscreen · use ESC pra sair · setas ←/→ navegar
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPitchOpen(true)}
          className="b2b-btn b2b-btn-primary inline-flex items-center gap-2"
          style={{ padding: '11px 22px', letterSpacing: 1.5 }}
        >
          <Presentation className="w-4 h-4" />
          Iniciar Pitch
        </button>
      </div>

      {/* Seção 1 · Diagnóstico */}
      <DiagnosticSection data={data} />

      {/* Sec 12 · Acoes premium (Dossie, Painel, IA, etc) */}
      <WowActionsSection partnership={partnership} />

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
