'use client'

/**
 * MonthView · grid 6sem × 7d com COUNT + dot por status · Camada 8b.
 *
 * Sem drag-drop · click numa celula do dia → drill pra ?view=day&date=...
 * preservando filtros (prof) atuais.
 *
 * Layout sempre 42 celulas (6 semanas) pra altura estavel · dias de fora
 * do mes ficam dim.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
} from '@clinicai/repositories'
import type {
  AppointmentDTO,
  AppointmentStatus,
} from '@clinicai/repositories'

interface MonthViewProps {
  /** Mes alvo no formato YYYY-MM */
  month: string
  appointments: ReadonlyArray<AppointmentDTO>
}

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/**
 * Status agrupados pra dots: 4 buckets visuais em vez de 13 cores.
 */
type DotKind = 'agendado' | 'confirmado' | 'finalizado' | 'cancelado'

const STATUS_TO_DOT: Record<AppointmentStatus, DotKind> = {
  agendado: 'agendado',
  aguardando_confirmacao: 'agendado',
  pre_consulta: 'agendado',
  confirmado: 'confirmado',
  aguardando: 'confirmado',
  na_clinica: 'confirmado',
  em_consulta: 'confirmado',
  em_atendimento: 'confirmado',
  finalizado: 'finalizado',
  remarcado: 'agendado',
  cancelado: 'cancelado',
  no_show: 'cancelado',
  bloqueado: 'agendado',
}

const DOT_COLORS: Record<DotKind, string> = {
  agendado: APPOINTMENT_STATUS_COLORS.agendado.color,
  confirmado: APPOINTMENT_STATUS_COLORS.confirmado.color,
  finalizado: APPOINTMENT_STATUS_COLORS.finalizado.color,
  cancelado: APPOINTMENT_STATUS_COLORS.cancelado.color,
}

const DOT_LABELS: Record<DotKind, string> = {
  agendado: APPOINTMENT_STATUS_LABELS.agendado,
  confirmado: APPOINTMENT_STATUS_LABELS.confirmado,
  finalizado: APPOINTMENT_STATUS_LABELS.finalizado,
  cancelado: APPOINTMENT_STATUS_LABELS.cancelado,
}

/**
 * Resolve primeiro domingo da grid · vai pra antes do dia 1 do mes ate
 * cair em domingo. Garante 42 celulas (6 sem × 7d).
 */
function gridStartDate(month: string): string {
  const [y, m] = month.split('-').map((s) => parseInt(s, 10))
  const first = new Date(Date.UTC(y, m - 1, 1))
  // weekday 0=dom no UTC
  first.setUTCDate(first.getUTCDate() - first.getUTCDay())
  return first.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function isSameMonth(dateStr: string, month: string): boolean {
  return dateStr.slice(0, 7) === month
}

export function MonthView({ month, appointments }: MonthViewProps) {
  const pathname = usePathname()
  const sp = useSearchParams()

  const start = gridStartDate(month)
  const days = React.useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(start, i)),
    [start],
  )

  // Indexa appointments por dia
  const apptsByDay = React.useMemo(() => {
    const map = new Map<string, AppointmentDTO[]>()
    for (const a of appointments) {
      const list = map.get(a.scheduledDate) ?? []
      list.push(a)
      map.set(a.scheduledDate, list)
    }
    return map
  }, [appointments])

  const todayStr = new Date().toISOString().slice(0, 10)

  /**
   * Drill href · ?view=day&date=YYYY-MM-DD preservando outros filtros (prof).
   */
  function dayHref(dateStr: string): string {
    const next = new URLSearchParams(sp)
    next.set('view', 'day')
    next.set('date', dateStr)
    next.delete('week')
    next.delete('month')
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <div className="rounded-md border border-[var(--border)]">
      {/* Header com nomes dos dias */}
      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--color-border-soft)]/30">
        {WEEKDAYS_PT.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6 sem × 7 d */}
      <div className="grid grid-cols-7">
        {days.map((dateStr) => {
          const dayAppts = apptsByDay.get(dateStr) ?? []
          const inMonth = isSameMonth(dateStr, month)
          const isToday = dateStr === todayStr
          const dayNum = parseInt(dateStr.slice(8, 10), 10)

          // Conta por dot kind
          const counts: Record<DotKind, number> = {
            agendado: 0,
            confirmado: 0,
            finalizado: 0,
            cancelado: 0,
          }
          for (const a of dayAppts) {
            counts[STATUS_TO_DOT[a.status] ?? 'agendado']++
          }
          const total = dayAppts.length

          return (
            <Link
              key={dateStr}
              href={dayHref(dateStr)}
              className={`block min-h-[88px] border-b border-r border-[var(--border)] px-2 py-2 transition-colors hover:bg-[var(--color-border-soft)]/30 ${
                isToday ? 'bg-[var(--primary)]/10' : ''
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    isToday
                      ? 'font-semibold text-[var(--primary)]'
                      : 'text-[var(--foreground)]'
                  }`}
                >
                  {dayNum}
                </span>
                {total > 0 && (
                  <span className="text-[10px] font-medium text-[var(--muted-foreground)]">
                    {total}
                  </span>
                )}
              </div>

              {/* Dots por status (4 buckets) */}
              {total > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(Object.keys(counts) as DotKind[]).map((k) =>
                    counts[k] > 0 ? (
                      <span
                        key={k}
                        title={`${counts[k]} ${DOT_LABELS[k]}`}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-border-soft)]/40 px-1.5 py-0.5 text-[10px]"
                        style={{ color: DOT_COLORS[k] }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: DOT_COLORS[k] }}
                        />
                        {counts[k]}
                      </span>
                    ) : null,
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
