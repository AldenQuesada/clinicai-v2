'use server'

/**
 * Server Actions · Contrato + Atividades de parceria (mig 800-34).
 * Restrito a owner/admin.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import { revalidateB2BCache } from '@/lib/cached-queries'
import type {
  ContractUpsertInput,
  ActivityUpsertInput,
} from '@clinicai/repositories'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function upsertContractAction(
  payload: ContractUpsertInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bPartnershipContracts.upsertContract(payload)
  revalidatePath(`/partnerships/${payload.partnership_id}`)
  revalidateB2BCache(ctx.clinic_id)
  return r
}

export async function deleteContractAction(
  partnershipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bPartnershipContracts.deleteContract(partnershipId)
  revalidatePath(`/partnerships/${partnershipId}`)
  revalidateB2BCache(ctx.clinic_id)
  return r
}

export async function upsertActivityAction(
  payload: ActivityUpsertInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bPartnershipContracts.upsertActivity(payload)
  revalidatePath(`/partnerships/${payload.partnership_id}`)
  return r
}

export async function deleteActivityAction(
  id: string,
  partnershipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.b2bPartnershipContracts.deleteActivity(id)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}
