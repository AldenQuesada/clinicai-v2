'use client'

/**
 * ViewSwitcher · seletor "Semana | Dia | Mês" · Camada 8b.
 *
 * Atualiza ?view e seta param de ancora apropriado:
 *   - week: ?view=week&week=YYYY-MM-DD (domingo)
 *   - day:  ?view=day&date=YYYY-MM-DD
 *   - month: ?view=month&month=YYYY-MM
 *
 * Preserva ?prof e remove ancoras das outras views pra evitar lixo na URL.
 */

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@clinicai/ui'

type View = 'week' | 'day' | 'month'

interface ViewSwitcherProps {
  current: View
  /** Hoje YYYY-MM-DD · usado pra anchor default ao trocar */
  todayDate: string
  /** Domingo da semana corrente · default pra ?view=week */
  todaySunday: string
  /** Mes corrente YYYY-MM · default pra ?view=month */
  todayMonth: string
}

export function ViewSwitcher({
  current,
  todayDate,
  todaySunday,
  todayMonth,
}: ViewSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function handleSwitch(view: View) {
    const next = new URLSearchParams(sp)
    next.set('view', view)
    // Limpa ancoras de outras views
    next.delete('week')
    next.delete('date')
    next.delete('month')
    if (view === 'week') {
      next.set('week', todaySunday)
    } else if (view === 'day') {
      next.set('date', todayDate)
    } else if (view === 'month') {
      next.set('month', todayMonth)
    }
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const items: ReadonlyArray<{ key: View; label: string }> = [
    { key: 'week', label: 'Semana' },
    { key: 'day', label: 'Dia' },
    { key: 'month', label: 'Mês' },
  ]

  return (
    <div
      role="tablist"
      aria-label="Modo de visualização"
      className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] p-0.5"
    >
      {items.map((it) => (
        <Button
          key={it.key}
          type="button"
          size="sm"
          variant={current === it.key ? 'default' : 'ghost'}
          aria-pressed={current === it.key}
          onClick={() => handleSwitch(it.key)}
          className="h-7 px-2 text-xs"
        >
          {it.label}
        </Button>
      ))}
    </div>
  )
}
