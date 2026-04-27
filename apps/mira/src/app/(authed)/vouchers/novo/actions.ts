'use server'

/**
 * Server Action · /vouchers/novo · emit single rapido.
 *
 * Reusa 100% da infra de queue + dispatch + tracking · enqueue com items=[1].
 * Redirect pra /vouchers/bulk/[batchId] pra acompanhar dispatch.
 *
 * Validacoes:
 *   - parceria selecionada (required)
 *   - nome trim nao vazio
 *   - phone passa pelo normalizePhoneBR (10-13 digitos BR)
 *   - scheduled_at opcional (default: agora)
 *
 * Mesmo PREVIEW_COOKIE NAO usado · single eh sync direto na queue.
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { normalizePhoneBR } from '@clinicai/utils'
import { loadMiraServerContext } from '@/lib/server-context'
import type { PartnershipOption } from './SingleVoucherForm'

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

export async function emitVoucherSingleAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const partnershipId = String(formData.get('partnership_id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const phoneRaw = String(formData.get('phone') || '').trim()
  const combo = String(formData.get('combo') || '').trim() || undefined
  const scheduledAtRaw = String(formData.get('scheduled_at') || '').trim()

  if (!partnershipId) throw new Error('Parceria obrigatoria')
  if (!name) throw new Error('Nome obrigatorio')

  const phone = normalizePhoneBR(phoneRaw)
  if (!phone) throw new Error(`Telefone invalido: "${phoneRaw}" · use formato BR (10-11 digits)`)

  let scheduledAt: string | undefined
  if (scheduledAtRaw) {
    const dt = new Date(scheduledAtRaw)
    if (isNaN(dt.getTime())) throw new Error('Data agendamento invalida')
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
    throw new Error(result.error || 'Erro ao enfileirar voucher')
  }

  revalidatePath('/vouchers')
  revalidatePath('/vouchers/bulk')
  redirect(`/vouchers/bulk/${result.batchId}`)
}
