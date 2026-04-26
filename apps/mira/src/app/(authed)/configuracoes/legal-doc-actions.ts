'use server'

/**
 * Server Actions · /configuracoes · Templates de documentos legais
 *
 * upsertLegalTemplateAction · cria/atualiza template (admin/owner)
 * archiveLegalTemplateAction · soft-delete (deleted_at = now())
 *
 * Templates sao reutilizaveis entre parcerias e pacientes · admin define
 * variables (lista de chaves {{...}}) e o conteudo Markdown/HTML simples.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import type { LegalDocTemplateUpsertInput } from '@clinicai/repositories'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export interface LegalTemplateFormInput {
  id?: string
  name: string
  slug?: string
  docType: string
  content: string
  variables: string[]
  isActive: boolean
}

export async function upsertLegalTemplateAction(
  input: LegalTemplateFormInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  if (!input.name?.trim()) return { ok: false, error: 'Nome obrigatorio' }
  if (!input.content?.trim()) return { ok: false, error: 'Conteudo obrigatorio' }

  const payload: LegalDocTemplateUpsertInput = {
    id: input.id,
    name: input.name.trim(),
    slug: input.slug?.trim() || undefined,
    docType: input.docType || 'custom',
    content: input.content,
    variables: input.variables.length > 0 ? input.variables : undefined,
    isActive: input.isActive,
  }

  const r = await repos.legalDocTemplates.upsert(payload)
  revalidatePath('/configuracoes')
  return r
}

export async function archiveLegalTemplateAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.legalDocTemplates.archive(id)
  revalidatePath('/configuracoes')
  return r
}

export async function previewTemplateAction(
  content: string,
  variables: Record<string, string | null | undefined>,
): Promise<{ ok: boolean; rendered: string }> {
  // Pure render · pode rodar sem auth (mas guardamos pra consistencia)
  await loadMiraServerContext()
  const rendered = content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = variables[key]
    return v != null ? String(v) : ''
  })
  return { ok: true, rendered }
}
