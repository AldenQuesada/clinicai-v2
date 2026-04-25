'use server'

/**
 * Server Actions · /configuracoes.
 * Restrito a owner/admin.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function updateChannelAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '')
  if (!id) throw new Error('id obrigatorio')

  const evolutionInstance = String(formData.get('evolutionInstance') || '') || null
  const isActive = String(formData.get('isActive') || 'true') === 'true'
  const notes = String(formData.get('notes') || '') || null

  const r = await repos.miraChannels.update(id, { evolutionInstance, isActive, notes })
  if (!r.ok) throw new Error(r.error || 'Erro ao atualizar canal')

  revalidatePath('/configuracoes')
}
