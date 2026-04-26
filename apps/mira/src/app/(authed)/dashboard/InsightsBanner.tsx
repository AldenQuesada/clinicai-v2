'use client'

/**
 * InsightsBanner · top sticky banner pro insight mais critico do dia.
 *
 * Aparece se ha pelo menos 1 insight severity=critical ou warning. Dismiss
 * agora persiste server-side via dismissInsightAction (mig 800-21 · TTL 7d).
 * Optimistic UI: some imediatamente no client; se a action falhar restaura.
 * Fallback localStorage mantido pra suavizar o gap antes da revalidate chegar.
 * Click no CTA leva pra action_url.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, AlertOctagon, ArrowRight, X, Sparkles } from 'lucide-react'
import type { Insight } from '@clinicai/repositories'
import { dismissInsightAction } from './actions'

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string; icon: typeof AlertTriangle }> = {
  critical: {
    border: 'border-[#EF4444]/40',
    bg: 'bg-[#EF4444]/8',
    text: 'text-[#FCA5A5]',
    icon: AlertOctagon,
  },
  warning: {
    border: 'border-[#F59E0B]/40',
    bg: 'bg-[#F59E0B]/8',
    text: 'text-[#FCD34D]',
    icon: AlertTriangle,
  },
  success: {
    border: 'border-[#10B981]/40',
    bg: 'bg-[#10B981]/8',
    text: 'text-[#6EE7B7]',
    icon: Sparkles,
  },
  info: {
    border: 'border-[#C9A96E]/40',
    bg: 'bg-[#C9A96E]/8',
    text: 'text-[#D4B785]',
    icon: AlertTriangle,
  },
}

/**
 * Cache otimista local · evita banner reaparecer entre o click e a
 * revalidatePath chegando. Chave NAO inclui dia, so kind+partnership_id.
 */
function localKey(kind: string, partnershipId: string): string {
  return `mira:insight-dismissed:${kind}:${partnershipId}`
}

export function InsightsBanner({ insights }: { insights: Insight[] }) {
  const top = useMemo(() => {
    if (!Array.isArray(insights) || !insights.length) return null
    const sorted = insights
      .filter((i) => i.severity === 'critical' || i.severity === 'warning')
      .slice()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return sorted[0] ?? null
  }, [insights])

  const [dismissed, setDismissed] = useState(false)
  const [pending, startTransition] = useTransition()

  // Reset state quando o insight mudar (ex: revalidate trouxe outro)
  useEffect(() => {
    if (!top) return
    setDismissed(false)
    try {
      if (localStorage.getItem(localKey(top.kind, top.partnership_id)) === '1') {
        setDismissed(true)
      }
    } catch {
      // localStorage indisponivel · ignore
    }
  }, [top])

  function dismiss() {
    if (!top || pending) return
    // Optimistic: some imediatamente
    setDismissed(true)
    try {
      localStorage.setItem(localKey(top.kind, top.partnership_id), '1')
    } catch {
      // ignore
    }
    startTransition(async () => {
      const r = await dismissInsightAction({
        kind: top.kind,
        partnership_id: top.partnership_id,
        ttl_days: 7,
      })
      if (!r.ok) {
        // Rollback se action falhar
        setDismissed(false)
        try {
          localStorage.removeItem(localKey(top.kind, top.partnership_id))
        } catch {
          // ignore
        }
      }
    })
  }

  if (!top || dismissed) return null

  const style = SEVERITY_STYLES[top.severity] || SEVERITY_STYLES.info
  const Icon = style.icon
  const totalAlerts = insights.filter((i) => i.severity === 'critical' || i.severity === 'warning').length

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border ${style.border} ${style.bg} px-3.5 py-2.5`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${style.text}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-[10px] uppercase tracking-[1.4px] font-bold ${style.text}`}>
          {top.title}
          {totalAlerts > 1 && (
            <span className="ml-2 text-[#9CA3AF]">+{totalAlerts - 1} outros alertas</span>
          )}
        </div>
        <div className="text-[12px] text-[#F5F0E8] mt-0.5 truncate">{top.message}</div>
      </div>
      <Link
        href={top.action_url}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] font-bold text-[#F5F0E8] hover:bg-white/10 transition-colors"
      >
        Resolver <ArrowRight className="w-3 h-3" />
      </Link>
      <Link
        href="/insights"
        className="text-[11px] text-[#9CA3AF] hover:text-[#F5F0E8] transition-colors hidden sm:inline"
      >
        Ver todos
      </Link>
      <button
        type="button"
        onClick={dismiss}
        disabled={pending}
        aria-label="Silenciar 7 dias"
        title="Silenciar por 7 dias (sincroniza entre dispositivos)"
        className="text-[#6B7280] hover:text-[#F5F0E8] transition-colors disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
