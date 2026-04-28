/**
 * B2BPartnershipRepository · acesso canonico a b2b_partnerships.
 *
 * Schema canonico vive em clinic-dashboard mig 0270 (62 cols). Aqui exponhe
 * apenas o subconjunto que a Mira P0 precisa (read + status update + lookup
 * by phone). Lifecycle complexo (DNA gating, monthly_targets, content) entra
 * na P1 via UI admin.
 *
 * Boundary ADR-005 · DTO camelCase. Multi-tenant ADR-028 · clinicId explicito.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export interface B2BPartnershipDTO {
  id: string
  clinicId: string
  name: string
  slug: string
  type: 'transactional' | 'occasion' | 'institutional'
  pillar: string
  category: string | null
  tier: number | null
  status: 'prospect' | 'dna_check' | 'contract' | 'active' | 'review' | 'paused' | 'closed'
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  contactInstagram: string | null
  /** Site/website do parceiro · ex: "https://institucionalbarbara.com.br". */
  contactWebsite: string | null
  voucherCombo: string | null
  voucherValidityDays: number
  /** Antecedencia minima em dias pra agendar via voucher (default 15). */
  voucherMinNoticeDays: number
  voucherMonthlyCap: number | null
  /** Modos de entrega do voucher · ex: ['digital','impresso']. */
  voucherDelivery: string[]
  /** Custo unitario estimado (R$) por voucher resgatado · base do calculo de custo total. */
  voucherUnitCostBrl: number | null
  /** Duracao do contrato em meses · usado pra calcular renovacoes (default 12 quando null). */
  contractDurationMonths: number | null
  /** Cadencia de revisao em meses · default 3. */
  reviewCadenceMonths: number | null
  /** Teto mensal de valor (R$) da parceria · cost-cap warning. */
  monthlyValueCapBrl: number | null
  /** Sazonais (datas/eventos importantes) · ex: ['mes-mae','black-friday']. */
  sazonais: string[]
  /** DNA dimensoes · 3 notas 0-10 · null se nao avaliado. */
  dnaExcelencia: number | null
  dnaEstetica: number | null
  dnaProposito: number | null
  /** Score DNA · 0-10 (media das 3 dimensoes) · null se nao avaliado. */
  dnaScore: number | null
  /** Slogans curtos · pitch da parceria (1-3 frases). */
  slogans: string[]
  /** Quote narrativa principal · usado em dossie/painel publico. */
  narrativeQuote: string | null
  narrativeAuthor: string | null
  /** Gatilho emocional curto · usado em copy de Mira. */
  emotionalTrigger: string | null
  /** O que a parceira entrega em troca · array text. */
  contrapartida: string[]
  /** Cadencia da contrapartida · ex: 'mensal','trimestral'. */
  contrapartidaCadence: string | null
  /** Profissionais da clinica envolvidos · ex: ['mirian','marci']. */
  involvedProfessionals: string[]
  /** Coletivo (clube, grupo, igreja, etc) · habilita "Alcance do grupo". */
  isCollective: boolean
  /** Membros estimados se coletivo. */
  memberCount: number | null
  /** Alcance mensal estimado (people-month) se coletivo. */
  estimatedMonthlyReach: number | null
  /** Notas internas livres · so admin ve. */
  notes: string | null
  healthColor: 'unknown' | 'green' | 'yellow' | 'red'
  /** Account manager atribuido (label) · usado em handoff (mig 0xx). */
  accountManager: string | null
  /** Quando o accountManager atual foi atribuido. */
  assignedAt: string | null
  /** Token publico do painel da parceira (URL: /parceiro.html?t=). */
  publicToken: string | null
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPartnershipRow(row: any): B2BPartnershipDTO {
  // dnaScore = media das 3 notas (se ao menos uma existe)
  const dnaParts = [row.dna_excelencia, row.dna_estetica, row.dna_proposito]
    .map((v) => (v != null ? Number(v) : null))
    .filter((v): v is number => v != null)
  const dnaScore = dnaParts.length > 0
    ? dnaParts.reduce((a, b) => a + b, 0) / dnaParts.length
    : null
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    type: (row.type ?? 'institutional') as B2BPartnershipDTO['type'],
    pillar: String(row.pillar ?? 'outros'),
    category: row.category ?? null,
    tier: row.tier != null ? Number(row.tier) : null,
    status: (row.status ?? 'prospect') as B2BPartnershipDTO['status'],
    contactName: row.contact_name ?? null,
    contactPhone: row.contact_phone ?? null,
    contactEmail: row.contact_email ?? null,
    contactInstagram: row.contact_instagram ?? null,
    contactWebsite: row.contact_website ?? null,
    voucherCombo: row.voucher_combo ?? null,
    voucherValidityDays: Number(row.voucher_validity_days ?? 30),
    voucherMinNoticeDays: Number(row.voucher_min_notice_days ?? 15),
    voucherMonthlyCap: row.voucher_monthly_cap != null ? Number(row.voucher_monthly_cap) : null,
    voucherDelivery: Array.isArray(row.voucher_delivery) ? row.voucher_delivery : [],
    voucherUnitCostBrl:
      row.voucher_unit_cost_brl != null ? Number(row.voucher_unit_cost_brl) : null,
    contractDurationMonths:
      row.contract_duration_months != null ? Number(row.contract_duration_months) : null,
    reviewCadenceMonths:
      row.review_cadence_months != null ? Number(row.review_cadence_months) : null,
    monthlyValueCapBrl:
      row.monthly_value_cap_brl != null ? Number(row.monthly_value_cap_brl) : null,
    sazonais: Array.isArray(row.sazonais) ? row.sazonais : [],
    dnaExcelencia: row.dna_excelencia != null ? Number(row.dna_excelencia) : null,
    dnaEstetica: row.dna_estetica != null ? Number(row.dna_estetica) : null,
    dnaProposito: row.dna_proposito != null ? Number(row.dna_proposito) : null,
    dnaScore,
    slogans: Array.isArray(row.slogans) ? row.slogans : [],
    narrativeQuote: row.narrative_quote ?? null,
    narrativeAuthor: row.narrative_author ?? null,
    emotionalTrigger: row.emotional_trigger ?? null,
    contrapartida: Array.isArray(row.contrapartida) ? row.contrapartida : [],
    contrapartidaCadence: row.contrapartida_cadence ?? null,
    involvedProfessionals: Array.isArray(row.involved_professionals)
      ? row.involved_professionals
      : [],
    isCollective: row.is_collective === true,
    memberCount: row.member_count != null ? Number(row.member_count) : null,
    estimatedMonthlyReach:
      row.estimated_monthly_reach != null ? Number(row.estimated_monthly_reach) : null,
    notes: row.notes ?? null,
    healthColor: (row.health_color ?? 'unknown') as B2BPartnershipDTO['healthColor'],
    accountManager: row.account_manager ?? null,
    assignedAt: row.assigned_at ?? null,
    publicToken: row.public_token ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

function last8(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-8)
}

