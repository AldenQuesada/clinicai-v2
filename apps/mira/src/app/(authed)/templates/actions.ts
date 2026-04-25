'use server'

/**
 * Server Actions · b2b_comm_templates CRUD.
 * Restrito a owner/admin. UI em /templates.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function saveTemplateAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const id = String(formData.get('id') || '')
  const textTemplate = String(formData.get('textTemplate') || '')
  const audioScript = String(formData.get('audioScript') || '') || null
  const channelStr = String(formData.get('channel') || 'text') as 'text' | 'audio' | 'both'
  const isActive = String(formData.get('isActive') || 'true') === 'true'

  if (!id) throw new Error('id obrigatorio')

  await repos.b2bTemplates.update(id, {
    textTemplate: textTemplate || null,
    audioScript,
    channel: channelStr,
    isActive,
  })

  revalidatePath('/templates')
}

export async function createTemplateAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const eventKey = String(formData.get('eventKey') || '').trim()
  const channelStr = String(formData.get('channel') || 'text') as 'text' | 'audio' | 'both'
  const recipientStr = String(formData.get('recipientRole') || 'partner') as 'partner' | 'beneficiary' | 'admin'
  const textTemplate = String(formData.get('textTemplate') || '').trim()
  const audioScript = String(formData.get('audioScript') || '').trim() || null
  const senderInstance = String(formData.get('senderInstance') || 'mira-mirian')

  if (!eventKey) throw new Error('eventKey obrigatorio')

  await repos.b2bTemplates.create({
    clinicId: ctx.clinic_id,
    partnershipId: null,
    eventKey,
    channel: channelStr,
    recipientRole: recipientStr,
    textTemplate: textTemplate || null,
    audioScript,
    senderInstance,
    isActive: true,
    priority: 100,
  })

  revalidatePath('/templates')
}

export async function deleteTemplateById(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const id = String(formData.get('id') || '')
  if (!id) throw new Error('id obrigatorio')
  await repos.b2bTemplates.softDelete(id)
  revalidatePath('/templates')
}
