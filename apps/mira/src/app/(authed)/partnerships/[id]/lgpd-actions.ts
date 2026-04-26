'use server'

/**
 * Server Actions LGPD · /partnerships/[id]
 *
 * Cobre 3 mutations · setConsent / exportData / anonymize.
 * Todas restritas a owner/admin.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { ConsentType } from '@clinicai/repositories'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function setConsentAction(
  partnershipId: string,
  type: ConsentType,
  granted: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bLgpd.consentSet(partnershipId, type, granted)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}

export async function exportLgpdDataAction(
  partnershipId: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const data = await repos.b2bLgpd.exportData(partnershipId)
  if (!data || data.ok === false) {
    return { ok: false, error: 'Falha ao exportar' }
  }
  return { ok: true, data }
}

export async function anonymizePartnershipAction(
  partnershipId: string,
  reason: string,
): Promise<{ ok: boolean; new_name?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: 'Motivo precisa ter ao menos 5 caracteres.' }
  }
  const r = await repos.b2bLgpd.anonymize(partnershipId, reason.trim())
  revalidatePath(`/partnerships/${partnershipId}`)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, new_name: r.new_name }
}