export class B2BPartnershipRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  async list(clinicId: string, filters: { status?: string; tier?: number; pillar?: string } = {}): Promise<B2BPartnershipDTO[]> {
    let q = this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('tier', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (filters.status) q = q.eq('status', filters.status)
    if (filters.tier != null) q = q.eq('tier', filters.tier)
    if (filters.pillar) q = q.eq('pillar', filters.pillar)

    const { data } = await q
    return (data ?? []).map(mapPartnershipRow)
  }

  async getById(id: string): Promise<B2BPartnershipDTO | null> {
    const { data } = await this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    return data ? mapPartnershipRow(data) : null
  }

  /**
   * Retorna o row cru (snake_case) pra preencher form de edicao.
   * Retorna null se parceria nao existe ou RLS bloqueia.
   */
  async getRawById(id: string): Promise<Record<string, unknown> | null> {
    const { data } = await this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    return (data as Record<string, unknown>) ?? null
  }

  async getBySlug(clinicId: string, slug: string): Promise<B2BPartnershipDTO | null> {
    const { data } = await this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('slug', slug)
      .maybeSingle()
    return data ? mapPartnershipRow(data) : null
  }

  /**
   * Lookup pelo phone do parceiro · usado pelo intent classifier pra resolver
   * "quem mandou essa msg". Match por last8 (BR phone com/sem 9 inicial).
   */
  async getByPartnerPhone(clinicId: string, phone: string): Promise<B2BPartnershipDTO | null> {
    const phoneLast8 = last8(phone)
    if (!phoneLast8) return null

    // Junta b2b_partnership_wa_senders ativos e devolve a parceria
    const { data } = await this.supabase.from('b2b_partnership_wa_senders')
      .select('partnership_id, b2b_partnerships(*)')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .eq('phone_last8', phoneLast8)
      .maybeSingle()

    const row = (data as { b2b_partnerships?: unknown })?.b2b_partnerships
    return row ? mapPartnershipRow(row) : null
  }

