'use client'

/**
 * NotificationsBell · sino de alertas no AppHeader.
 *
 * Centraliza TODAS as notificacoes do sistema · cada insight aberto vira um
 * item. Badge vermelho mostra count de critical + warning. Click abre dropdown
 * com lista clicavel agrupada por severidade.
 *
 * Fonte de dados: insights cross-partnership (b2b_insights_global · mig 800-19)
 * passados como prop pelo server (AppHeader.tsx faz o fetch defensivo).
 *
 * Click outside fecha. ESC fecha. Click no item navega + fecha.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Bell, AlertOctagon, AlertTriangle, Sparkles, Info, ArrowRight,
} from 'lucide-react'
import type { Insight } from '@clinicai/repositories'

const SEVERITY_ICON = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  success: Sparkles,
  info: Info,
} as const

const SEVERITY_COLOR = {
  critical: '#FCA5A5',
  warning: '#FCD34D',
  success: '#6EE7B7',
  info: '#D4B785',
} as const

const SEVERITY_LABEL = {
  critical: 'Crítico',
  warning: 'Atenção',
  success: 'Oportunidade',
  info: 'Info',
} as const

const SEVERITY_ORDER: Insight['severity'][] = ['critical', 'warning', 'success', 'info']

export function NotificationsBell({ insights }: { insights: Insight[] }) {
  const [open, setOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement | null>(null)

  // Critical + warning · vermelho. Success + info contam mas dot dourado.
  const urgentCount = insights.filter(
    (i) => i.severity === 'critical' || i.severity === 'warning',
  ).length
  const totalCount = insights.length

  // Click outside + ESC fecham
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Agrupa por severity, ordena ja vem por score do server
  const grouped: Partial<Record<Insight['severity'], Insight[]>> = {}
  for (const ins of insights) {
    ;(grouped[ins.severity] ??= []).push(ins)
  }

  // Verifica critical especificamente · usa cor urgent #DC2626 (legacy padrao)
  // + bell-shake animation. Warning sozinho usa #EF4444 + sem shake.
  const criticalCount = insights.filter((i) => i.severity === 'critical').length
  const hasCritical = criticalCount > 0

  return (
    <div className="relative" ref={dropRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={
          urgentCount > 0
            ? `${urgentCount} alerta${urgentCount > 1 ? 's' : ''} urgente${urgentCount > 1 ? 's' : ''}`
            : 'Sem alertas'
        }
        className={
          'relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-white/10 bg-white/[0.02] text-[#9CA3AF] hover:text-[#F5F0E8] hover:border-[#C9A96E]/40 transition-colors' +
          (hasCritical ? ' bell-shake' : '')
        }
      >
        <Bell className="w-4 h-4" />
        {urgentCount > 0 ? (
          <span
            className={
              'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center border border-[#0F0D0A]' +
              (hasCritical ? ' badge-pulse' : '')
            }
            style={{ background: hasCritical ? '#DC2626' : '#EF4444' }}
          >
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        ) : totalCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#C9A96E] border border-[#0F0D0A]" />
        ) : null}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[380px] max-w-[90vw] rounded-lg border border-white/10 bg-[#0F0D0A] shadow-2xl z-30 overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#C9A96E]">
                Alertas gerais
              </span>
              <span className="text-[11px] text-[#9CA3AF]">
                {totalCount === 0
                  ? 'Tudo em ordem'
                  : `${urgentCount} urgente${urgentCount === 1 ? '' : 's'} · ${totalCount} no total`}
              </span>
            </div>
            <Link
              href="/insights"
              onClick={() => setOpen(false)}
              className="text-[10px] uppercase tracking-[1.2px] text-[#9CA3AF] hover:text-[#C9A96E] transition-colors"
            >
              Ver todos
            </Link>
          </div>

          <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
            {totalCount === 0 ? (
              <div className="px-3.5 py-6 text-center">
                <Sparkles className="w-5 h-5 mx-auto text-[#10B981] mb-1" />
                <div className="text-[12px] text-[#10B981] font-bold">Tudo em ordem</div>
                <div className="text-[10.5px] text-[#9CA3AF] mt-1">
                  Mira monitora cap, saúde, conversão, NPS e atividade.
                </div>
              </div>
            ) : (
              SEVERITY_ORDER.map((sev) => {
                const items = grouped[sev]
                if (!items || items.length === 0) return null
                const Icon = SEVERITY_ICON[sev]
                const color = SEVERITY_COLOR[sev]
                return (
                  <div key={sev}>
                    <div
                      className="px-3.5 py-1.5 text-[9.5px] uppercase tracking-[1.4px] font-bold border-b border-white/5"
                      style={{ color, background: `${color}10` }}
                    >
                      {SEVERITY_LABEL[sev]} · {items.length}
                    </div>
                    {items.map((ins, i) => (
                      <Link
                        key={`${ins.kind}-${ins.partnership_id}-${i}`}
                        href={ins.action_url}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-2.5 px-3.5 py-2.5 border-b border-white/5 hover:bg-white/[0.03] transition-colors group"
                      >
                        <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color }} />
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[11px] font-bold truncate"
                            style={{ color }}
                          >
                            {ins.title}
                          </div>
                          <div className="text-[11.5px] text-[#F5F0E8] leading-snug mt-0.5">
                            {ins.message}
                          </div>
                          <div className="text-[10px] text-[#9CA3AF] mt-1 truncate">
                            {ins.partnership_name}
                          </div>
                        </div>
                        <ArrowRight className="w-3 h-3 mt-1 shrink-0 text-[#6B7280] group-hover:text-[#C9A96E] transition-colors" />
                      </Link>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
