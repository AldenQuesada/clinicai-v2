'use server'

/**
 * Server Actions · /partnerships/[id]
 *
 * Cobre status transition, account manager assign, voucher CRUD, comments CRUD.
 * Tudo restrito a owner/admin pra mutacoes.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { IssueVoucherInput } from '@clinicai/repositories'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

// ─── Status ───────────────────────────────────────────────────────────

const VALID_STATUSES = [
  'prospect',
  'dna_check',
  'contract',
  'active',
  'review',
  'paused',
  'closed',
] as const
type ValidStatus = (typeof VALID_STATUSES)[number]

export async function transitionStatusAction(
  partnershipId: string,
  newStatus: string,
  reason: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!(VALID_STATUSES as readonly string[]).includes(newStatus)) {
    return { ok: false, error: `Status invalido: ${newStatus}` }
  }
  const ok = await repos.b2bPartnerships.setStatus(
    partnershipId,
    newStatus as ValidStatus,
    reason || undefined,
  )
  revalidatePath(`/partnerships/${partnershipId}`)
  return { ok }
}

// ─── Account manager ──────────────────────────────────────────────────

export async function assignAccountManagerAction(
  partnershipId: string,
  manager: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bCollab.assign(partnershipId, manager)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}

// ─── Vouchers ─────────────────────────────────────────────────────────

export async function issueVoucherAction(
  input: IssueVoucherInput,
): Promise<{
  ok: boolean
  id?: string
  token?: string
  validUntil?: string
  error?: string
}> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bVouchers.issueWithDedup(input)
  revalidatePath(`/partnerships/${input.partnershipId}`)
  if (r.dedupHit) {
    const labels: Record<string, string> = {
      patient: 'paciente',
      voucher_recipient: 'beneficiária de outro voucher',
      partner_referral: 'indicação de outra parceira',
    }
    const where = labels[r.dedupHit.kind] || String(r.dedupHit.kind)
    return {
      ok: false,
      error: `Essa pessoa já está em nosso sistema como ${where}. Voucher NÃO foi emitido.`,
    }
  }
  return { ok: r.ok, id: r.id, token: r.token, validUntil: r.validUntil, error: r.error }
}

export async function cancelVoucherAction(
  voucherId: string,
  partnershipId: string,
  reason: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bVouchers.cancel(voucherId, reason)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}

export async function markVoucherDeliveredAction(
  voucherId: string,
  partnershipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bVouchers.markDelivered(voucherId)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}

// ─── Comments ─────────────────────────────────────────────────────────

export async function addCommentAction(
  partnershipId: string,
  body: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  // Comentarios podem ser feitos por qualquer profile autenticado · sem assert.
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'Comentario vazio' }

  // Author = primeiro nome do user (fallback pra "admin")
  let author = 'admin'
  try {
    if (ctx.user_id) {
      const profile = await repos.profiles.getById(ctx.user_id)
      author = profile?.firstName || 'admin'
    }
  } catch {
    // ignore
  }

  const r = await repos.b2bComments.add(partnershipId, author, trimmed)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}

export async function removeCommentAction(
  commentId: string,
  partnershipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bComments.remove(commentId)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}
