/**
 * OrcamentoRepository · acesso canonico a tabela `orcamentos` (mig 63).
 *
 * Multi-tenant ADR-028. Boundary do ADR-005 · retorna OrcamentoDTO em
 * camelCase, nunca row bruto snake. NAO confundir com `BudgetRepository`
 * (cost control IA, en-US naming).
 *
 * Subject dual igual appointments: lead_id ou patient_id (CHECK
 * chk_orc_subject_xor garante exatamente um). Criacao normalmente vem via
 * `lead_to_orcamento()` RPC (chamada por LeadRepository.toOrcamento ou
 * por appointment_finalize com outcome=orcamento). UPDATEs de status
 * (sent/viewed/approved/lost) e payments ficam aqui.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  mapOrcamentoRow,
  orcamentoItemsToDbShape,
  type OrcamentoDTO,
  type OrcamentoItem,
  type OrcamentoPayment,
  type OrcamentoStatus,
  type UpdateOrcamentoInput,
} from './types'

/**
 * Candidato retornado pelo picker do cron orcamento-followup (mig 82).
 *
 * Bucket determina template usado pelo worker:
 *   - 'expiring_soon' (<=1 dia)  · "ultima chance"
 *   - 'expiring'      (2-4 dias) · "vence em Xd, fica seu valor?"
 *   - 'recent'        (5-7 dias) · "tudo bem com a proposta?"
 */
export interface OrcamentoFollowupCandidateDTO {
  orcamentoId: string
  clinicId: string
  leadId: string | null
  patientId: string | null
  title: string | null
  total: number
  validUntil: string // YYYY-MM-DD
  shareToken: string | null
  bucket: 'recent' | 'expiring' | 'expiring_soon'
  daysToExpire: number
}

const ORC_COLUMNS =
  'id, clinic_id, lead_id, patient_id, number, title, notes, items, ' +
  'subtotal, discount, total, status, sent_at, viewed_at, approved_at, ' +
  'lost_at, lost_reason, valid_until, payments, share_token, created_by, ' +
  'created_at, updated_at, deleted_at'

const TERMINAL_STATUSES: OrcamentoStatus[] = ['approved', 'lost']

export class OrcamentoRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  async getById(id: string): Promise<OrcamentoDTO | null> {
    const { data } = await this.supabase
      .from('orcamentos')
      .select(ORC_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    return data ? mapOrcamentoRow(data) : null
  }

  /**
   * Acesso publico via share_token · usado por /orcamento/<token> sem JWT.
   * RLS bloqueia anon, entao caller deve estar usando service_role
   * (Server Action publica) ou ter seu proprio JWT de clinic. Esse repo
   * apenas escreve a query · seguranca eh do caller.
   *
   * Atualiza viewed_at na primeira leitura (idempotente).
   */
  async getByShareToken(
    clinicId: string,
    token: string,
    opts: { markViewed?: boolean } = {},
  ): Promise<OrcamentoDTO | null> {
    if (!token || token.length < 8) return null
    const { data } = await this.supabase
      .from('orcamentos')
      .select(ORC_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('share_token', token)
      .is('deleted_at', null)
      .maybeSingle()

    if (!data) return null
    const dto = mapOrcamentoRow(data)

    if (opts.markViewed && !dto.viewedAt) {
      await this.supabase
        .from('orcamentos')
        .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
        .eq('id', dto.id)
        .eq('status', 'sent')
      // Best-effort: so move se status era 'sent' (nao reverte 'approved' etc).
    }
    return dto
  }

  /**
   * Busca por share_token SEM clinic_id · USAR SO com service_role (BYPASSA
   * RLS). Pra pagina publica /orcamento/<token> onde o caller eh anonimo e o
   * proprio token serve de auth. Token gerado como UUID v4 · colisao
   * praticamente impossivel; index UNIQUE (clinic_id, share_token) nao
   * impede dois clinics com mesmo token (raro), entao .limit(1) defensivo.
   *
   * `markViewed` move sent→viewed na primeira leitura (idempotente).
   */
  async getByShareTokenGlobal(
    token: string,
    opts: { markViewed?: boolean } = {},
  ): Promise<OrcamentoDTO | null> {
    if (!token || token.length < 8) return null
    const { data } = await this.supabase
      .from('orcamentos')
      .select(ORC_COLUMNS)
      .eq('share_token', token)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!data) return null
    const dto = mapOrcamentoRow(data)

    if (opts.markViewed && !dto.viewedAt) {
      await this.supabase
        .from('orcamentos')
        .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
        .eq('id', dto.id)
        .eq('status', 'sent')
    }
    return dto
  }

