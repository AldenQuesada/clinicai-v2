'use client'

/**
 * PeriodNav · navegacao Prev/Today/Next generica pra week/day/month · 8b.
 *
 * Substituto unificado do antigo week-nav.tsx (removido em 8b).
 *
 * URL state depende do view:
 *   - week:  ?week=YYYY-MM-DD (domingo)
 *   - day:   ?date=YYYY-MM-DD
 *   - month: ?month=YYYY-MM
 *
 * Preserva todos demais params (prof, view, etc).
 */

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@clinicai/ui'

type View = 'week' | 'day' | 'month'

interface PeriodNavProps {
  view: View
  /** Anchor atual (semana=domingo, dia=YYYY-MM-DD, mes=YYYY-MM) */
  anchor: string
  /** Anchor "hoje" pra mostrar/esconder botao Hoje */
  todayAnchor: string
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split('-').map((s) => parseInt(s, 10))
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function fmtRange(view: View, anchor: string): string {
  if (view === 'week') {
    const last = addDays(anchor, 6)
    const fmt = (s: string) =>
      new Date(`${s}T00:00:00.000Z`).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
      })
    return `${fmt(anchor)} — ${fmt(last)}`
  }
  if (view === 'day') {
    return new Date(`${anchor}T00:00:00.000Z`).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    })
  }
  // month YYYY-MM
  const [y, m] = anchor.split('-').map((s) => parseInt(s, 10))
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function step(view: View, anchor: string, dir: -1 | 1): string {
  if (view === 'week') return addDays(anchor, 7 * dir)
  if (view === 'day') return addDays(anchor, 1 * dir)
  return addMonths(anchor, 1 * dir)
}

export function PeriodNav({ view, anchor, todayAnchor }: PeriodNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const paramKey = view === 'week' ? 'week' : view === 'day' ? 'date' : 'month'

  function buildHref(newAnchor: string) {
    const next = new URLSearchParams(sp)
    if (newAnchor === todayAnchor) next.delete(paramKey)
    else next.set(paramKey, newAnchor)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const isCurrent = anchor === todayAnchor

  function go(newAnchor: string) {
    router.push(buildHref(newAnchor))
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-label="Anterior"
        onClick={() => go(step(view, anchor, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[200px] text-center text-xs text-[var(--muted-foreground)]">
        <CalendarIcon className="mr-1 inline h-3 w-3" />
        {fmtRange(view, anchor)}
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Próximo"
        onClick={() => go(step(view, anchor, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isCurrent && (
        <Button variant="outline" size="sm" onClick={() => go(todayAnchor)}>
          Hoje
        </Button>
      )}
    </div>
  )
}
