'use client'

/**
 * LeadTagsPanel · gerencia funnel/phase/temperature (tags removidas).
 *
 * Lote 2 P0.2 (2026-05-17): UI de tags livres removida · `leads.tags` está
 * pausada (ver `apps/lara/docs/OUT_P0_TAGS.md`). Painel mantido pelo nome
 * histórico e pelos demais controles (funnel/phase/temperature). Rename
 * fica pra refactor futuro quando tags voltarem.
 *
 * Mudancas de funnel/phase/temperature usam actions tipadas (sdr_change_phase
 * pra phase preserva audit trail).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type {
  Funnel,
  LeadDTO,
  LeadPhase,
  LeadTemperature,
} from '@clinicai/repositories'
import {
  setLeadFunnelAction,
  setLeadPhaseAction,
  setLeadTemperatureAction,
} from '../actions'

const FUNNELS: { id: Funnel; label: string }[] = [
  { id: 'olheiras', label: 'Olheiras' },
  { id: 'fullface', label: 'Full Face' },
  { id: 'procedimentos', label: 'Procedimentos' },
]
// Contrato canonico (Fase 1C · 2026-05-11): 4 phases. Reagendado/Compareceu
// derrogados · ChipSelector continua expondo so transicoes "safe" via
// sdr_change_phase. Para paciente/orcamento/perdido usar acoes especificas
// (ver helper text abaixo).
const PHASES_SAFE: { id: LeadPhase; label: string }[] = [
  { id: 'lead', label: 'Lead' },
  { id: 'agendado', label: 'Agendado' },
]
const TEMPS: { id: LeadTemperature; label: string }[] = [
  { id: 'cold', label: 'Frio' },
  { id: 'warm', label: 'Morno' },
  { id: 'hot', label: 'Quente' },
]

export function LeadTagsPanel({
  lead,
  canEdit,
  onToast,
}: {
  lead: LeadDTO
  canEdit: boolean
  onToast: (msg: string, tone?: 'ok' | 'err') => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function handleFunnel(f: Funnel) {
    if (!canEdit || lead.funnel === f) return
    setBusy(true)
    const result = await setLeadFunnelAction(lead.id, f)
    setBusy(false)
    if (!result.ok) {
      onToast(result.error || 'Falha ao mudar funnel', 'err')
      return
    }
    onToast('Funnel atualizado')
    startTransition(() => router.refresh())
  }

  async function handlePhase(p: LeadPhase) {
    if (!canEdit || lead.phase === p) return
    setBusy(true)
    const result = await setLeadPhaseAction(lead.id, p)
    setBusy(false)
    if (!result.ok) {
      onToast(result.error || 'Falha ao mudar fase', 'err')
      return
    }
    onToast('Fase atualizada')
    startTransition(() => router.refresh())
  }

  async function handleTemp(t: LeadTemperature) {
    if (!canEdit || lead.temperature === t) return
    setBusy(true)
    const result = await setLeadTemperatureAction(lead.id, t)
    setBusy(false)
    if (!result.ok) {
      onToast(result.error || 'Falha ao mudar temperatura', 'err')
      return
    }
    onToast('Temperatura atualizada')
    startTransition(() => router.refresh())
  }

  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {/* Tags · seção pausada (Alden 2026-05-05).
          leads.tags column does not exist in production. Toda tag adicionada
          aqui falhava silenciosamente. Pills/filas operacionais governadas
          pela view wa_conversations_operational_view, não por tags. Quando
          decidirmos por arquitetura de tags persistentes (mig + tabela
          conversation_tags ou ressuscitar leads.tags), reabilitar esta
          seção. As funções state (tags/newTag/handle*Tag) ficam intactas
          pra facilitar o restore. */}
      <div className="luxury-card" style={{ padding: 18, gridColumn: '1 / -1' }}>
        <h3
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            color: 'var(--b2b-champagne)',
            margin: '0 0 12px',
          }}
        >
          Tags
        </h3>
        <div style={{ color: 'var(--b2b-text-muted)', fontSize: 11, fontStyle: 'italic' }}>
          Tags livres pausadas até decisão de arquitetura. Pills do inbox são
          governadas pela view operacional do banco.
        </div>
      </div>

      {/* Funnel */}
      <div className="luxury-card" style={{ padding: 18 }}>
        <h3
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            color: 'var(--b2b-champagne)',
            margin: '0 0 12px',
          }}
        >
          Funnel
        </h3>
        <ChipSelector
          options={FUNNELS}
          value={lead.funnel}
          disabled={!canEdit || busy}
          onChange={(v) => handleFunnel(v as Funnel)}
        />
      </div>

      {/* Phase */}
      <div className="luxury-card" style={{ padding: 18 }}>
        <h3
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            color: 'var(--b2b-champagne)',
            margin: '0 0 12px',
          }}
        >
          Fase
        </h3>
        <ChipSelector
          options={PHASES_SAFE}
          value={lead.phase}
          disabled={!canEdit || busy}
          onChange={(v) => handlePhase(v as LeadPhase)}
        />
        <div
          style={{
            fontSize: 10,
            color: 'var(--b2b-text-muted)',
            marginTop: 8,
            fontStyle: 'italic',
          }}
        >
          Para "Perdido" / "Orçamento" / "Paciente" use as ações específicas
          (lead_lost / lead_to_orcamento / lead_to_paciente).
        </div>
      </div>

      {/* Temperature */}
      <div className="luxury-card" style={{ padding: 18 }}>
        <h3
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            color: 'var(--b2b-champagne)',
            margin: '0 0 12px',
          }}
        >
          Temperatura
        </h3>
        <ChipSelector
          options={TEMPS}
          value={lead.temperature}
          disabled={!canEdit || busy}
          onChange={(v) => handleTemp(v as LeadTemperature)}
        />
      </div>
    </div>
  )
}

function ChipSelector({
  options,
  value,
  disabled,
  onChange,
}: {
  options: { id: string; label: string }[]
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            type="button"
            key={o.id}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            style={{
              padding: '5px 12px',
              fontSize: 11,
              borderRadius: 999,
              cursor: disabled ? 'not-allowed' : 'pointer',
              border: '1px solid',
              borderColor: active ? 'var(--b2b-champagne)' : 'var(--b2b-border)',
              background: active ? 'rgba(201,169,110,0.18)' : 'transparent',
              color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-dim)',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
