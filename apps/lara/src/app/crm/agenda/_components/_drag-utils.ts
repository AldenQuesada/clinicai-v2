/**
 * _drag-utils · helpers compartilhados pelos calendarios (week/day) com drag-drop.
 *
 * Responsabilidades:
 *   - Determinar quais status sao "draggable" (apenas pre-atendimento)
 *   - Calcular novo HH:MM:SS preservando duracao
 *   - Detectar conflicts via appointmentsOverlap antes de submit
 *   - Codificar/decodificar IDs de droppable slots (`${date}_${HH:MM}`)
 *
 * NAO faz fetch · apenas matematica pura sobre AppointmentDTO.
 */

import {
  appointmentsOverlap,
  timeToMinutes,
  type AppointmentDTO,
  type AppointmentStatus,
} from '@clinicai/repositories'

/**
 * Status que permitem mover via drag-drop. Terminais (na_clinica em diante,
 * cancelado, no_show) nao sao draggable · paciente ja foi atendido ou
 * fluxo encerrado.
 */
const DRAGGABLE_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'pre_consulta',
  'aguardando',
])

export function isDraggableStatus(status: AppointmentStatus): boolean {
  return DRAGGABLE_STATUSES.has(status)
}

/** Pad HH (0-23) e MM (0-59) com zero · sem segundos. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Normaliza HH:MM:SS pra HH:MM:00. Aceita "HH:MM" ou "HH:MM:SS".
 */
export function normalizeHms(t: string): string {
  const [h = '00', m = '00'] = t.split(':')
  return `${pad2(parseInt(h, 10))}:${pad2(parseInt(m, 10))}:00`
}

/**
 * Adiciona N minutos a um HH:MM(:SS) e retorna HH:MM:SS.
 * Trunca em 23:59 se transbordar (deveria ser raro · slots no max ate 20h).
 */
export function addMinutesHms(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes
  const clamped = Math.max(0, Math.min(total, 23 * 60 + 59))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${pad2(h)}:${pad2(m)}:00`
}

/**
 * Calcula nova `endTime` preservando duracao do appointment ao mover pra
 * `newStartTime`. Retorna sempre HH:MM:SS.
 */
export function computeNewEndTime(
  appt: AppointmentDTO,
  newStartTime: string,
): string {
  const dur = timeToMinutes(appt.endTime) - timeToMinutes(appt.startTime)
  return addMinutesHms(newStartTime, Math.max(dur, 15))
}

/**
 * Codifica id de slot droppable: `slot_${date}_${HH:MM}`.
 * Date sempre YYYY-MM-DD · time sempre HH:MM (sem segundos).
 */
export function makeSlotId(date: string, hhmm: string): string {
  return `slot_${date}_${hhmm}`
}

export function parseSlotId(
  slotId: string,
): { date: string; time: string } | null {
  if (!slotId.startsWith('slot_')) return null
  const rest = slotId.slice(5)
  const m = rest.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/)
  if (!m) return null
  return { date: m[1], time: m[2] }
}

/**
 * Detecta conflict com OUTROS appointments no destino. Considera mesmo
 * professionalId (se ambos tiverem) OU mesma sala. Caller filtra `others`
 * pra excluir o appt sendo arrastado.
 *
 * Retorna o primeiro conflict encontrado (ou null).
 */
export function detectDropConflict(
  draggedAppt: AppointmentDTO,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  others: ReadonlyArray<AppointmentDTO>,
): AppointmentDTO | null {
  const candidate = { startTime: newStartTime, endTime: newEndTime }
  for (const o of others) {
    if (o.id === draggedAppt.id) continue
    if (o.scheduledDate !== newDate) continue
    // Overlap se mesmo professional OU mesma sala OU mesmo paciente/lead
    const sameProf =
      !!draggedAppt.professionalId &&
      !!o.professionalId &&
      draggedAppt.professionalId === o.professionalId
    const sameRoom =
      draggedAppt.roomIdx != null &&
      o.roomIdx != null &&
      draggedAppt.roomIdx === o.roomIdx
    const samePatient =
      (!!draggedAppt.patientId && draggedAppt.patientId === o.patientId) ||
      (!!draggedAppt.leadId && draggedAppt.leadId === o.leadId)
    if (!sameProf && !sameRoom && !samePatient) continue
    if (appointmentsOverlap(candidate, o)) {
      return o
    }
  }
  return null
}
