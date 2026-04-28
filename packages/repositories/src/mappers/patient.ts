/**
 * mapPatientRow · row snake_case da tabela patients → PatientDTO camelCase.
 */

import type { PatientSex, PatientStatus } from '../types/enums'
import type { PatientDTO } from '../types/dtos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPatientRow(row: any): PatientDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    email: row.email ?? null,
    cpf: row.cpf ?? null,
    rg: row.rg ?? null,
    birthDate: row.birth_date ?? null,
    sex: (row.sex ?? null) as PatientSex | null,
    addressJson: row.address_json ?? null,
    status: (row.status ?? 'active') as PatientStatus,
    assignedTo: row.assigned_to ?? null,
    notes: row.notes ?? null,
    totalProcedures: Number(row.total_procedures ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    firstProcedureAt: row.first_procedure_at ?? null,
    lastProcedureAt: row.last_procedure_at ?? null,
    sourceLeadPhaseAt: row.source_lead_phase_at ?? null,
    sourceLeadMeta:
      row.source_lead_meta && typeof row.source_lead_meta === 'object'
        ? row.source_lead_meta
        : {},
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
  }
}