  async setStatus(id: string, status: B2BPartnershipDTO['status'], reason?: string): Promise<boolean> {
    const { data } = await this.supabase.rpc('b2b_partnership_set_status', {
      p_id: id,
      p_status: status,
      p_reason: reason ?? null,
    })
    return (data as { ok?: boolean })?.ok === true
  }

  /**
   * Lista parcerias "pendentes" (status: prospect | dna_check | contract) que
   * batem com `identifier` · slug exato, UUID exato, ou nome contendo. Usado
   * pelo handler admin.approve/reject pra resolver candidata via voz.
   *
   * Retorna [] se nada bate · caller decide tratamento (zero, um ou multi).
   */
  async findPendingByIdentifier(
    clinicId: string,
    identifier: string,
  ): Promise<B2BPartnershipDTO[]> {
    const ident = String(identifier || '').trim()
    if (!ident) return []

    const pendingStatuses = ['prospect', 'dna_check', 'contract'] as const

    // UUID exato → match direto
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ident)
    if (isUuid) {
      const { data } = await this.supabase
        .from('b2b_partnerships')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('id', ident)
        .in('status', pendingStatuses as unknown as string[])
      return (data ?? []).map(mapPartnershipRow)
    }

    // Slug exato
    const slug = ident.toLowerCase().replace(/\s+/g, '-')
    const { data: bySlug } = await this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('slug', slug)
      .in('status', pendingStatuses as unknown as string[])
    if (Array.isArray(bySlug) && bySlug.length > 0) {
      return bySlug.map(mapPartnershipRow)
    }

