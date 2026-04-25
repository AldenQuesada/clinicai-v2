'use server'

/**
 * Server Actions · /semana/comentarios.
 * Add e delete comment via repo.addComment / repo.deleteComment.
 *
 * ACL · F.1.1 audit fix: comentarios sao internos da clinica · so quem
 * tem assento na operacao (owner/admin/therapist/receptionist) pode
 * postar ou remover. Viewer fica read-only.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

const ALLOWED_ROLES = ['owner', 'admin', 'therapist', 'receptionist']

function assertCanComment(role: string | null | undefined) {
  if (role && !ALLOWED_ROLES.includes(role)) {
    throw new Error('Permissao insuficiente · viewer nao pode comentar')
  }
}

export async function addCommentAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  if (!ctx.user_id) throw new Error('Sem user logado')
  assertCanComment(ctx.role)

  const partnershipId = String(formData.get('partnership_id') || '').trim()
  const body = String(formData.get('body') || '').trim()
  const authorName = String(formData.get('author_name') || '').trim() || undefined

  if (!partnershipId) throw new Error('partnership_id obrigatorio')
  if (!body) throw new Error('Comentario nao pode estar vazio')

  const result = await repos.b2bPartnerships.addComment(partnershipId, body, authorName)
  if (!result.ok) throw new Error(result.error || 'Erro ao salvar comentario')

  revalidatePath('/semana/comentarios')
  revalidatePath(`/partnerships/${partnershipId}`)
}

export async function deleteCommentAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  if (!ctx.user_id) throw new Error('Sem user logado')
  // Delete eh mais sensivel · so owner/admin pode remover (audit trail).
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin pode remover comentarios')
  }

  const id = String(formData.get('id') || '').trim()
  if (!id) throw new Error('id obrigatorio')

  const result = await repos.b2bPartnerships.deleteComment(id)
  if (!result.ok) throw new Error(result.error || 'Erro ao remover comentario')

  revalidatePath('/semana/comentarios')
}
