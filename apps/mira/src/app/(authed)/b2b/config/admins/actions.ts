'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BAdminPhoneInput } from '@clinicai/repositories'

function assertOwnerAdmin(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function upsertAdminPhoneAction(payload: B2BAdminPhoneInput) {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)
  const r = await repos.b2bAdminPhones.upsert(payload)
  revalidatePath('/b2b/config/admins')
  return r
}

export async function revokeAdminPhoneAction(phoneLast8: string) {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)
  const r = await repos.b2bAdminPhones.revoke(phoneLast8)
  revalidatePath('/b2b/config/admins')
  return r
}
