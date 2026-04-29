'use server'

/**
 * Server Action · /vouchers/novo · emit single rapido.
 *
 * Reusa 100% da infra de queue + dispatch + tracking · enqueue com items=[1].
 * Retorna { ok, batchId, error } pra UI decidir navegar/fechar/exibir alerta.
 * Caller standalone (page /vouchers/novo) faz router.push em sucesso · caller
 * modal (VoucherCreateModal via NewMenu) fecha modal + router.push.
 *
 * Validacoes:
 *   - parceria selecionada (required)
 *   - nome trim nao vazio
 *   - phone passa pelo normalizePhoneBR (10-13 digitos BR)
 *   - scheduled_at opcional (default: agora)
 */

import { revalidatePath } from 'next/cache'
import { normalizePhoneBR } from '@clinicai/utils'
import { loadMiraServerContext } from '@/lib/server-context'
import type { PartnershipOption } from './SingleVoucherForm'

export interface EmitVoucherSingleResult {
  ok: boolean
  batchId?: string
  error?: string
}

/**
 * Lista parcerias ativas enriquecidas com cap+counts mensais.
 * Usada pelo VoucherCreateModal (header NewMenu) que abre on-demand.
 */
export async function listEnrichedPartnershipsAction(): Promise<PartnershipOption[]> {
  const { ctx, repos } = await loadMiraServerContext()
  const partnerships = await repos.b2bPartnerships
    .list(ctx.clinic_id, { status: 'active' })
    .catch(() => [])
  return Promise.all(
    partnerships.slice(0, 30).map(async (p) => ({
      id: p.id,
      name: p.name,
      voucherCombo: p.voucherCombo,
      voucherValidityDays: p.voucherValidityDays,
      voucherMonthlyCap: p.voucherMonthlyCap,
      vouchersIssuedThisMonth: await repos.b2bVouchers
        .countMonthlyByPartnership(p.id)
        .catch(() => 0),
    })),
  )
}

/**
 * Lista todos combos cadastrados na clinica · alimenta dropdown.
 * Mig 2026-04-27: combo virou select obrigatorio (era datalist · so trazia 1).
 */
export async function listAllCombosAction(): Promise<string[]> {
  const { repos } = await loadMiraServerContext()
  const combos = await repos.b2bVoucherCombos.list().catch(() => [])
  return combos
    .filter((c) => c.isActive)
    .map((c) => c.label)
    .sort()
}

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin', 'therapist', 'receptionist'].includes(role)) {
    throw new Error('Permissao insuficiente')
  }
}

/**
 * useActionState-compatible signature: (prevState, formData) => result.
 * Nunca lanca · sempre retorna EmitVoucherSingleResult pra UI decidir.
 * UI standalone (page) faz router.push em ok=true · UI modal fecha + push.
 */
export async function emitVoucherSingleAction(
  _prevState: EmitVoucherSingleResult | null,
  formData: FormData,
): Promise<EmitVoucherSingleResult> {
  let ctx, repos
  try {
    ;({ ctx, repos } = await loadMiraServerContext())
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Falha de contexto' }
  }
  if (ctx.role && !['owner', 'admin', 'therapist', 'receptionist'].includes(ctx.role)) {
    return { ok: false, error: 'Permissao insuficiente' }
  }

  const partnershipId = String(formData.get('partnership_id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const phoneRaw = String(formData.get('phone') || '').trim()
  const combo = String(formData.get('combo') || '').trim() || undefined
  const scheduledAtRaw = String(formData.get('scheduled_at') || '').trim()

  if (!partnershipId) return { ok: false, error: 'Parceria obrigatoria' }
  if (!name) return { ok: false, error: 'Nome obrigatorio' }

  const phone = normalizePhoneBR(phoneRaw)
  if (!phone) return { ok: false, error: `Telefone invalido: "${phoneRaw}" · use formato BR (10-11 digitos)` }

  let scheduledAt: string | undefined
  if (scheduledAtRaw) {
    const dt = new Date(scheduledAtRaw)
    if (isNaN(dt.getTime())) return { ok: false, error: 'Data agendamento invalida' }
    scheduledAt = dt.toISOString()
  }

  const submittedBy = `admin_user:${ctx.user_id || 'unknown'}`
  const result = await repos.voucherQueue.enqueue({
    partnershipId,
    items: [{ name, phone, combo }],
    scheduledAt,
    submittedBy,
  })

  if (!result.ok || !result.batchId) {
    return { ok: false, error: result.error || 'Erro ao enfileirar voucher' }
  }

  revalidatePath('/vouchers')
  revalidatePath('/vouchers/bulk')
  return { ok: true, batchId: result.batchId }
}
