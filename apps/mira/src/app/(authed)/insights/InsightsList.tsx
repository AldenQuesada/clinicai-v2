'use client'

/**
 * InsightsList · client component com filtros por severity/kind.
 *
 * Filtros pillows · multi-select com toggle. Lista ordenada por score DESC
 * ja vinda do server. Cards clicaveis -> action_url.
 * Botao "Silenciar 7d" em cada card chama dismissInsightAction (mig 800-21).
 * Optimistic UI: card some imediatamente; se action falhar restaura.
 */

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertOctagon, AlertTriangle, Sparkles, Info, ArrowRight, BellOff,
} from 'lucide-react'
import type { Insight, InsightSeverity, InsightKind } from '@clinicai/repositories'
import { dismissInsightAction } from '../dashboard/actions'

const SEVERITY_LABELS: Record<InsightSeverity, string> = {
  critical: 'Crítico',
  warning: 'Warning',
  success: 'Oportunidade',
  info: 'Info',
}

const SEVERITY_COLORS: Record<InsightSeverity, { border: string; bg: string; text: string; icon: typeof AlertTriangle }> = {
  critical: { border: 'border-[#EF4444]/30', bg: 'bg-[#EF4444]/8', text: 'text-[#FCA5A5]', icon: AlertOctagon },
  warning:  { border: 'border-[#F59E0B]/30', bg: 'bg-[#F59E0B]/8', text: 'text-[#FCD34D]', icon: AlertTriangle },
  success:  { border: 'border-[#10B981]/30', bg: 'bg-[#10B981]/8', text: 'text-[#6EE7B7]', icon: Sparkles },
  info:     { border: 'border-[#C9A96E]/30', bg: 'bg-[#C9A96E]/8', text: 'text-[#D4B785]', icon: Info },
}

const KIND_LABELS: Record<InsightKind, string> = {
  over_cap: 'Acima do teto',
  health_red: 'Saúde vermelha',
  health_worsening: 'Saúde piorando',
  low_conversion: 'Conversão baixa',
  no_activity_60d: 'Sem atividade 60d',
  nps_excellent: 'NPS excelente',
  high_impact: 'Alto impacto',
}

const SEVERITY_ORDER: InsightSeverity[] = ['critical', 'warning', 'success', 'info']

function dismissedKey(kind: string, partnershipId: string): string {
  return `${kind}:${partnershipId}`
}

export function InsightsList({ insights }: { insights: Insight[] }) {
  const [severities, setSeverities] = useState<Set<InsightSeverity>>(new Set(SEVERITY_ORDER))
  const [kinds, setKinds] = useState<Set<InsightKind>>(new Set())
  const [dismissedSet, setDismissedSet] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  const allKinds = useMemo(() => {
    const s = new Set<InsightKind>()
    insights.forEach((i) => s.add(i.kind))
    return Array.from(s)
  }, [insights])

  function toggleSeverity(s: InsightSeverity) {
    const next = new Set(severities)
    if (next.has(s)) next.delete(s); else next.add(s)
    setSeverities(next)
  }

  function toggleKind(k: InsightKind) {
    const next = new Set(kinds)
    if (next.has(k)) next.delete(k); else next.add(k)
    setKinds(next)
  }

  function handleDismiss(ins: Insight) {
    const key = dismissedKey(ins.kind, ins.partnership_id)
    // Optimistic: marca como dismissed local imediatamente
    setDismissedSet((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    startTransition(async () => {
      const r = await dismissInsightAction({
        kind: ins.kind,
        partnership_id: ins.partnership_id,
        ttl_days: 7,
      })
      if (!r.ok) {
        // Rollback
        setDismissedSet((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
      // Server revalidatePath cuida de reload subsequente · lista chega sem este insight
    })
  }

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      if (dismissedSet.has(dismissedKey(i.kind, i.partnership_id))) return false
      if (!severities.has(i.severity)) return false
      if (kinds.size > 0 && !kinds.has(i.kind)) return false
      return true
    })
  }, [insights, severities, kinds, dismissedSet])

  if (insights.length === 0) {
    return (
      <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-8 text-center">
        <Sparkles className="w-6 h-6 mx-auto text-[#10B981] mb-2" />
        <div className="text-[14px] text-[#10B981] font-bold">Tudo em ordem.</div>
        <div className="text-[11px] text-[#9CA3AF] mt-1">
          Nenhum insight ativo agora. Mira monitora cap, saúde, conversão, NPS e atividade cross-parcerias.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filtros */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">Severidade</span>
          {SEVERITY_ORDER.map((s) => {
            const active = severities.has(s)
            const sty = SEVERITY_COLORS[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                className={`px-2.5 py-0.5 rounded-full border text-[11px] transition-colors ${
                  active ? `${sty.border} ${sty.bg} ${sty.text} font-bold` : 'border-white/10 text-[#6B7280] hover:text-[#9CA3AF]'
                }`}
              >
                {SEVERITY_LABELS[s]}
              </button>
            )
          })}
        </div>
        {allKinds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1.5 border-t border-white/5">
            <span className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">Tipo</span>
            {allKinds.map((k) => {
              const active = kinds.has(k)
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  className={`px-2.5 py-0.5 rounded-full border text-[11px] transition-colors ${
                    active ? 'border-[#C9A96E] bg-[#C9A96E]/15 text-[#C9A96E] font-bold' : 'border-white/10 text-[#6B7280] hover:text-[#9CA3AF]'
                  }`}
                >
                  {KIND_LABELS[k] || k}
                </button>
              )
            })}
            {kinds.size > 0 && (
              <button type="button" onClick={() => setKinds(new Set())}
                className="text-[10px] text-[#9CA3AF] hover:text-[#F5F0E8] underline">
                limpar tipos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-6 text-[12px] text-[#9CA3AF]">
          Nenhum insight bate com os filtros atuais.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filtered.map((ins, i) => {
            const sty = SEVERITY_COLORS[ins.severity]
            const Icon = sty.icon
            return (
              <div
                key={`${ins.kind}-${ins.partnership_id}-${i}`}
                className={`group rounded-lg border ${sty.border} ${sty.bg} px-3.5 py-3 hover:bg-white/[0.04] transition-colors flex flex-col gap-1.5 relative`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${sty.text}`} />
                    <span className={`text-[10.5px] uppercase tracking-[1.4px] font-bold truncate ${sty.text}`}>
                      {ins.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-mono text-[#6B7280]">
                      score {ins.score}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDismiss(ins)
                      }}
                      disabled={pending}
                      aria-label="Silenciar por 7 dias"
                      title="Silenciar 7 dias (sincroniza entre dispositivos)"
                      className="text-[#6B7280] hover:text-[#F5F0E8] transition-colors disabled:opacity-50 inline-flex items-center"
                    >
                      <BellOff className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <Link
                  href={ins.action_url}
                  className="contents"
                >
                  <div className="text-[12.5px] text-[#F5F0E8] leading-snug">{ins.message}</div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                    <span className="text-[10.5px] text-[#9CA3AF] truncate">
                      {ins.partnership_name}
                    </span>
                    <span className="text-[10px] text-[#C9A96E] inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      abrir <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
