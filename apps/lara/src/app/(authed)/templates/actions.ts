'use server'

/**
 * Server Actions · CRUD de templates.
 * ADR-012 · TemplateRepository.create/softDelete.
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'

export async function createTemplateAction(formData: FormData) {
  const { ctx, repos } = await loadServerReposContext()
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }

  const name = String(formData.get('name') || '').trim()
  const content = String(formData.get('content') || '').trim()
  const category = String(formData.get('category') || '').trim() || 'quick_reply'
  const sortOrder = Number(formData.get('sort_order') || 0)

  if (!name || !content) {
    throw new Error('Nome e mensagem obrigatorios')
  }

  await repos.templates.create(ctx.clinic_id, {
    name,
    content,
    category,
    sortOrder,
  })

  revalidatePath('/templates')
}

export async function deleteTemplateAction(id: string) {
  const { ctx, repos } = await loadServerReposContext()
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }

  await repos.templates.softDelete(ctx.clinic_id, id)

  revalidatePath('/templates')
}
