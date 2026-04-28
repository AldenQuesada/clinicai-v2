/**
 * mapAppointmentRow · row snake_case da tabela appointments → AppointmentDTO.
 */

import type {
  AppointmentConsentImg,
  AppointmentPaymentStatus,
  AppointmentStatus,
} from '../types/enums'
import type { AppointmentDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAppointmentRow(row: any): AppointmentDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    leadId: row.lead_id ?? null,
    patientId: row.patient_id ?? null,
    subjectName: String(row.subject_name ?? ''),
    subjectPhone: row.subject_phone ?? null,
    professionalId: row.professional_id ?? null,
    professionalName: String(row.professional_name ?? ''),
    roomIdx: row.room_idx != null ? Number(row.room_idx) : null,
    scheduledDate: String(row.scheduled_date ?? ''),
    startTime: String(row.start_time ?? ''),
    endTime: String(row.end_time ?? ''),
    procedureName: String(row.procedure_name ?? ''),
    consultType: row.consult_type ?? null,
    evalType: row.eval_type ?? null,
    value: Number(row.value ?? 0),
    paymentMethod: row.payment_method ?? null,
    paymentStatus: (row.payment_status ?? 'pendente') as AppointmentPaymentStatus,
    status: (row.status ?? 'agendado') as AppointmentStatus,
    origem: row.origem ?? null,
    chegadaEm: row.chegada_em ?? null,
    canceladoEm: row.cancelado_em ?? null,
    motivoCancelamento: row.motivo_cancelamento ?? null,
    noShowEm: row.no_show_em ?? null,
    motivoNoShow: row.motivo_no_show ?? null,
    consentimentoImg: (row.consentimento_img ?? 'pendente') as AppointmentConsentImg,
    obs: row.obs ?? null,
    recurrenceGroupId: row.recurrence_group_id ?? null,
    recurrenceIndex: row.recurrence_index != null ? Number(row.recurrence_index) : null,
    recurrenceTotal: row.recurrence_total != null ? Number(row.recurrence_total) : null,
    recurrenceProcedure: row.recurrence_procedure ?? null,
    recurrenceIntervalDays:
      row.recurrence_interval_days != null ? Number(row.recurrence_interval_days) : null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}
