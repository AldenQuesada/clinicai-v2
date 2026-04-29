'use client'

/**
 * DayView · single-column slot vertical · Camada 8b.
 *
 * Layout: 1 coluna de slots 30min (8h-20h default), com drag-drop dentro do
 * mesmo dia (mover horario). Usa o mesmo dragDropAppointmentAction · valida
 * conflict local antes de submit.
 *
 * Click em slot vazio → /crm/agenda/novo?date=&time= (com prof+view
 * preservados pela URL pai).
 * Click em appointment → /crm/agenda/[id].
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

interface DayViewProps {
  /** Dia (YYYY-MM-DD) */
  date: string
  appointments: ReadonlyArray<AppointmentDTO>
  startHour?: number
  endHour?: number
  slotMinutes?: number
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((s) => parseInt(s, 10) || 0)
  return h * 60 + m
}

export function DayView({
  date,
  appointments,
  startHour = 8,
  endHour = 20,
  slotMinutes = 30,
}: DayViewProps) {
  const router = useRouter()
  const { fromResult, warning, error: toastError } = useToast()
  const [busy, setBusy] = React.useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

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

  // Filtra appointments do dia (caller idealmente ja passa filtrado, mas
  // defensivo)
  const dayAppts = React.useMemo(
    () => appointments.filter((a) => a.scheduledDate === date),
    [appointments, date],
  )

  function handleSlotClick(time: string) {
    const params = new URLSearchParams({ date, time })
    router.push(`/crm/agenda/novo?${params.toString()}`)
  }

  function handleAppointmentClick(id: string) {
    router.push(`/crm/agenda/${id}`)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const apptId = String(active.id)
    const slot = parseSlotId(String(over.id))
    if (!slot) return

    const appt = dayAppts.find((a) => a.id === apptId)
    if (!appt) return
    if (!isDraggableStatus(appt.status)) return

    const newStart = `${slot.time}:00`
    const newEnd = computeNewEndTime(appt, newStart)

    if (
      appt.scheduledDate === slot.date &&
      normalizeHms(appt.startTime) === newStart
    ) {
      return
    }

    const conflict = detectDropConflict(
      appt,
      slot.date,
      newStart,
      newEnd,
      dayAppts,
    )
    if (conflict) {
      warning(
        `Conflito · ${conflict.subjectName || 'Outro agendamento'} já ocupa esse horário`,
      )
      return
    }

    setBusy(true)
    try {
      const r = await dragDropAppointmentAction({
        appointmentId: apptId,
        newDate: slot.date,
        newStartTime: newStart,
        newEndTime: newEnd,
      })
      if (!r.ok) {
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
      setBusy(false)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <div className="grid min-w-[420px] grid-cols-[80px_1fr]">
          {/* Header */}
          <div className="border-b border-r border-[var(--border)] bg-[var(--color-border-soft)]/30 px-2 py-2 text-center text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
            Hora
          </div>
          <div className="border-b border-r border-[var(--border)] bg-[var(--color-border-soft)]/30 px-2 py-2 text-center text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
            Agendamentos
          </div>

          {slots.map((slot) => {
            const slotAppts = dayAppts.filter((a) => {
              const start = timeToMinutes(a.startTime)
              const end = timeToMinutes(a.endTime)
              return start < slot.minutes + slotMinutes && end > slot.minutes
            })
            const slotId = makeSlotId(date, slot.label)
            return (
              <React.Fragment key={slot.label}>
                <div className="border-b border-r border-[var(--border)] px-2 py-3 text-center text-xs text-[var(--muted-foreground)]">
                  {slot.label}
                </div>
                <DayDroppableSlot
                  slotId={slotId}
                  isEmpty={slotAppts.length === 0}
                  onClickEmpty={() => handleSlotClick(slot.label)}
                  busy={busy}
                >
                  {slotAppts.map((a) => {
                    const startMins = timeToMinutes(a.startTime)
                    if (
                      startMins < slot.minutes ||
                      startMins >= slot.minutes + slotMinutes
                    ) {
                      return null
                    }
                    return (
                      <DayAppointmentBlock
                        key={a.id}
                        appointment={a}
                        onClick={() => handleAppointmentClick(a.id)}
                      />
                    )
                  })}
                </DayDroppableSlot>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </DndContext>
  )
}

interface DayDroppableSlotProps {
  slotId: string
  isEmpty: boolean
  onClickEmpty: () => void
  busy: boolean
  children: React.ReactNode
}

function DayDroppableSlot({
  slotId,
  isEmpty,
  onClickEmpty,
  busy,
  children,
}: DayDroppableSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId })
  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[56px] border-b border-r border-[var(--border)] px-2 py-1 transition-colors ${
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

interface DayAppointmentBlockProps {
  appointment: AppointmentDTO
  onClick: () => void
}

function DayAppointmentBlock({
  appointment: a,
  onClick,
}: DayAppointmentBlockProps) {
  const draggable = isDraggableStatus(a.status)
  const cfg = APPOINTMENT_STATUS_COLORS[a.status] ?? {
    color: '#6B7280',
    bg: '#F3F4F6',
  }
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({ id: a.id, disabled: !draggable })

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
      onClick={(e) => {
        e.stopPropagation()
        if (!isDragging) onClick()
      }}
      className="mb-1 select-none rounded-md border-l-2 px-3 py-2 text-sm shadow-luxury-sm transition-shadow hover:shadow-luxury-md"
      title={`${a.startTime}-${a.endTime} · ${APPOINTMENT_STATUS_LABELS[a.status]}${
        draggable ? '' : ' · não arrastável'
      }`}
      role="button"
      tabIndex={0}
    >
      <div className="font-medium">
        {a.startTime.slice(0, 5)}–{a.endTime.slice(0, 5)} · {a.subjectName || '—'}
      </div>
      {a.procedureName && (
        <div className="text-[11px] opacity-80">{a.procedureName}</div>
      )}
      {a.professionalName && (
        <div className="text-[10px] opacity-70">
          {a.professionalName}
        </div>
      )}
    </div>
  )
}
