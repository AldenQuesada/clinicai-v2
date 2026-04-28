/**
 * Schemas Zod pra patients. UI nao cria patient direto · sempre via
 * RPC lead_to_paciente (lead.actions.ts → promoteToPatientAction).
 *
 * Aqui cobrimos: update (campos editaveis), softDelete (admin only),
 * addRevenueAfterAppointment (incremento de agregados).
 */

import { z } from 'zod'

const PatientStatus = z.enum(['active', 'inactive', 'blocked', 'deceased'])
const PatientSex = z.enum(['F', 'M', 'O', 'N'])

// ── update · campos editaveis (NAO inclui agregados) ────────────────────────
//
// total_procedures/total_revenue/first_procedure_at/last_procedure_at sao
// denormalizados, atualizados via RPC ou addRevenueAfterAppointment.

export const UpdatePatientSchema = z.object({
  patientId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  phone: z
    .string()
    .min(8)
    .regex(/^[0-9+]+$/, 'Telefone deve ter so digitos e +')
    .optional(),
  email: z.string().email().max(160).nullable().optional(),
  cpf: z
    .string()
    .regex(/^[0-9]{11}$/, 'CPF deve ter 11 digitos numericos')
    .nullable()
    .optional(),
  rg: z.string().max(20).nullable().optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')
    .nullable()
    .optional(),
  sex: PatientSex.nullable().optional(),
  /** Endereco serializado · shape decidido pela UI */
  addressJson: z.record(z.string(), z.unknown()).nullable().optional(),
  status: PatientStatus.optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
})

// ── softDelete · admin/owner only ───────────────────────────────────────────

export const SoftDeletePatientSchema = z.object({
  patientId: z.string().uuid(),
})

// ── addRevenueAfterAppointment · agregado financeiro ────────────────────────
//
// Usado quando appointment_finalize roda em paciente recorrente (sem
// promote=paciente). Chamado fire-and-forget pos-finalize · UI nao chama
// direto. Mantido aqui pra completeness da API.

export const AddPatientRevenueSchema = z.object({
  patientId: z.string().uuid(),
  amount: z.number().nonnegative(),
  when: z.string().datetime(),
})
