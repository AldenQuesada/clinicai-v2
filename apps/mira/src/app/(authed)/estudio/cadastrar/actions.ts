'use server'

/**
 * Server Actions · /estudio/cadastrar · cria/edita parceria via wizard.
 * RPC b2b_partnership_upsert (idempotente por slug). Edit usa o id pra
 * preservar slug e historico.
 *
 * Helpers:
 *   - checkSlugAction(slug, excludeId)   · debounced no client
 *   - checkPhoneAction(phone, excludeId) · debounced no client
 *   - createPartnershipAction(formData)  · novo
 *   - updatePartnershipAction(id, fd)    · edicao
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'
import { normalizePhoneBR } from '@clinicai/utils'
import { slugify } from '@/lib/b2b-pillar-inference'

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

function csv(v: FormDataEntryValue | null): string[] {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function num(v: FormDataEntryValue | null, fallback: number | null = null): number | null {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v || '').trim()
  return s ? s : null
}

function buildPayload(formData: FormData, clinicId: string): Record<string, unknown> {
  const name = String(formData.get('name') || '').trim()
  const pillar = String(formData.get('pillar') || '').trim()

  const contactPhoneRaw = String(formData.get('contact_phone') || '').trim()
  const phone = contactPhoneRaw ? normalizePhoneBR(contactPhoneRaw) : ''
  if (contactPhoneRaw && !phone) {
    throw new Error(`Telefone invalido: "${contactPhoneRaw}"`)
  }

  return {
    clinic_id: clinicId,
    name,
    pillar,
    category: strOrNull(formData.get('category')),
    tier: num(formData.get('tier')),
    type: String(formData.get('type') || 'institutional'),
    status: String(formData.get('status') || 'prospect'),
    contact_name: strOrNull(formData.get('contact_name')),
    contact_phone: phone || null,
    contact_email: strOrNull(formData.get('contact_email')),
    contact_instagram: strOrNull(formData.get('contact_instagram')),
    contact_website: strOrNull(formData.get('contact_website')),

    dna_excelencia: num(formData.get('dna_excelencia')),
    dna_estetica: num(formData.get('dna_estetica')),
    dna_proposito: num(formData.get('dna_proposito')),

    voucher_combo: strOrNull(formData.get('voucher_combo')),
    voucher_validity_days: num(formData.get('voucher_validity_days'), 30),
    voucher_min_notice_days: num(formData.get('voucher_min_notice_days'), 15),
    voucher_monthly_cap: num(formData.get('voucher_monthly_cap'), 5),
    voucher_unit_cost_brl: num(formData.get('voucher_unit_cost_brl'), 0),
    voucher_delivery: csv(formData.get('voucher_delivery')),

    lat: num(formData.get('lat')),
    lng: num(formData.get('lng')),

    contrapartida: csv(formData.get('contrapartida')),
    contrapartida_cadence: strOrNull(formData.get('contrapartida_cadence')),

    contract_signed_date: strOrNull(formData.get('contract_signed_date')),
    contract_expiry_date: strOrNull(formData.get('contract_expiry_date')),
    renewal_notice_days: num(formData.get('renewal_notice_days'), 60),

    monthly_value_cap_brl: num(formData.get('monthly_value_cap_brl')),
    contract_duration_months: num(formData.get('contract_duration_months')),
    review_cadence_months: num(formData.get('review_cadence_months'), 3),
    sazonais: csv(formData.get('sazonais')),

    auto_playbook_enabled: formData.get('auto_playbook_enabled') === 'true',

    slogans: csv(formData.get('slogans')),
    narrative_quote: strOrNull(formData.get('narrative_quote')),
    narrative_author: strOrNull(formData.get('narrative_author')),
    emotional_trigger: strOrNull(formData.get('emotional_trigger')),

    involved_professionals: csv(formData.get('involved_professionals')),
    account_manager: strOrNull(formData.get('account_manager')),

    is_collective: formData.get('is_collective') === 'true',
    member_count: num(formData.get('member_count')),
    estimated_monthly_reach: num(formData.get('estimated_monthly_reach')),

    notes: strOrNull(formData.get('notes')),
  }
}

export async function checkSlugAction(
  slug: string,
  excludeId?: string,
): Promise<{ exists: boolean; partnershipName?: string; suggested?: string }> {
  const { repos } = await loadMiraServerContext()
  const r = await repos.b2bPartnerships.slugCheck(slug, excludeId)
  return {
    exists: r.exists,
    partnershipName: r.partnership?.name,
    suggested: r.suggested,
  }
}

export async function checkPhoneAction(
  phone: string,
  excludeId?: string,
): Promise<{ exists: boolean; matches: Array<{ id: string; name: string; status: string }> }> {
  const { repos } = await loadMiraServerContext()
  const phoneNorm = phone ? normalizePhoneBR(phone) : ''
  if (!phoneNorm) return { exists: false, matches: [] }
  const r = await repos.b2bPartnerships.phoneCheck(phoneNorm, excludeId)
  return {
    exists: r.exists,
    matches: r.matches.map((m) => ({ id: m.id, name: m.name, status: m.status })),
  }
}

export async function createPartnershipAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const name = String(formData.get('name') || '').trim()
  const pillar = String(formData.get('pillar') || '').trim()
  const slugRaw = String(formData.get('slug') || '').trim()

  if (!name) throw new Error('Nome obrigatorio')
  if (!pillar) throw new Error('Pilar obrigatorio')

  const slug = slugRaw || slugify(name)
  if (!slug) throw new Error('Slug invalido · digite manualmente')

  const payload = buildPayload(formData, ctx.clinic_id)

  const result = await repos.b2bPartnerships.upsert(slug, payload)
  if (!result.ok || !result.id) {
    throw new Error(result.error || 'Erro ao criar parceria')
  }

  revalidatePath('/partnerships')
  redirect(`/partnerships/${result.id}`)
}

export async function updatePartnershipAction(id: string, formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const name = String(formData.get('name') || '').trim()
  const pillar = String(formData.get('pillar') || '').trim()
  const slugRaw = String(formData.get('slug') || '').trim()

  if (!name) throw new Error('Nome obrigatorio')
  if (!pillar) throw new Error('Pilar obrigatorio')

  const existing = await repos.b2bPartnerships.getById(id)
  if (!existing) throw new Error('Parceria nao encontrada')

  const slug = slugRaw || existing.slug
  const payload = { ...buildPayload(formData, ctx.clinic_id), id }

  const result = await repos.b2bPartnerships.upsert(slug, payload)
  if (!result.ok) {
    throw new Error(result.error || 'Erro ao atualizar parceria')
  }

  revalidatePath('/partnerships')
  revalidatePath(`/partnerships/${id}`)
  redirect(`/partnerships/${id}`)
}
