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

// ═══════════════════════════════════════════════════════════════════════
// Profissionais (Tab Profissionais · CRUD)
// ═══════════════════════════════════════════════════════════════════════

export async function registerProfessionalAction(payload: {
  phone: string
  professional_id: string
  label?: string | null
  access_scope?: 'own' | 'full'
  permissions?: {
    agenda?: boolean
    pacientes?: boolean
    financeiro?: boolean
    b2b?: boolean
    /** Per-message subscription overrides · undefined = subscribed */
    msg?: { [key: string]: boolean }
  }
}): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const digits = payload.phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) {
    return { ok: false, error: 'Telefone invalido (10-13 digitos)' }
  }
  if (!payload.professional_id) {
    return { ok: false, error: 'Profissional obrigatorio' }
  }

  const r = await repos.waNumbers.register({
    phone: digits,
    professional_id: payload.professional_id,
    label: payload.label ?? null,
    access_scope: payload.access_scope ?? 'own',
    permissions:
      payload.permissions ?? { agenda: true, pacientes: true, financeiro: true, b2b: true },
  })
  revalidatePath('/configuracoes')
  return { ok: r.ok, error: r.error }
}

export async function updateProfessionalAction(payload: {
  phone: string
  professional_id: string
  label?: string | null
  access_scope?: 'own' | 'full'
  permissions?: {
    agenda?: boolean
    pacientes?: boolean
    financeiro?: boolean
    b2b?: boolean
    msg?: { [key: string]: boolean }
  }
}): Promise<{ ok: boolean; error?: string }> {
  // wa_pro_register_number e upsert · reusa o mesmo path
  return registerProfessionalAction(payload)
}

export async function removeProfessionalAction(
  waNumberId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!waNumberId) return { ok: false, error: 'id obrigatorio' }
  const r = await repos.waNumbers.deactivate(waNumberId)
  revalidatePath('/configuracoes')
  return r
}

export async function resetProfessionalQuotaAction(
  professionalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)
  if (!professionalId) return { ok: false, error: 'professional_id obrigatorio' }
  const r = await repos.waNumbers.resetQuota(professionalId)
  revalidatePath('/configuracoes')
  return r
}
