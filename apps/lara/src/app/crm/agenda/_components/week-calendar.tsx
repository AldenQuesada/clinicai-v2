'use client'

/**
 * WeekCalendar · grid week-view com slots por hora + drag-drop (Camada 8b).
 *
 * 7 colunas (dom-sab) · linhas por hora (default 8h-20h).
 * Render appointments dentro do slot do horario · cor por status.
 *
 * Click em slot vazio → /crm/agenda/novo?date=&time= (com prof preservado).
 * Click em appointment → /crm/agenda/[id].
 *
 * Drag-drop · 8b:
 *   - Cada appointment block draggable se status pre-atendimento
 *     (agendado/confirmado/etc · ver isDraggableStatus)
 *   - Cada slot vazio droppable
 *   - onDragEnd computa newStartTime preservando duracao · valida conflict
 *     local (appointmentsOverlap helper) · chama dragDropAppointmentAction
 *   - router.refresh em sucesso · toast warn em conflict · toast err em
 *     falha de rede/zod
 *
 * Re-render visual: opacity 0.5 no item arrastado, ring no slot hover.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
} from '@clinicai/repositories'
import type { AppointmentDTO } from '@clinicai/repositories'
import { useToast } from '@clinicai/ui'
import { dragDropAppointmentAction } from '@/app/crm/_actions/appointment.actions'
import {
  computeNewEndTime,
  detectDropConflict,
  isDraggableStatus,
  makeSlotId,
  normalizeHms,
  parseSlotId,
} from './_drag-utils'

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
  const { fromResult, warning, error: toastError } = useToast()
  const [dragBusy, setDragBusy] = React.useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  )

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

  /**
   * onDragEnd · valida + chama Server Action.
   * - active.id  = appointment.id (string)
   * - over.id    = slot_${date}_${HH:MM}
   */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const apptId = String(active.id)
    const slot = parseSlotId(String(over.id))
    if (!slot) return

    const appt = appointments.find((a) => a.id === apptId)
    if (!appt) return
    if (!isDraggableStatus(appt.status)) return

    const newStart = `${slot.time}:00`
    const newEnd = computeNewEndTime(appt, newStart)

    // No-op se mesmo lugar
    if (
      appt.scheduledDate === slot.date &&
      normalizeHms(appt.startTime) === newStart
    ) {
      return
    }

    // Pre-check local de conflict (UX rapida · server tambem valida)
    const conflict = detectDropConflict(
      appt,
      slot.date,
      newStart,
      newEnd,
      appointments,
    )
    if (conflict) {
      warning(
        `Conflito · ${conflict.subjectName || 'Outro agendamento'} já ocupa esse horário`,
      )
      return
    }

    setDragBusy(true)
    try {
      const r = await dragDropAppointmentAction({
        appointmentId: apptId,
        newDate: slot.date,
        newStartTime: newStart,
        newEndTime: newEnd,
      })
      if (!r.ok) {
        // Conflict do server vem com `detail` mas humanizeError ja cobre
        if (r.error === 'conflict') {
          warning('Conflito de horário · escolha outro slot')
        } else {
          fromResult(r)
        }
        return
      }
      router.refresh()
    } catch (e) {
      toastError(`Falha ao mover · ${(e as Error).message}`)
    } finally {
      setDragBusy(false)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
                const slotId = makeSlotId(date, slot.label)
                return (
                  <DroppableSlot
                    key={`${date}-${slot.label}`}
                    slotId={slotId}
                    isEmpty={slotAppts.length === 0}
                    onClickEmpty={() => handleSlotClick(date, slot.label)}
                    busy={dragBusy}
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
                          onClick={() => handleAppointmentClick(a.id)}
                        />
                      )
                    })}
                  </DroppableSlot>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </DndContext>
  )
}

// ── Droppable wrapper · cada celula 1 dia × 1 slot ──────────────────────────

interface DroppableSlotProps {
  slotId: string
  isEmpty: boolean
  onClickEmpty: () => void
  busy: boolean
  children: React.ReactNode
}

function DroppableSlot({
  slotId,
  isEmpty,
  onClickEmpty,
  busy,
  children,
}: DroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId })
  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[40px] border-b border-r border-[var(--border)] transition-colors ${
        isOver
          ? 'bg-[var(--primary)]/20 ring-1 ring-inset ring-[var(--primary)]/60'
          : 'hover:bg-[var(--color-border-soft)]/20'
      } ${busy ? 'cursor-wait' : ''}`}
      onClick={() => {
        if (isEmpty && !busy) onClickEmpty()
      }}
    >
      {children}
    </div>
  )
}

// ── Draggable appointment block ─────────────────────────────────────────────

interface AppointmentSlotProps {
  appointment: AppointmentDTO
  onClick: () => void
}

function AppointmentSlot({ appointment: a, onClick }: AppointmentSlotProps) {
  const draggable = isDraggableStatus(a.status)
  const cfg = APPOINTMENT_STATUS_COLORS[a.status] ?? {
    color: '#6B7280',
    bg: '#F3F4F6',
  }
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({
      id: a.id,
      disabled: !draggable,
    })

  const style: React.CSSProperties = {
    borderLeftColor: cfg.color,
    backgroundColor: `${cfg.color}1A`,
    color: cfg.color,
    opacity: isDragging ? 0.5 : 1,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      // Click separado de drag · dnd-kit so dispara drag passado activation distance
      onClick={(e) => {
        // Se nao houve drag, click vira navigate
        e.stopPropagation()
        if (!isDragging) onClick()
      }}
      className="absolute inset-x-1 top-1 select-none rounded-md border-l-2 px-2 py-1 text-left text-xs shadow-luxury-sm transition-shadow hover:shadow-luxury-md"
      title={`${a.startTime}-${a.endTime} · ${APPOINTMENT_STATUS_LABELS[a.status]}${
        draggable ? '' : ' · não arrastável'
      }`}
      role="button"
      tabIndex={0}
    >
      <div className="truncate font-medium">
        {a.startTime.slice(0, 5)} {a.subjectName || '—'}
      </div>
      {a.procedureName && (
        <div className="truncate text-[10px] opacity-80">
          {a.procedureName}
        </div>
      )}
    </div>
  )
}
