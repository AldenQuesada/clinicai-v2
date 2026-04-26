'use server'

/**
 * Server Actions · /partnerships/[id] · documentos legais
 *
 * issueLegalDocAction · cria request a partir de template + vars · retorna
 *   { ok, slug, token, link } pra montar URL publica /assinatura/<slug>.<token>.
 * revokeLegalDocAction · admin revoga (status='revoked').
 * getSignatureAction · busca assinatura ja gravada (modal "Visualizar").
 *
 * Restrito a owner/admin. Vinculo a parceria via convencao appointment_id=
 * "partnership:<id>" no repo.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import { LegalDocTemplateRepository } from '@clinicai/repositories'
import type { LegalDocSignatureDTO } from '@clinicai/repositories'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export interface IssueLegalDocInput {
  partnershipId: string
  templateId: string
  signerName: string
  signerCpf?: string | null
  signerPhone?: string | null
  /** Map pra merge {{variavel}} no template · valores literais (ja resolvidos
   *  client-side se necessario). Nome/CPF do signer sao adicionados auto. */
  variables?: Record<string, string | number | null | undefined>
  expiresHours?: number
}

export async function issueLegalDocAction(input: IssueLegalDocInput): Promise<{
  ok: boolean
  id?: string
  slug?: string
  token?: string
  link?: string
  error?: string
}> {
  const { ctx, repos, supabase } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  // Carrega template completo pra fazer merge da snapshot
  const tmpl = await repos.legalDocTemplates.getById(input.templateId)
  if (!tmpl) return { ok: false, error: 'Template nao encontrado' }
  if (!tmpl.isActive) return { ok: false, error: 'Template inativo' }

  // Merge variables · usa o helper estatico do repo
  const baseVars: Record<string, string | number | null | undefined> = {
    nome: input.signerName,
    cpf: input.signerCpf || '',
    data: new Date().toLocaleDateString('pt-BR'),
    ...(input.variables || {}),
  }
  const snapshot = LegalDocTemplateRepository.render(tmpl.content, baseVars)

  const r = await repos.legalDocRequests.issue({
    templateId: input.templateId,
    patientName: input.signerName,
    patientCpf: input.signerCpf ?? null,
    patientPhone: input.signerPhone ?? null,
    partnershipId: input.partnershipId,
    professionalName:
      typeof input.variables?.profissional === 'string'
        ? (input.variables.profissional as string)
        : null,
    contentSnapshot: snapshot,
    expiresHours: input.expiresHours ?? 168, // 7 dias pra parceria · vs 48h paciente
  })

  revalidatePath(`/partnerships/${input.partnershipId}`)
  if (!r.ok || !r.slug || !r.token) return { ok: false, error: r.error || 'falha ao emitir' }

  // Monta URL publica · formato `<slug>.<token>` num so segmento (ver page.tsx)
  // Tenta detectar host via supabase env · fallback pra path relativo.
  const publicHost =
    process.env.NEXT_PUBLIC_PUBLIC_HOST ||
    process.env.NEXT_PUBLIC_APP_HOST ||
    ''
  const path = `/assinatura/${r.slug}.${r.token}`
  const link = publicHost ? `${publicHost.replace(/\/$/, '')}${path}` : path

  // Suprime warning de unused supabase (pode ser util pra logs futuros)
  void supabase

  return { ok: true, id: r.id, slug: r.slug, token: r.token, link }
}

export async function revokeLegalDocAction(
  requestId: string,
  partnershipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  const r = await repos.legalDocRequests.revoke(requestId)
  revalidatePath(`/partnerships/${partnershipId}`)
  return r
}

export async function getSignatureAction(requestId: string): Promise<{
  ok: boolean
  data?: LegalDocSignatureDTO
  error?: string
}> {
  const { repos } = await loadMiraServerContext()
  // Sem assertCanManage · qualquer role autenticada da clinica pode visualizar.
  // RLS de legal_doc_signatures ja filtra por clinic_id via join legal_doc_requests.
  const sig = await repos.legalDocSignatures.getByRequest(requestId)
  if (!sig) return { ok: false, error: 'Assinatura nao encontrada' }
  return { ok: true, data: sig }
}