    // Nome ILIKE (parcial) · ordena por created_at desc, limit 10
    const { data: byName } = await this.supabase
      .from('b2b_partnerships')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('status', pendingStatuses as unknown as string[])
      .ilike('name', `%${ident}%`)
      .order('created_at', { ascending: false })
      .limit(10)
    return (byName ?? []).map(mapPartnershipRow)
  }

  /**
   * Aprova parceria · UPDATE status='active'. Trigger
   * trg_b2b_on_partnership_active (mig 800-03) auto-whitelista contact_phone
   * em b2b_partnership_wa_senders se for E.164.
   *
   * `byAdmin` e o phone do admin · gravado em audit (b2b_comm_dispatch_log
   * pelo handler caller).
   */
  async approve(id: string, byAdmin: string): Promise<{ ok: boolean; error?: string }> {
    const reason = byAdmin ? `approved_by:${byAdmin}` : 'approved_by_admin'
    const { data, error } = await this.supabase.rpc('b2b_partnership_set_status', {
      p_id: id,
      p_status: 'active',
      p_reason: reason,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: (data as { ok?: boolean })?.ok === true }
  }

  /**
   * Rejeita parceria · UPDATE status='closed' com reason gravado.
   * Schema canonico do clinic-dashboard nao tem status 'rejected' separado ·
   * 'closed' + reason='rejected:<motivo>' e a convencao operacional.
   */
  async reject(
    id: string,
    reason: string,
    byAdmin: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const reasonStr = `rejected:${reason || 'sem_motivo'}|by:${byAdmin || 'unknown'}`
    const { data, error } = await this.supabase.rpc('b2b_partnership_set_status', {
      p_id: id,
      p_status: 'closed',
      p_reason: reasonStr,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: (data as { ok?: boolean })?.ok === true }
  }

  /**
   * Lista comentarios de UMA parceria · ordenados por created_at DESC.
   * Usa RPC b2b_comments_list (clinic-dashboard mig 0300).
   */
  async listCommentsByPartnership(
    partnershipId: string,
  ): Promise<Array<{ id: string; authorName: string | null; body: string; createdAt: string }>> {
    const { data, error } = await this.supabase.rpc('b2b_comments_list', {
      p_partnership_id: partnershipId,
    })
    if (error || !Array.isArray(data)) return []
    return (data as Array<{ id: string; author_name: string | null; body: string; created_at: string }>).map((r) => ({
      id: String(r.id),
      authorName: r.author_name,
      body: String(r.body),
      createdAt: String(r.created_at),
    }))
  }

  /**
   * Lista comentarios CROSS-partnership da clinica · feed cronologico desc.
   * Inclui nome da parceria via inner join · usado pela view /semana/comentarios.
   * Best-effort: se RLS bloqueia ou tabela inexistente, retorna [].
   */
  async listRecentComments(
    clinicId: string,
    limit = 50,
  ): Promise<Array<{
    id: string
    partnershipId: string
    partnershipName: string
    authorName: string | null
    body: string
    createdAt: string
  }>> {
    try {
      const { data, error } = await this.supabase.from('b2b_partnership_comments')
        .select('id, partnership_id, author_name, body, created_at, b2b_partnerships(name)')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error || !Array.isArray(data)) return []
      return (data as Array<{
        id: string
        partnership_id: string
        author_name: string | null
        body: string
        created_at: string
        b2b_partnerships?: { name?: string }
      }>).map((r) => ({
        id: String(r.id),
        partnershipId: String(r.partnership_id),
        partnershipName: String(r.b2b_partnerships?.name ?? '—'),
        authorName: r.author_name,
        body: String(r.body),
        createdAt: String(r.created_at),
      }))
    } catch {
      return []
    }
  }

  /**
   * Remove comentario · usa RPC b2b_comment_delete.
   */
  async deleteComment(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_comment_delete', { p_id: id })
    if (error) return { ok: false, error: error.message }
    const result = data as { ok?: boolean; error?: string }
    return { ok: result?.ok === true, error: result?.error }
  }

  /**
   * Adiciona comentario livre na parceria · b2b_partnership_comments (clinic-
   * dashboard mig 0300). Usado pelo handler b2b-feedback-received pra registrar
   * feedback de parceira.
   *
   * Retorna { ok, id } ou { ok:false, error } via RPC b2b_comment_add.
   */
  async addComment(
    partnershipId: string,
    body: string,
    authorName?: string,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_comment_add', {
      p_partnership_id: partnershipId,
      p_author: authorName ?? null,
      p_body: body,
    })
    if (error) return { ok: false, error: error.message }
    const result = data as { ok?: boolean; id?: string; error?: string }
    return {
      ok: result?.ok === true,
      id: result?.id,
      error: result?.error,
    }
  }

  /**
   * Conta parcerias por filtros (status/pillar).
   */
  async count(
    clinicId: string,
    filters: { status?: string; pillar?: string } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('b2b_partnerships')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.pillar) q = q.eq('pillar', filters.pillar)
    const { count } = await q
    return count ?? 0
  }

  /**
   * Top performers nos ultimos N dias · ordena por count de attributions
   * (purchased | redeemed). Usado no dashboard B2B.
   *
   * Implementacao: agrega b2b_attributions por partnership_id e join nome.
   * Se RPC `b2b_top_performers` existir em prod, da pra trocar; por enquanto
   * fallback puro SQL.
   */
  async topPerformers30d(
    clinicId: string,
    limit = 5,
  ): Promise<Array<{ partnership: B2BPartnershipDTO; count: number }>> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await this.supabase.from('b2b_attributions')
      .select('partnership_id, b2b_partnerships(*)')
      .eq('clinic_id', clinicId)
      .gte('created_at', since)
    if (!Array.isArray(data)) return []
    const counts = new Map<string, { partnership: B2BPartnershipDTO; count: number }>()
    for (const row of data as Array<{ partnership_id: string; b2b_partnerships?: unknown }>) {
      if (!row.partnership_id || !row.b2b_partnerships) continue
      const existing = counts.get(row.partnership_id)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(row.partnership_id, {
          partnership: mapPartnershipRow(row.b2b_partnerships),
          count: 1,
        })
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  /**
   * Snapshot de saude da parceria · alertas ativos (cap_warning, zero_conversion,
   * inactive). Best-effort · se tabela `b2b_partnership_alerts` nao existir,
   * retorna [].
   */
  async healthSnapshot(
    partnershipId: string,
  ): Promise<Array<{ kind: string; severity: string; message: string; createdAt: string }>> {
    try {
      const { data, error } = await this.supabase.from('b2b_partnership_alerts')
        .select('alert_kind, severity, message, created_at')
        .eq('partnership_id', partnershipId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error || !Array.isArray(data)) return []
      return data.map((r: { alert_kind?: string; severity?: string; message?: string; created_at?: string }) => ({
        kind: String(r.alert_kind ?? 'unknown'),
        severity: String(r.severity ?? 'info'),
        message: String(r.message ?? ''),
        createdAt: String(r.created_at ?? new Date().toISOString()),
      }))
    } catch {
      return []
    }
  }

  /**
   * Update campos editaveis basicos · contato/observacoes. Restrito a owner/admin
   * pelo caller.
   */
  async updateBasicInfo(
    id: string,
    patch: {
      contactName?: string | null
      contactPhone?: string | null
      contactEmail?: string | null
      contactInstagram?: string | null
      pillar?: string
      notes?: string | null
    },
  ): Promise<{ ok: boolean; error?: string }> {
    const update: Record<string, unknown> = {}
    if (patch.contactName !== undefined) update.contact_name = patch.contactName
    if (patch.contactPhone !== undefined) update.contact_phone = patch.contactPhone
    if (patch.contactEmail !== undefined) update.contact_email = patch.contactEmail
    if (patch.contactInstagram !== undefined) update.contact_instagram = patch.contactInstagram
    if (patch.pillar !== undefined) update.pillar = patch.pillar
    if (patch.notes !== undefined) update.notes = patch.notes
    if (Object.keys(update).length === 0) return { ok: true }
    update.updated_at = new Date().toISOString()
    const { error } = await this.supabase
      .from('b2b_partnerships')
      .update(update)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Anonimiza PII da parceria · LGPD compliance (clinic-dashboard mig 0769).
   * Irreversivel · audita ANTES via RPC. Reason obrigatorio (min 5 chars).
   */
  async anonymize(
    partnershipId: string,
    reason: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_anonymize', {
      p_partnership_id: partnershipId,
      p_reason: reason,
    })
    if (error) return { ok: false, error: error.message }
    const result = data as { ok?: boolean; error?: string }
    return { ok: result?.ok === true, error: result?.error }
  }

  /**
   * Export full JSON da parceria pra direito de portabilidade (LGPD art 18 V).
   * Returns blob de dados ou null se nao encontrado.
   */
  async exportData(partnershipId: string): Promise<unknown | null> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_export_data', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    return data
  }

  /**
   * Lista metas/targets operacionais da parceria (b2b_partnership_metas).
   * RPC: b2b_partnership_targets_list (mig 800-35).
   */
  async listTargets(partnershipId: string): Promise<Array<{
    id: string
    kind: string
    target: number
    source: string | null
    created_at: string
  }>> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_targets_list', {
      p_partnership_id: partnershipId,
    })
    if (error) return []
    const r = data as { ok?: boolean; items?: Array<{
      id: string; kind: string; target: number; source: string | null; created_at: string
    }> } | null
    return Array.isArray(r?.items) ? r.items : []
  }

  /**
   * Lista eventos/exposicoes da parceria (b2b_group_exposures).
   * RPC: b2b_partnership_events_list (mig 800-35).
   */
  async listEvents(partnershipId: string): Promise<Array<{
    id: string
    event_type: string
    title: string
    date: string
    reach: number
    leads: number
    conversions: number | null
    cost: number | null
    notes: string | null
  }>> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_events_list', {
      p_partnership_id: partnershipId,
    })
    if (error) return []
    const r = data as { ok?: boolean; items?: Array<{
      id: string; event_type: string; title: string; date: string;
      reach: number; leads: number; conversions: number | null;
      cost: number | null; notes: string | null;
    }> } | null
    return Array.isArray(r?.items) ? r.items : []
  }

  /**
   * Lista posts/conteudos planejados (b2b_partnership_contents).
   * RPC: b2b_partnership_content_list (mig 800-35).
   */
  async listContent(partnershipId: string): Promise<Array<{
    id: string
    kind: string
    title: string
    schedule: string | null
    status: string
    source: string | null
    created_at: string
  }>> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_content_list', {
      p_partnership_id: partnershipId,
    })
    if (error) return []
    const r = data as { ok?: boolean; items?: Array<{
      id: string; kind: string; title: string; schedule: string | null;
      status: string; source: string | null; created_at: string;
    }> } | null
    return Array.isArray(r?.items) ? r.items : []
  }

  async upsert(slug: string, payload: Record<string, unknown>): Promise<{ id?: string; ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_upsert', {
      p_slug: slug,
      p_payload: payload,
    })
    if (error) return { ok: false, error: error.message }
    return {
      ok: (data as { ok?: boolean })?.ok === true,
      id: (data as { id?: string })?.id,
    }
  }

  /**
   * Dedup check de slug · usado pelo wizard antes do submit.
   * RPC b2b_partnership_slug_check (mig 800-18).
   */
  async slugCheck(
    slug: string,
    excludeId?: string,
  ): Promise<{ exists: boolean; partnership?: { id: string; name: string; status: string }; suggested?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_slug_check', {
      p_slug: slug,
      p_exclude_id: excludeId ?? null,
    })
    if (error) return { exists: false }
    const r = data as {
      exists?: boolean
      partnership?: { id: string; name: string; status: string }
      suggested?: string
    }
    return {
      exists: r?.exists === true,
      partnership: r?.partnership,
      suggested: r?.suggested,
    }
  }

  /**
   * Dedup check de telefone · warning (nao bloqueia) — contato compartilhado
   * pode ser legitimo. RPC b2b_partnership_phone_check (mig 800-18).
   */
  async phoneCheck(
    phone: string,
    excludeId?: string,
  ): Promise<{ exists: boolean; matches: Array<{ id: string; name: string; status: string; phone: string }> }> {
    const { data, error } = await this.supabase.rpc('b2b_partnership_phone_check', {
      p_phone: phone,
      p_exclude_id: excludeId ?? null,
    })
    if (error) return { exists: false, matches: [] }
    const r = data as {
      exists?: boolean
      matches?: Array<{ id: string; name: string; status: string; phone: string }>
    }
    return {
      exists: r?.exists === true,
      matches: Array.isArray(r?.matches) ? r.matches : [],
    }
  }
}
