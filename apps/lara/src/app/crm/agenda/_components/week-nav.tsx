'use client'

/**
 * WeekNav · navegacao entre semanas (Prev/Today/Next) + label de range.
 * URL state: ?week=YYYY-MM-DD (domingo da semana).
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@clinicai/ui'

interface WeekNavProps {
  weekStart: string // YYYY-MM-DD (domingo)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

export function WeekNav({ weekStart }: WeekNavProps) {
  const pathname = usePathname()
  const sp = useSearchParams()

  const prev = addDays(weekStart, -7)
  const next = addDays(weekStart, 7)
  const today = new Date().toISOString().slice(0, 10)
  const todaySunday = (() => {
    const d = new Date(`${today}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return d.toISOString().slice(0, 10)
  })()

  function buildHref(weekStr: string) {
    const next = new URLSearchParams(sp)
    if (weekStr === todaySunday) next.delete('week')
    else next.set('week', weekStr)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const lastDay = addDays(weekStart, 6)
  const isCurrent = weekStart === todaySunday

  return (
    <div className="flex items-center gap-2">
      <Link href={buildHref(prev)}>
        <Button variant="ghost" size="sm" aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </Link>
      <div className="min-w-[180px] text-center text-xs text-[var(--muted-foreground)]">
        <CalendarIcon className="mr-1 inline h-3 w-3" />
        {fmtDate(weekStart)} — {fmtDate(lastDay)}
      </div>
      <Link href={buildHref(next)}>
        <Button variant="ghost" size="sm" aria-label="Próxima semana">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </Link>
      {!isCurrent && (
        <Link href={buildHref(todaySunday)}>
          <Button variant="outline" size="sm">
            Hoje
          </Button>
        </Link>
      )}
    </div>
  )
}
