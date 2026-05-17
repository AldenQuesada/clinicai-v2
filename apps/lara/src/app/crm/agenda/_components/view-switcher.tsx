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

  // Ordem LITERAL legacy (api.js L425): Mês · Semana · Hoje
  const items: ReadonlyArray<{ key: View; label: string }> = [
    { key: 'month', label: 'Mês' },
    { key: 'week', label: 'Semana' },
    { key: 'day', label: 'Hoje' },
  ]

  return (
    <div role="tablist" aria-label="Modo de visualização" className="view-switcher">
      {items.map((it) => {
        const active = current === it.key
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            onClick={() => handleSwitch(it.key)}
            className={active ? 'view-btn view-btn-active' : 'view-btn'}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
