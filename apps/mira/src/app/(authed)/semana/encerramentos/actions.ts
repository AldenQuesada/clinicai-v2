'use server'

/**
 * Server Actions · /semana/encerramentos.
 * Reativar (closed → paused) e encerrar definitivo (active/paused → closed).
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function reactivatePartnershipAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '').trim()
  if (!id) throw new Error('id obrigatorio')

  const ok = await repos.b2bPartnerships.setStatus(id, 'paused', 'reactivated_via_ui')
  if (!ok) throw new Error('Erro ao reativar parceria')

  revalidatePath('/semana/encerramentos')
  revalidatePath('/partnerships')
}

export async function closePartnershipAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '').trim()
  if (!id) throw new Error('id obrigatorio')

  const ok = await repos.b2bPartnerships.setStatus(id, 'closed', 'closed_via_ui')
  if (!ok) throw new Error('Erro ao encerrar parceria')

  revalidatePath('/semana/encerramentos')
  revalidatePath('/partnerships')
}
