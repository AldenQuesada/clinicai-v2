/**
 * Schemas Zod pra orcamentos. UI normalmente cria via lead_to_orcamento RPC
 * (lead.actions.ts → createOrcamentoFromLeadAction). Aqui cobre transicoes
 * de status (sent/approved/lost), updates de items, payments, share token.
 */

import { z } from 'zod'
import { OrcamentoItemSchema } from './lead.schemas'

const OrcamentoStatus = z.enum([
  'draft',
  'sent',
  'viewed',
  'followup',
  'negotiation',
  'approved',
  'lost',
])

// Pagamentos jsonb · shape solto (relatorios decidem campos canon)
const OrcamentoPaymentSchema = z
  .object({
    date: z.string().datetime().optional(),
    method: z.string().max(50).optional(),
    amount: z.number().nonnegative().optional(),
    reference: z.string().max(200).optional(),
  })
  .catchall(z.unknown())

// ── update generico ─────────────────────────────────────────────────────────
//
// NAO usar pra mover pra approved/lost · use markApprovedAction /
// markLostAction que setam timestamps + reason.

export const UpdateOrcamentoSchema = z.object({
  orcamentoId: z.string().uuid(),
  title: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  items: z.array(OrcamentoItemSchema).optional(),
  subtotal: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  status: OrcamentoStatus.optional(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Esperado YYYY-MM-DD')
    .nullable()
    .optional(),
  payments: z.array(OrcamentoPaymentSchema).optional(),
  shareToken: z.string().min(8).max(64).nullable().optional(),
})

// ── markSent · status=sent + sent_at=now ────────────────────────────────────

export const MarkOrcamentoSentSchema = z.object({
  orcamentoId: z.string().uuid(),
})

// ── markApproved · status=approved + approved_at=now ────────────────────────

export const MarkOrcamentoApprovedSchema = z.object({
  orcamentoId: z.string().uuid(),
})

// ── markLost · reason obrigatorio (chk_orc_lost_consistency) ────────────────

export const MarkOrcamentoLostSchema = z.object({
  orcamentoId: z.string().uuid(),
  reason: z.string().min(2, 'Motivo obrigatorio').max(500),
})

// ── addPayment · append parcela ao array payments[] ─────────────────────────

export const AddOrcamentoPaymentSchema = z.object({
  orcamentoId: z.string().uuid(),
  payment: OrcamentoPaymentSchema,
})

// ── softDelete · admin/owner only ───────────────────────────────────────────

export const SoftDeleteOrcamentoSchema = z.object({
  orcamentoId: z.string().uuid(),
})
