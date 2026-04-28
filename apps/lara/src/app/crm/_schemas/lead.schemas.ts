/**
 * Schemas Zod pra inputs de Server Actions de leads.
 *
 * Espelho das interfaces em @clinicai/repositories/src/types/inputs.ts
 * (LeadCreateRpcInput, LeadToAppointmentRpcInput, LeadToOrcamentoRpcInput).
 *
 * Reuso: import dessas schemas em forms client-side pra reaproveitar
 * validacao (react-hook-form + zodResolver).
 */

import { z } from 'zod'

// ── Enums espelhando packages/repositories/src/types/enums.ts ───────────────
// Single source of truth: enum em SQL CHECK constraint (mig 60-65).
// Quando matriz mudar, atualizar nos 3 lugares: SQL + TS enum + Zod schema.

const LeadSource = z.enum([
  'manual',
  'lara_recipient',
  'lara_vpi_partner',
  'b2b_partnership_referral',
  'b2b_admin_registered',
  'quiz',
  'landing_page',
  'import',
  'webhook',
])

const LeadSourceType = z.enum([
  'manual',
  'quiz',
  'import',
  'referral',
  'social',
  'whatsapp',
  'whatsapp_fullface',
  'landing_page',
  'b2b_voucher',
  'vpi_referral',
])

const Funnel = z.enum(['olheiras', 'fullface', 'procedimentos'])
const LeadTemperature = z.enum(['cold', 'warm', 'hot'])

const LeadPhase = z.enum([
  'lead',
  'agendado',
  'reagendado',
  'compareceu',
  'paciente',
  'orcamento',
  'perdido',
])

// ── Item shared entre Lead+Orcamento+AppointmentFinalize ────────────────────

export const OrcamentoItemSchema = z.object({
  name: z.string().min(1, 'Nome do item obrigatorio'),
  qty: z.number().positive('Quantidade > 0'),
  unitPrice: z.number().nonnegative('Preco unitario >= 0'),
  subtotal: z.number().nonnegative('Subtotal >= 0'),
  procedureCode: z.string().nullable().optional(),
})

// ── lead_create ─────────────────────────────────────────────────────────────

export const CreateLeadSchema = z.object({
  phone: z
    .string()
    .min(8, 'Telefone curto demais')
    .regex(/^[0-9+]+$/, 'Telefone deve ter so digitos e +'),
  name: z.string().max(120).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  source: LeadSource.optional(),
  sourceType: LeadSourceType.optional(),
  funnel: Funnel.optional(),
  temperature: LeadTemperature.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
})

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>

// ── lead_to_appointment ─────────────────────────────────────────────────────

export const ScheduleAppointmentSchema = z.object({
  leadId: z.string().uuid(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD'),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Esperado HH:MM ou HH:MM:SS'),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Esperado HH:MM ou HH:MM:SS'),
  professionalId: z.string().uuid().nullable().optional(),
  professionalName: z.string().max(120).optional(),
  procedureName: z.string().max(200).optional(),
  consultType: z.string().max(50).nullable().optional(),
  evalType: z.string().max(50).nullable().optional(),
  value: z.number().nonnegative().optional(),
  origem: z.string().max(50).optional(),
  obs: z.string().max(2000).nullable().optional(),
})

// ── lead_to_orcamento ───────────────────────────────────────────────────────

export const CreateOrcamentoFromLeadSchema = z.object({
  leadId: z.string().uuid(),
  subtotal: z.number().nonnegative(),
  items: z.array(OrcamentoItemSchema).min(1, 'Pelo menos 1 item'),
  discount: z.number().nonnegative().optional(),
  notes: z.string().max(4000).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')
    .nullable()
    .optional(),
})

// ── lead_to_paciente · promove direto (sem appointment_finalize) ────────────

export const PromoteToPatientSchema = z.object({
  leadId: z.string().uuid(),
  totalRevenue: z.number().nonnegative().nullable().optional(),
  firstAt: z.string().datetime().nullable().optional(),
  lastAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
})

// ── lead_lost ───────────────────────────────────────────────────────────────

export const MarkLeadLostSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().min(2, 'Motivo obrigatorio').max(500),
})

// ── sdr_change_phase · wrapper generico ─────────────────────────────────────

export const ChangeLeadPhaseSchema = z.object({
  leadId: z.string().uuid(),
  toPhase: LeadPhase,
  reason: z.string().max(500).nullable().optional(),
})
