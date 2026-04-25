'use server'

/**
 * Server Actions · /estudio/combos.
 * CRUD via 3 RPCs (b2b_voucher_combos_list / upsert / delete).
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function saveComboAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '').trim() || undefined
  const label = String(formData.get('label') || '').trim()
  const description = String(formData.get('description') || '').trim() || null
  const isDefault = String(formData.get('is_default') || 'false') === 'true'
  const isActive = String(formData.get('is_active') || 'true') === 'true'
  const sortOrder = Number(formData.get('sort_order') || 100)

  if (label.length < 2) throw new Error('Label deve ter pelo menos 2 caracteres')

  const result = await repos.b2bVoucherCombos.upsert({
    id,
    label,
    description,
    isDefault,
    isActive,
    sortOrder,
  })
  if (!result.ok) throw new Error(result.error || 'Erro ao salvar combo')

  revalidatePath('/estudio/combos')
}

export async function deleteComboAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '').trim()
  if (!id) throw new Error('id obrigatorio')

  const result = await repos.b2bVoucherCombos.remove(id)
  if (!result.ok) throw new Error(result.error || 'Erro ao remover combo')

  revalidatePath('/estudio/combos')
}