  /**
   * Garante share_token presente · idempotente. Se ja tem, retorna
   * existente (nao gera novo, evita revogacao acidental). Senao gera UUID
   * v4 e UPDATEa. Token vai pra URL publica `/orcamento/<token>`.
   */
  async ensureShareToken(id: string): Promise<string | null> {
    const current = await this.getById(id)
    if (!current) return null
    if (current.shareToken) return current.shareToken

    const newToken = crypto.randomUUID()
    const { error } = await this.supabase
      .from('orcamentos')
      .update({ share_token: newToken })
      .eq('id', id)
      .is('share_token', null) // race-safe: so seta se ainda null
    if (error) return null

    // Re-fetch caso outra request tenha setado entre o getById e o UPDATE
    const refetch = await this.getById(id)
    return refetch?.shareToken ?? null
  }

  /**
   * Lista orcamentos da clinica · paginada, ordenada por created_at desc.
   * Filtro por status opcional. `openOnly=true` exclui approved/lost.
   * Filtros adicionais: createdFrom/createdTo (YYYY-MM-DD inclusive),
   * search (case-insensitive em title).
   */
  async list(
    clinicId: string,
    opts: {
      limit?: number
      offset?: number
      status?: OrcamentoStatus
      openOnly?: boolean
      createdFrom?: string
      createdTo?: string
      search?: string
    } = {},
  ): Promise<OrcamentoDTO[]> {
    const limit = Math.min(opts.limit ?? 50, 500)
    const offset = opts.offset ?? 0
    let q = this.supabase
      .from('orcamentos')
      .select(ORC_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (opts.status) q = q.eq('status', opts.status)
    if (opts.openOnly) q = q.not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
    if (opts.createdFrom) q = q.gte('created_at', `${opts.createdFrom}T00:00:00`)
    if (opts.createdTo) q = q.lte('created_at', `${opts.createdTo}T23:59:59`)
    if (opts.search && opts.search.trim().length > 0) {
      // ilike percent-escape · ` % _ \ ` quebrariam o pattern
      const safe = opts.search.replace(/([\\%_])/g, '\\$1').trim()
      q = q.ilike('title', `%${safe}%`)
    }

    const { data } = await q
    return ((data ?? []) as unknown[]).map(mapOrcamentoRow)
  }

  /**
   * Lista orcamentos de um subject (lead OU patient) · timeline na
   * pagina do paciente/lead.
   */
  async listBySubject(
    clinicId: string,
    subject: { leadId?: string | null; patientId?: string | null },
    opts: { limit?: number } = {},
  ): Promise<OrcamentoDTO[]> {
    if (!subject.leadId && !subject.patientId) return []
    const limit = Math.min(opts.limit ?? 100, 500)
    const col = subject.leadId ? 'lead_id' : 'patient_id'
    const value = subject.leadId ?? subject.patientId
    const { data } = await this.supabase
      .from('orcamentos')
      .select(ORC_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq(col, value as string)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    return ((data ?? []) as unknown[]).map(mapOrcamentoRow)
  }

  /**
   * Followups vencendo · cron diario. Status enviados/visualizados/em
   * negociacao com valid_until <= today.
   */
  async listFollowupsDue(clinicId: string, today: string): Promise<OrcamentoDTO[]> {
    const { data } = await this.supabase
      .from('orcamentos')
      .select(ORC_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .in('status', ['sent', 'viewed', 'followup', 'negotiation'])
      .lte('valid_until', today)
      .order('valid_until', { ascending: true })
    return ((data ?? []) as unknown[]).map(mapOrcamentoRow)
  }

  /**
   * Conta por status · widget dashboard.
   */
  async countByStatus(clinicId: string, status: OrcamentoStatus): Promise<number> {
    const { count } = await this.supabase
      .from('orcamentos')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', status)
      .is('deleted_at', null)
    return count ?? 0
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * UPDATE generico (campos editaveis em rascunho/negociacao). Quando
   * `items` ou `subtotal/discount` mudam, recalcula `total` aqui mesmo
   * (CHECK chk_orc_total_consistency exige coerencia ate 0.01).
   *
   * NOTA: NAO usar pra mover pra approved/lost · use `markApproved` /
   * `markLost` que tem side-effects (timestamps + reason validacao).
   */
  async update(id: string, input: UpdateOrcamentoInput): Promise<OrcamentoDTO | null> {
    const row: Record<string, unknown> = {}
    if (input.title !== undefined) row.title = input.title
    if (input.notes !== undefined) row.notes = input.notes
    if (input.validUntil !== undefined) row.valid_until = input.validUntil
    if (input.shareToken !== undefined) row.share_token = input.shareToken
    if (input.payments !== undefined) row.payments = input.payments

    // Items + valores: se um veio, recalcula total (cliente nao manda total
    // desalinhado). Caller pode passar `total` explicito se quiser override
    // mas precisa bater (CHECK garante).
    if (input.items !== undefined) {
      row.items = orcamentoItemsToDbShape(input.items)
    }
    if (input.subtotal !== undefined || input.discount !== undefined) {
      // Precisa do estado atual pra recalcular total se so um veio
      const current = await this.getById(id)
      if (!current) return null
      const sub = input.subtotal ?? current.subtotal
      const disc = input.discount ?? current.discount
      row.subtotal = sub
      row.discount = disc
      row.total = Math.max(0, sub - disc)
    }
    if (input.total !== undefined) row.total = input.total

    // Outros estados (sent/viewed/approved/lost vem via dedicated methods abaixo)
    if (input.status !== undefined) row.status = input.status
    if (input.sentAt !== undefined) row.sent_at = input.sentAt
    if (input.viewedAt !== undefined) row.viewed_at = input.viewedAt
    if (input.approvedAt !== undefined) row.approved_at = input.approvedAt
    if (input.lostAt !== undefined) row.lost_at = input.lostAt
    if (input.lostReason !== undefined) row.lost_reason = input.lostReason

    if (Object.keys(row).length === 0) return this.getById(id)

    const { data, error } = await this.supabase
      .from('orcamentos')
      .update(row)
      .eq('id', id)
      .select(ORC_COLUMNS)
      .single()
    if (error || !data) return null
    return mapOrcamentoRow(data)
  }

  /**
   * Marca como enviado · status='sent', sent_at=now.
   */
  async markSent(id: string): Promise<OrcamentoDTO | null> {
    const { data, error } = await this.supabase
      .from('orcamentos')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
      .select(ORC_COLUMNS)
      .single()
    if (error || !data) return null
    return mapOrcamentoRow(data)
  }

  /**
   * Marca como aprovado. Caller deve chamar `LeadRepository.toPaciente(...)`
   * em seguida se quiser converter o lead em paciente (modelo excludente:
   * orcamento aprovado != paciente automaticamente · paciente eh decisao
   * separada porque pode requerer dados clinicos adicionais).
   */
  async markApproved(id: string): Promise<OrcamentoDTO | null> {
    const { data, error } = await this.supabase
      .from('orcamentos')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id)
      .select(ORC_COLUMNS)
      .single()
    if (error || !data) return null
    return mapOrcamentoRow(data)
  }

  /**
   * Marca como perdido. Reason obrigatorio
   * (chk_orc_lost_consistency).
   */
  async markLost(id: string, reason: string): Promise<OrcamentoDTO | null> {
    if (!reason || !reason.trim()) return null
    const { data, error } = await this.supabase
      .from('orcamentos')
      .update({
        status: 'lost',
        lost_at: new Date().toISOString(),
        lost_reason: reason.trim(),
      })
      .eq('id', id)
      .select(ORC_COLUMNS)
      .single()
    if (error || !data) return null
    return mapOrcamentoRow(data)
  }

  /**
   * Append payment ao array `payments` · usado pra registrar parcelas
   * recebidas. Read-modify-write (sem race significativo · UI single-user
   * por orcamento via UI). Se concorrencia virar problema, migra pra RPC
   * com lock.
   */
  async addPayment(id: string, payment: OrcamentoPayment): Promise<OrcamentoDTO | null> {
    const current = await this.getById(id)
    if (!current) return null
    const newPayments = [...current.payments, payment]
    const { data, error } = await this.supabase
      .from('orcamentos')
      .update({ payments: newPayments })
      .eq('id', id)
      .select(ORC_COLUMNS)
      .single()
    if (error || !data) return null
    return mapOrcamentoRow(data)
  }

  /**
   * Recalcula total a partir de items[].subtotal + discount. Util quando
   * UI manipulou items diretamente fora do `update()`.
   */
  recomputeTotal(items: OrcamentoItem[], discount: number): { subtotal: number; total: number } {
    const subtotal = items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0)
    const total = Math.max(0, subtotal - discount)
    return { subtotal, total }
  }

  /**
   * Soft-delete · admin only via RLS. Hard-delete via service_role.
   */
  async softDelete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('orcamentos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  }

  // ── Cron orcamento-followup (mig 82) ────────────────────────────────────

  /**
   * Pega ate `batchLimit` orcamentos elegiveis pra follow-up automatico.
   * Atomico via RPC `orcamento_followup_pick` (UPDATE ... FOR UPDATE
   * SKIP LOCKED + seta `picking_at`). 2 crons concorrentes nao pegam os
   * mesmos rows.
   *
   * Caller deve chamar `markFollowupSent(id)` apos enviar a mensagem
   * (libera lock + seta `last_followup_at`). Se falhar antes do mark,
   * `clearStuckFollowups` libera o lock apos 5min.
   */
  async pickFollowupCandidates(
    batchLimit: number = 10,
  ): Promise<OrcamentoFollowupCandidateDTO[]> {
    const { data, error } = await this.supabase.rpc('orcamento_followup_pick', {
      p_batch_limit: batchLimit,
    })
    if (error || !data) return []
    type RpcRow = {
      orcamento_id: string
      clinic_id: string
      lead_id: string | null
      patient_id: string | null
      title: string | null
      total: number | string
      valid_until: string
      share_token: string | null
      bucket: 'recent' | 'expiring' | 'expiring_soon'
      days_to_expire: number
    }
    return (data as RpcRow[]).map((r) => ({
      orcamentoId: r.orcamento_id,
      clinicId: r.clinic_id,
      leadId: r.lead_id,
      patientId: r.patient_id,
      title: r.title,
      total: Number(r.total),
      validUntil: r.valid_until,
      shareToken: r.share_token,
      bucket: r.bucket,
      daysToExpire: r.days_to_expire,
    }))
  }

  /**
   * Marca follow-up como enviado · libera `picking_at` + seta
   * `last_followup_at=now()`. Idempotente.
   */
  async markFollowupSent(id: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('orcamento_followup_mark_sent', {
      p_orcamento_id: id,
    })
    if (error) return false
    return data === true
  }

  /**
   * Libera locks `picking_at` stuck (cron crashou em execucao anterior).
   * Retorna numero de rows liberadas. Caller deve logar warn se > 0.
   */
  async clearStuckFollowups(maxAgeMinutes: number = 5): Promise<number> {
    const { data, error } = await this.supabase.rpc('orcamento_followup_clear_stuck', {
      p_max_age_minutes: maxAgeMinutes,
    })
    if (error || typeof data !== 'number') return 0
    return data
  }

  /**
   * Stats do cron orcamento-followup pra dashboard /admin/health.
   *
   * Retorna:
   *   - sentLast24h: orcamentos com last_followup_at >= now-24h
   *   - stuckLocks: orcamentos com picking_at NAO-NULL > 5min (cron crashou)
   *   - eligibleNow: orcamentos elegiveis pra proxima execucao do cron
   *     (mesma logica de orcamento_followup_pick · sem o lock)
   *   - lastRunAt: timestamp do follow-up mais recente (proxy pra
   *     "ultima execucao do cron" · null = cron nunca rodou)
   */
  async getFollowupStats(clinicId: string): Promise<{
    sentLast24h: number
    stuckLocks: number
    eligibleNow: number
    lastRunAt: string | null
  }> {
    const now = new Date()
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const cutoff5min = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    const today = now.toISOString().slice(0, 10)
    const todayPlus7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const [sentRes, stuckRes, eligibleRes, lastRes] = await Promise.all([
      this.supabase
        .from('orcamentos')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .gte('last_followup_at', cutoff24h),
      this.supabase
        .from('orcamentos')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .lt('picking_at', cutoff5min),
      this.supabase
        .from('orcamentos')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .in('status', ['sent', 'viewed', 'followup', 'negotiation'])
        .not('share_token', 'is', null)
        .gte('valid_until', today)
        .lte('valid_until', todayPlus7),
      this.supabase
        .from('orcamentos')
        .select('last_followup_at')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .not('last_followup_at', 'is', null)
        .order('last_followup_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return {
      sentLast24h: sentRes.count ?? 0,
      stuckLocks: stuckRes.count ?? 0,
      eligibleNow: eligibleRes.count ?? 0,
      lastRunAt:
        (lastRes.data as { last_followup_at: string | null } | null)?.last_followup_at ?? null,
    }
  }
}
