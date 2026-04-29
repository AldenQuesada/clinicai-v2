'use server'

/**
 * Server Actions · CRUD de templates · port 1:1 do clinic-dashboard
 * agenda-mensagens.js (8 tipos · day · active toggle).
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'

const VALID_TYPES = [
  'confirmacao',
  'lembrete',
  'engajamento',
  'boas_vindas',
  'consent_img',
  'consent_info',
  'manual',
] as const

function pickType(raw: string | null | undefined): string {
  if (raw && (VALID_TYPES as readonly string[]).includes(raw)) return raw
  return 'manual'
}

function pickDay(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (n < -90 || n > 365) return null
  return Math.floor(n)
}

function requireAdmin(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export async function createTemplateAction(formData: FormData) {
  const { ctx, repos } = await loadServerReposContext()
  requireAdmin(ctx.role)

  const name = String(formData.get('name') || '').trim()
  const content = String(formData.get('content') || '').trim()
  const category = String(formData.get('category') || '').trim() || 'quick_reply'
  const sortOrder = Number(formData.get('sort_order') || 0)
  const type = pickType(String(formData.get('type') || ''))
  const day = pickDay(String(formData.get('day') || ''))
  // Checkbox 'active' · presente = on, ausente = off
  const active = formData.get('active') !== null
  const triggerPhase = String(formData.get('trigger_phase') || '').trim() || null

  if (!name || !content) {
    throw new Error('Nome e mensagem obrigatorios')
  }

  await repos.templates.create(ctx.clinic_id, {
    name,
    content,
    category,
    sortOrder,
    type,
    day: day ?? undefined,
    active,
    triggerPhase,
  })

  revalidatePath('/templates')
}

export async function updateTemplateAction(id: string, formData: FormData) {
  const { ctx, repos } = await loadServerReposContext()
  requireAdmin(ctx.role)

  const name = String(formData.get('name') || '').trim()
  const content = String(formData.get('content') || '').trim()
  const category = String(formData.get('category') || '').trim() || undefined
  const sortOrderRaw = formData.get('sort_order')
  const sortOrder = sortOrderRaw !== null ? Number(sortOrderRaw) : undefined
  const type = pickType(String(formData.get('type') || ''))
  const day = pickDay(String(formData.get('day') || ''))
  const active = formData.get('active') !== null
  const triggerPhase = String(formData.get('trigger_phase') || '').trim() || null

  if (!name || !content) {
    throw new Error('Nome e mensagem obrigatorios')
  }

  await repos.templates.update(ctx.clinic_id, id, {
    name,
    content,
    category,
    sortOrder,
    type,
    day: day ?? undefined,
    active,
    triggerPhase,
  })

  revalidatePath('/templates')
}

export async function setTemplateActiveAction(id: string, active: boolean) {
  const { ctx, repos } = await loadServerReposContext()
  requireAdmin(ctx.role)
  await repos.templates.setActive(ctx.clinic_id, id, active)
  revalidatePath('/templates')
}

export async function deleteTemplateAction(id: string) {
  const { ctx, repos } = await loadServerReposContext()
  requireAdmin(ctx.role)
  await repos.templates.softDelete(ctx.clinic_id, id)
  revalidatePath('/templates')
}
