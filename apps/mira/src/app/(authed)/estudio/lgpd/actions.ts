'use server'

/**
 * Server Actions · /estudio/lgpd · anonimizacao + export.
 * RPCs ja em prod (clinic-dashboard mig 0769).
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function anonymizePartnershipAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '').trim()
  const reason = String(formData.get('reason') || '').trim()
  if (!id) throw new Error('id obrigatorio')
  if (reason.length < 5) throw new Error('Motivo obrigatorio (min 5 caracteres)')

  const result = await repos.b2bPartnerships.anonymize(id, reason)
  if (!result.ok) throw new Error(result.error || 'Erro ao anonimizar')

  revalidatePath('/b2b/config/meta')
  revalidatePath('/partnerships')
}
