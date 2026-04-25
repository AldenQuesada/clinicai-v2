'use server'

import { revalidatePath } from 'next/cache'
import { loadServerContext } from '@clinicai/supabase'

export async function createTemplateAction(formData: FormData) {
  const { supabase, ctx } = await loadServerContext()
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }

  const name = String(formData.get('name') || '').trim()
  const content = String(formData.get('content') || '').trim()
  const category = String(formData.get('category') || '').trim() || 'quick_reply'
  const sort_order = Number(formData.get('sort_order') || 0)

  if (!name || !content) {
    throw new Error('Nome e mensagem obrigatorios')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('wa_message_templates') as any).insert({
    clinic_id: ctx.clinic_id,
    name,
    content,
    message: content, // legacy column · mantem em sync
    category,
    sort_order,
    is_active: true,
    active: true,
    type: 'manual',
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60),
  })

  if (error) {
    throw new Error(`Falha ao criar template: ${error.message}`)
  }

  revalidatePath('/templates')
}

export async function deleteTemplateAction(id: string) {
  const { supabase, ctx } = await loadServerContext()
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }

  // Soft delete · marca is_active=false em vez de DELETE (audit-safe)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('wa_message_templates') as any)
    .update({ is_active: false, active: false })
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)

  if (error) {
    throw new Error(`Falha ao excluir: ${error.message}`)
  }

  revalidatePath('/templates')
}
