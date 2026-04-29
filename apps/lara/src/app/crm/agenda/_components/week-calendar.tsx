'use client'

/**
 * WeekCalendar · grid week-view com slots por hora.
 *
 * 7 colunas (dom-sab) · linhas por hora (default 8h-20h).
 * Render appointments dentro do slot do horario · cor por status (espelha
 * legacy STATUS_COLORS de agenda-smart.constants.js).
 *
 * Click em slot vazio → callback onSlotClick(date, time) pra abrir modal novo.
 * Click em appointment → callback onAppointmentClick(appt).
 *
 * Drag-drop deferido pra Camada 8b · UI 8a foca em visualizar + criar.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
} from '@clinicai/repositories'
import type { AppointmentDTO } from '@clinicai/repositories'

interface WeekCalendarProps {
  /** Domingo da semana (YYYY-MM-DD) */
  weekStart: string
  appointments: ReadonlyArray<AppointmentDTO>
  /** Hora minima do calendario (default 8) */
  startHour?: number
  /** Hora maxima do calendario (default 20) */
  endHour?: number
  /** Slot duration in minutes (default 30) */
  slotMinutes?: number
}

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((s) => parseInt(s, 10) || 0)
  return h * 60 + m
}

export function WeekCalendar({
  weekStart,
  appointments,
  startHour = 8,
  endHour = 20,
  slotMinutes = 30,
}: WeekCalendarProps) {
  const router = useRouter()

  // 7 dias da semana
  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  // Slots de hora (linhas)
  const slots = React.useMemo(() => {
    const out: Array<{ label: string; minutes: number }> = []
    for (let h = startHour; h < endHour; h++) {
      out.push({ label: `${String(h).padStart(2, '0')}:00`, minutes: h * 60 })
      if (slotMinutes < 60) {
        out.push({
          label: `${String(h).padStart(2, '0')}:30`,
          minutes: h * 60 + 30,
        })
      }
    }
    return out
  }, [startHour, endHour, slotMinutes])

  // Indexa appointments por (date, slotMinutes)
  const apptsByDay = React.useMemo(() => {
    const map = new Map<string, AppointmentDTO[]>()
    for (const a of appointments) {
      const list = map.get(a.scheduledDate) ?? []
      list.push(a)
      map.set(a.scheduledDate, list)
    }
    return map
  }, [appointments])

  function handleSlotClick(date: string, time: string) {
    const params = new URLSearchParams({ date, time })
    router.push(`/crm/agenda/novo?${params.toString()}`)
  }

  function handleAppointmentClick(id: string) {
    router.push(`/crm/agenda/${id}`)
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <div className="grid min-w-[800px] grid-cols-[60px_repeat(7,1fr)]">
        {/* Header · vazio + 7 dias */}
        <div className="border-b border-r border-[var(--border)] bg-[var(--color-border-soft)]/30" />
        {days.map((date, i) => {
          const isToday = date === new Date().toISOString().slice(0, 10)
          const dayNum = parseInt(date.slice(8, 10), 10)
          return (
            <div
              key={date}
              className={`border-b border-r border-[var(--border)] px-2 py-2 text-center ${
                isToday
                  ? 'bg-[var(--primary)]/15'
                  : 'bg-[var(--color-border-soft)]/30'
              }`}
            >
              <div className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
                {WEEKDAYS_PT[i]}
              </div>
              <div
                className={`text-sm font-medium ${
                  isToday
                    ? 'text-[var(--primary)]'
                    : 'text-[var(--foreground)]'
                }`}
              >
                {dayNum}
              </div>
            </div>
          )
        })}

        {/* Linhas de slots */}
        {slots.map((slot) => (
          <React.Fragment key={slot.label}>
            <div className="border-b border-r border-[var(--border)] px-2 py-3 text-center text-[10px] text-[var(--muted-foreground)]">
              {slot.label}
            </div>
            {days.map((date) => {
              const dayAppts = apptsByDay.get(date) ?? []
              const slotAppts = dayAppts.filter((a) => {
                const start = timeToMinutes(a.startTime)
                const end = timeToMinutes(a.endTime)
                // Appt overlaps slot · start dentro OU spanning
                return start < slot.minutes + slotMinutes && end > slot.minutes
              })
              return (
                <div
                  key={`${date}-${slot.label}`}
                  className="relative min-h-[40px] border-b border-r border-[var(--border)] hover:bg-[var(--color-border-soft)]/20"
                  onClick={() => {
                    if (slotAppts.length === 0) {
                      handleSlotClick(date, slot.label)
                    }
                  }}
                >
                  {slotAppts.map((a) => {
                    const startMins = timeToMinutes(a.startTime)
                    // Renderiza apenas no slot inicial
                    if (
                      startMins < slot.minutes ||
                      startMins >= slot.minutes + slotMinutes
                    ) {
                      return null
                    }
                    return (
                      <AppointmentSlot
                        key={a.id}
                        appointment={a}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAppointmentClick(a.id)
                        }}
                      />
                    )
                  })}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

interface AppointmentSlotProps {
  appointment: AppointmentDTO
  onClick: (e: React.MouseEvent) => void
}

function AppointmentSlot({ appointment: a, onClick }: AppointmentSlotProps) {
  const cfg = APPOINTMENT_STATUS_COLORS[a.status] ?? {
    color: '#6B7280',
    bg: '#F3F4F6',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute inset-x-1 top-1 cursor-pointer rounded-md border-l-2 px-2 py-1 text-left text-xs transition-all hover:opacity-90 hover:shadow-luxury-sm"
      style={{
        borderLeftColor: cfg.color,
        backgroundColor: `${cfg.color}1A`,
        color: cfg.color,
      }}
      title={`${a.startTime}-${a.endTime} · ${APPOINTMENT_STATUS_LABELS[a.status]}`}
    >
      <div className="truncate font-medium">
        {a.startTime.slice(0, 5)} {a.subjectName || '—'}
      </div>
      {a.procedureName && (
        <div className="truncate text-[10px] opacity-80">
          {a.procedureName}
        </div>
      )}
    </button>
  )
}
