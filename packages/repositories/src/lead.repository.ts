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
import { mapLeadRow, type CreateLeadInput, type LeadDTO } from './types'

export class LeadRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Busca lead em qualquer variante de telefone (com/sem 9 inicial).
   * Caller passa `phoneVariants(phone)` ja calculado · package utils.
   */
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
    const row: Record<string, unknown> = {
      id: uuidv4(),
      clinic_id: clinicId,
      phone: input.phone,
      name: input.name ?? null,
      phase: input.phase ?? 'lead',
      temperature: input.temperature ?? 'warm',
      ai_persona: input.aiPersona ?? 'onboarder',
      funnel: input.funnel ?? null,
      created_at: new Date().toISOString(),
    }
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
