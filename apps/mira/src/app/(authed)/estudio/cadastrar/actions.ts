'use server'

/**
 * Server Action · /estudio/cadastrar · cria parceria via wizard 3-step.
 * Chama b2b_partnership_upsert RPC (idempotente por slug) · redirect pro
 * detalhe da parceria criada.
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import { normalizePhoneBR } from '@clinicai/utils'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export async function createPartnershipAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const name = String(formData.get('name') || '').trim()
  const slugRaw = String(formData.get('slug') || '').trim()
  const contactName = String(formData.get('contact_name') || '').trim()
  const contactPhoneRaw = String(formData.get('contact_phone') || '').trim()
  const contactEmail = String(formData.get('contact_email') || '').trim() || null
  const instagram = String(formData.get('instagram') || '').trim() || null
  const pillar = String(formData.get('pillar') || '').trim()
  const dnaExcelencia = Number(formData.get('dna_excelencia') || 0)
  const dnaEstetica = Number(formData.get('dna_estetica') || 0)
  const dnaProposito = Number(formData.get('dna_proposito') || 0)
  const voucherCombo = String(formData.get('voucher_combo') || '').trim() || null
  const notes = String(formData.get('notes') || '').trim() || null

  if (!name) throw new Error('Nome obrigatorio')
  if (!pillar) throw new Error('Pilar obrigatorio')

  const slug = slugRaw || slugify(name)
  if (!slug) throw new Error('Slug invalido · digite manualmente')

  const phone = contactPhoneRaw ? normalizePhoneBR(contactPhoneRaw) : ''
  if (contactPhoneRaw && !phone) {
    throw new Error(`Telefone invalido: "${contactPhoneRaw}"`)
  }

  const payload: Record<string, unknown> = {
    clinic_id: ctx.clinic_id,
    name,
    pillar,
    contact_name: contactName || null,
    contact_phone: phone || null,
    contact_email: contactEmail,
    instagram,
    dna_excelencia: dnaExcelencia,
    dna_estetica: dnaEstetica,
    dna_proposito: dnaProposito,
    voucher_combo: voucherCombo,
    notes,
    status: 'prospect',
  }

  const result = await repos.b2bPartnerships.upsert(slug, payload)
  if (!result.ok || !result.id) {
    throw new Error(result.error || 'Erro ao criar parceria')
  }

  revalidatePath('/partnerships')
  redirect(`/partnerships/${result.id}`)
}
