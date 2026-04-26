'use server'

/**
 * Server Actions · partnerships.
 * Restrito a owner/admin (mesmo padrao Lara/templates).
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import { revalidateB2BCache } from '@/lib/cached-queries'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function updatePartnershipBasicAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '')
  if (!id) throw new Error('id obrigatorio')

  const result = await repos.b2bPartnerships.updateBasicInfo(id, {
    contactName: String(formData.get('contactName') || '') || null,
    contactPhone: String(formData.get('contactPhone') || '') || null,
    contactEmail: String(formData.get('contactEmail') || '') || null,
    contactInstagram: String(formData.get('contactInstagram') || '') || null,
    pillar: String(formData.get('pillar') || '') || undefined,
    notes: String(formData.get('notes') || '') || null,
  })

  if (!result.ok) throw new Error(result.error || 'Erro ao atualizar')

  revalidatePath(`/partnerships/${id}`)
  revalidateB2BCache(ctx.clinic_id)
}

export async function approvePartnershipAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '')
  if (!id) throw new Error('id obrigatorio')

  const adminLabel = ctx.user_id || 'admin-ui'
  const result = await repos.b2bPartnerships.approve(id, adminLabel)
  if (!result.ok) throw new Error(result.error || 'Erro ao aprovar')

  revalidatePath(`/partnerships/${id}`)
  revalidatePath('/partnerships')
  revalidateB2BCache(ctx.clinic_id)
}

export async function setPartnershipStatusAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '')
  const status = String(formData.get('status') || '') as
    | 'active' | 'paused' | 'closed' | 'review' | 'dna_check' | 'contract' | 'prospect'
  const reason = String(formData.get('reason') || '') || undefined
  if (!id || !status) throw new Error('id e status obrigatorios')

  const ok = await repos.b2bPartnerships.setStatus(id, status, reason)
  if (!ok) throw new Error('Erro ao mudar status')

  revalidatePath(`/partnerships/${id}`)
  revalidatePath('/partnerships')
  revalidateB2BCache(ctx.clinic_id)
}
