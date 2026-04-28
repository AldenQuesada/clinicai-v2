/**
 * LeadRepository · acesso canonico a tabela `leads`.
 *
 * Multi-tenant ADR-028 · clinic_id e arg explicito em qualquer método que toca
 * varias linhas. Métodos por id (UUID unico) dispensam clinic_id porque a chave
 * primaria já cobre · mas o caller pode passar pra reforçar quando aplicavel.
 *
 * Boundary do ADR-005 · retorna LeadDTO em camelCase, nunca row bruto snake.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { phoneVariants } from '@clinicai/utils'
import {
  mapLeadRow,
  type CreateLeadInput,
  type DedupHit,
  type LeadDTO,
} from './types'

export class LeadRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Busca lead em qualquer variante de telefone (com/sem 9 inicial).
   * Caller passa `phoneVariants(phone)` ja calculado · package utils.
   */
  /**
   * Dedup global pre-emit voucher · varredura cross-tabela em paralelo.
   *
   * Retorna o "hit mais forte" (patient > lead > voucher_recipient > partner_referral).
   * Se nada bate, retorna null e o caller (b2b-emit-voucher) prossegue normal.
   *
   * Tabelas consultadas:
   *   - leads (separado em phase='patient' vs resto)
   *   - b2b_vouchers (recipient_phone)
   *   - b2b_attributions (via lead_id · join leads)
   *
   * Schema canonico vive no clinic-dashboard · clinicai-v2 nao tem tabela
   * `patients` separada (ADR REFACTOR_LEAD_MODEL: leads.phase='patient' e a
   * fonte de verdade). Quando a v2 ganhar tabela patients propria, expandir
   * aqui sem mudar contrato.
   *
   * `name` recebido apenas como sanity (nao bloqueia · phone que decide).
   *
   * @param clinicId  Multi-tenant ADR-028 · obrigatorio
   * @param phone     Telefone do recipient (qualquer formato · normaliza interno)
   * @param _name     Nome do recipient · reservado pra logging futuro
   */
  async findInAnySystem(
    clinicId: string,
    phone: string,
    _name?: string | null,
  ): Promise<DedupHit | null> {
    const variants = phoneVariants(phone)
    if (!variants.length) return null

    // 4 queries paralelas · todas filtradas por clinic_id (ADR-028)
    const [leadRes, voucherRes, attribRes] = await Promise.all([
      // Leads (qualquer phase) · pega created_at mais antigo
      this.supabase
        .from('leads')
        .select('id, name, phone, phase, created_at')
        .eq('clinic_id', clinicId)
        .in('phone', variants)
        .order('created_at', { ascending: true })
        .limit(5),
      // Vouchers · recipient_phone variants (qualquer status · evita re-emit)
      this.supabase
        .from('b2b_vouchers')
        .select('id, recipient_name, recipient_phone, partnership_id, issued_at')
        .eq('clinic_id', clinicId)
        .in('recipient_phone', variants)
        .order('issued_at', { ascending: true })
        .limit(5),
      // Attributions · join via lead_id (b2b_attributions nao tem phone direto)
      // Buscar leads.id por phone variants e checar attribution
      this.supabase
        .from('leads')
        .select('id, name, created_at, b2b_attributions(id, partnership_id, created_at)')
        .eq('clinic_id', clinicId)
        .in('phone', variants)
        .limit(5),
    ])

    // Hit candidato por kind · escolhe o mais forte
    const leadRows = (leadRes.data ?? []) as Array<{
      id: string
      name: string | null
      phone: string
      phase: string | null
      created_at: string
    }>

    // 1. patient (phase='patient' · prioridade maxima)
    const patientRow = leadRows.find((r) => r.phase === 'patient')
    if (patientRow) {
      return {
        kind: 'patient',
        id: String(patientRow.id),
        name: patientRow.name ?? null,
        phone: String(patientRow.phone ?? ''),
        since: patientRow.created_at ?? new Date().toISOString(),
      }
    }

    // 2. lead (qualquer phase != patient · pega o mais antigo)
    if (leadRows.length > 0) {
      const r = leadRows[0]
      return {
        kind: 'lead',
        id: String(r.id),
        name: r.name ?? null,
        phone: String(r.phone ?? ''),
        since: r.created_at ?? new Date().toISOString(),
      }
    }

    // 3. voucher_recipient · indicada antes (status irrelevante)
    const voucherRows = (voucherRes.data ?? []) as Array<{
      id: string
      recipient_name: string | null
      recipient_phone: string | null
      partnership_id: string | null
      issued_at: string
    }>
    if (voucherRows.length > 0) {
      // Mais antigo · oldest first ja ordenado
      const v = voucherRows[0]
      // Resolve partnership name best-effort · 1 query simples
      let partnershipName: string | null = null
      if (v.partnership_id) {
        const { data: p } = await this.supabase
          .from('b2b_partnerships')
          .select('name')
          .eq('id', v.partnership_id)
          .maybeSingle()
        partnershipName = (p as { name?: string } | null)?.name ?? null
      }
      return {
        kind: 'voucher_recipient',
        id: String(v.id),
        name: v.recipient_name ?? null,
        phone: String(v.recipient_phone ?? ''),
        since: v.issued_at ?? new Date().toISOString(),
        partnershipName,
      }
    }

    // 4. partner_referral · attribution via lead.id que nao caiu em (1)/(2)
    //    Esse caminho cobre o edge: lead foi removido fisicamente mas
    //    attribution sobrou (raro · soft delete). Em pratica, se chegou aqui
    //    e nao tinha lead, attribution tambem nao existe. Mantemos o ramo
    //    consistente com o contrato.
    const attribRows = (attribRes.data ?? []) as Array<{
      id: string
      name: string | null
      created_at: string
      b2b_attributions: Array<{
        id: string
        partnership_id: string | null
        created_at: string
      }> | null
    }>
    for (const r of attribRows) {
      const attribs = Array.isArray(r.b2b_attributions) ? r.b2b_attributions : []
      if (attribs.length > 0) {
        const a = attribs[0]
        let partnershipName: string | null = null
        if (a.partnership_id) {
          const { data: p } = await this.supabase
            .from('b2b_partnerships')
            .select('name')
            .eq('id', a.partnership_id)
            .maybeSingle()
          partnershipName = (p as { name?: string } | null)?.name ?? null
        }
        return {
          kind: 'partner_referral',
          id: String(r.id),
          name: r.name ?? null,
          phone: variants[0],
          since: a.created_at ?? r.created_at ?? new Date().toISOString(),
          partnershipName,
        }
      }
    }

    return null
  }

  async findByPhoneVariants(clinicId: string, variants: string[]): Promise<LeadDTO | null> {
    if (!variants.length) return null
    const { data } = await this.supabase
      .from('leads')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data ? mapLeadRow(data) : null
  }

  /**
   * Cria lead novo · retorna DTO ou null se insert falhou.
   * Phase default 'lead', persona 'onboarder' (alinhado com webhook legacy).
   *
   * `source` e `tags` opcionais · usados pela Mira B2B pra discriminar origem
   * (b2b_partnership_referral, b2b_admin_registered · ver mig 800-01) e marcar
   * indicacoes com slug da parceria.
   */
  async create(clinicId: string, input: CreateLeadInput): Promise<LeadDTO | null> {
    // BUG FIX 2026-04-28: tabela leads tem várias colunas NOT NULL com default
    // (funnel='procedimentos', name='', source='manual', etc). Passar null
    // explícito viola NOT NULL · omitimos pra DB usar default.
    const row: Record<string, unknown> = {
      id: uuidv4(),
      clinic_id: clinicId,
      phone: input.phone,
      phase: input.phase ?? 'lead',
      temperature: input.temperature ?? 'warm',
      ai_persona: input.aiPersona ?? 'onboarder',
      created_at: new Date().toISOString(),
    }
    if (input.name) row.name = input.name
    if (input.funnel) row.funnel = input.funnel
    if (input.source) row.source = input.source
    if (Array.isArray(input.tags) && input.tags.length > 0) row.tags = input.tags

    const { data, error } = await this.supabase
      .from('leads')
      .insert(row)
      .select()
      .single()

    if (error || !data) return null
    return mapLeadRow(data)
  }

  async updateScore(leadId: string, score: number): Promise<void> {
    await this.supabase.from('leads').update({ lead_score: score }).eq('id', leadId)
  }

  /**
   * Append-only · soma novas tags as existentes (dedup) e devolve set final.
   * Retorna [] se algo falhar · caller decide se trata como erro.
   */
  async addTags(leadId: string, newTags: string[]): Promise<string[]> {
    if (!newTags.length) return []

    const { data: row } = await this.supabase
      .from('leads')
      .select('tags')
      .eq('id', leadId)
      .single()

    const existing: string[] = Array.isArray(row?.tags) ? row.tags : []
    const merged = Array.from(new Set([...existing, ...newTags]))

    if (merged.length === existing.length) return existing

    await this.supabase.from('leads').update({ tags: merged }).eq('id', leadId)
    return merged
  }

  async setFunnel(
    leadId: string,
    funnel: 'olheiras' | 'fullface' | 'procedimentos',
  ): Promise<void> {
    await this.supabase.from('leads').update({ funnel }).eq('id', leadId)
  }

  async getTags(leadId: string): Promise<string[]> {
    const { data } = await this.supabase
      .from('leads')
      .select('tags')
      .eq('id', leadId)
      .single()
    return Array.isArray(data?.tags) ? (data.tags as string[]) : []
  }

  async updateLastResponseAt(leadId: string, when?: string): Promise<void> {
    await this.supabase
      .from('leads')
      .update({ last_response_at: when ?? new Date().toISOString() })
      .eq('id', leadId)
  }

  /**
   * Conta leads · suporta filtro opcional por funnel ou createdSince (dashboard).
   */
  async count(
    clinicId: string,
    filter: { funnel?: string; createdSince?: string } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)

    if (filter.funnel) q = q.eq('funnel', filter.funnel)
    if (filter.createdSince) q = q.gte('created_at', filter.createdSince)

    const { count } = await q
    return count ?? 0
  }

  /**
   * Breakdown por funnel · 1 query por funil (head:true · barato).
   * Returns Record<funnel, count>.
   */
  async countByFunnels(
    clinicId: string,
    funnels: string[],
  ): Promise<Record<string, number>> {
    const entries = await Promise.all(
      funnels.map(async (f) => [f, await this.count(clinicId, { funnel: f })] as const),
    )
    return Object.fromEntries(entries)
  }

  /**
   * Busca leads por lista de telefones · usado pelo /api/conversations join.
   * Retorna lookup map (phone -> DTO) pra evitar N+1 no caller.
   */
  async findByPhones(clinicId: string, phones: string[]): Promise<Map<string, LeadDTO>> {
    const map = new Map<string, LeadDTO>()
    if (!phones.length) return map

    const { data } = await this.supabase
      .from('leads')
      .select('id, name, phone, phase, temperature, funnel, queixas_faciais, ai_persona, lead_score, tags, clinic_id, idade, day_bucket, last_response_at, created_at')
      .eq('clinic_id', clinicId)
      .in('phone', phones)

    for (const row of (data ?? [])) {
      const dto = mapLeadRow(row)
      map.set(dto.phone, dto)
    }
    return map
  }

  /**
   * Conta leads sem update ha mais de N dias · cron mira-inactivity-radar.
   */
  async countInactiveSince(clinicId: string, sinceIso: string): Promise<number> {
    const { count } = await this.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .lt('updated_at', sinceIso)
    return count ?? 0
  }

  /**
   * Lista leads aniversariantes do dia (mes/dia matching). Usado pelo cron
   * mira-birthday-alerts. Schema permissivo · birthday pode ser texto/jsonb/date.
   */
  async listBirthdaysOfDay(
    clinicId: string,
    monthDd: string,
    limit = 20,
  ): Promise<Array<{ name: string | null; phone: string; birthday: string | null }>> {
    const { data } = await this.supabase
      .from('leads')
      .select('name, phone, birthday')
      .eq('clinic_id', clinicId)
      .like('birthday', `%-${monthDd}`)
      .limit(limit)
    return ((data ?? []) as Array<{ name?: string; phone?: string; birthday?: string }>).map((r) => ({
      name: r.name ?? null,
      phone: String(r.phone ?? ''),
      birthday: r.birthday ?? null,
    }))
  }
}
