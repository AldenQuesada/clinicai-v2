'use server'

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { ClinicDefaultsRaw } from '@clinicai/repositories'

function assertOwnerAdmin(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function upsertVoucherComboAction(payload: {
  id?: string
  label: string
  description?: string | null
  is_default?: boolean
  is_active?: boolean
  sort_order?: number
}) {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)
  const r = await repos.b2bVoucherCombos.upsert({
    id: payload.id,
    label: payload.label,
    description: payload.description ?? null,
    isDefault: !!payload.is_default,
    isActive: payload.is_active !== false,
    sortOrder: payload.sort_order ?? 100,
  })
  revalidatePath('/b2b/config/padroes')
  return r
}

export async function deleteVoucherComboAction(id: string) {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)
  const r = await repos.b2bVoucherCombos.remove(id)
  revalidatePath('/b2b/config/padroes')
  return r
}

export async function updateClinicDefaultsAction(payload: Partial<ClinicDefaultsRaw>) {
  const { ctx, repos } = await loadMiraServerContext()
  assertOwnerAdmin(ctx.role)
  const r = await repos.b2bClinicDefaults.update(payload)
  revalidatePath('/b2b/config/padroes')
  return r
}
