/**
 * B2BVoucherRepository · acesso a b2b_vouchers (clinic-dashboard mig 0281, 27 cols).
 *
 * issue() wraps RPC `b2b_voucher_issue(payload)` · token gerado server-side
 * (8 chars base36 + retry em colisao). Retorna { ok, id, token, valid_until }.
 *
 * Lara follow-up (mig 800-07):
 *   - findRecentByRecipientPhone: lookup recipient pra detectar voucher recente
 *   - findFollowupCandidates: cron pega buckets 24h/48h/72h
 *   - markEngaged: webhook seta engaged quando recipient responde
 *   - markFollowupSent: cron registra envio do follow-up
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants } from '@clinicai/utils'
import type { DedupHit, DedupHitKind } from './types'
export type LaraFollowupState =
  | 'pending'
  | 'engaged'
  | 'cold_24h'
  | 'cold_48h'
  | 'cold_72h'
  | 'scheduled'
  | 'cancelled'

export type LaraFollowupBucket = '24h' | '48h' | '72h'

export interface B2BVoucherDTO {
  id: string
  clinicId: string
  partnershipId: string
  combo: string
  recipientName: string | null
  recipientPhone: string | null
  recipientCpf: string | null
  token: string
  validUntil: string
  status: 'issued' | 'delivered' | 'opened' | 'redeemed' | 'expired' | 'cancelled'
  issuedAt: string
  deliveredAt: string | null
  openedAt: string | null
  redeemedAt: string | null
  audioSentAt?: string | null
  laraFollowupState?: LaraFollowupState
  laraEngagedAt?: string | null
}

export interface LaraFollowupCandidateDTO {
  voucherId: string
  clinicId: string
  partnershipId: string
  partnershipName: string | null
  partnerContactName: string | null
  partnerContactPhone: string | null
  partnerFirstName: string | null
  recipientName: string | null
  recipientFirstName: string | null
  recipientPhone: string
  combo: string | null
  audioSentAt: string
  bucket: LaraFollowupBucket
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVoucherRow(row: any): B2BVoucherDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    partnershipId: String(row.partnership_id),
    combo: String(row.combo ?? ''),
    recipientName: row.recipient_name ?? null,
    recipientPhone: row.recipient_phone ?? null,
    recipientCpf: row.recipient_cpf ?? null,
    token: String(row.token ?? ''),
    validUntil: String(row.valid_until ?? ''),
    status: (row.status ?? 'issued') as B2BVoucherDTO['status'],
    issuedAt: row.issued_at ?? new Date().toISOString(),
    deliveredAt: row.delivered_at ?? null,
    openedAt: row.opened_at ?? null,
    redeemedAt: row.redeemed_at ?? null,
    audioSentAt: row.audio_sent_at ?? null,
    laraFollowupState: (row.lara_followup_state ?? 'pending') as LaraFollowupState,
    laraEngagedAt: row.lara_engaged_at ?? null,
  }
}

export interface IssueVoucherInput {
  partnershipId: string
  combo?: string
  recipientName?: string
  recipientPhone?: string
  recipientCpf?: string
  validityDays?: number
  notes?: string
}

export class B2BVoucherRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Emite voucher novo · RPC b2b_voucher_issue gera token + valida cap mensal.
   * Retorna { ok, id, token, validUntil } ou error.
   */
  async issue(input: IssueVoucherInput): Promise<{
    ok: boolean
    id?: string
    token?: string
    validUntil?: string
    error?: string
  }> {
    const payload: Record<string, unknown> = {
      partnership_id: input.partnershipId,
    }
    if (input.combo) payload.combo = input.combo
    if (input.recipientName) payload.recipient_name = input.recipientName
    if (input.recipientPhone) payload.recipient_phone = input.recipientPhone
    if (input.recipientCpf) payload.recipient_cpf = input.recipientCpf
    if (input.validityDays != null) payload.validity_days = input.validityDays
    if (input.notes) payload.notes = input.notes

    const { data, error } = await this.supabase.rpc('b2b_voucher_issue', { p_payload: payload })
    if (error) return { ok: false, error: error.message }

    const result = data as {
      ok?: boolean
      id?: string
      token?: string
      valid_until?: string
      error?: string
    }
    return {
      ok: result?.ok === true,
      id: result?.id,
      token: result?.token,
      validUntil: result?.valid_until,
      error: result?.error,
    }
  }

  /**
   * Emite voucher novo COM dedup transactional (Fix F5 · mig 800-12).
   *
   * Wraps RPC `b2b_voucher_issue_with_dedup(payload)` que faz dedup +
   * create numa unica transacao com SET LOCAL transaction_isolation =
   * 'serializable'. Elimina a race que existia entre o handler chamar
   * findInAnySystem (4 queries em paralelo) e o RPC b2b_voucher_issue
   * legacy: 2 parceiras mandando voucher pra mesmo phone simultaneamente
   * podiam ambas passar pelo dedup (cada uma vendo "vazio") e ambas chegar
   * a emitir voucher duplicado. Com serializable + FOR UPDATE em
   * leads/b2b_vouchers/b2b_attributions, uma vence e a outra recebe
   * SQLSTATE 40001 (serialization_failure) · esse retry abaixo cobre.
   *
   * Phone variants: caller passa `recipientPhone` cru · esse metodo
   * gera `phoneVariants(recipientPhone)` e envia como jsonb array no
   * payload (chave 'phone_variants') pra RPC checar todas as variantes.
   *
   * Retry: ate 3 tentativas com backoff 100ms / 300ms / 700ms quando
   * receber serialization_failure. Outras erros nao retentam.
   *
   * Retorno:
   *   - emit OK:    { ok:true, id, token, validUntil }
   *   - dedup hit:  { ok:true, dedupHit: {...} }
   *   - falha:      { ok:false, error }
   */
  async issueWithDedup(input: IssueVoucherInput): Promise<{
    ok: boolean
    id?: string
    token?: string
    validUntil?: string
    dedupHit?: DedupHit
    error?: string
    retries?: number
  }> {
    const payload: Record<string, unknown> = {
      partnership_id: input.partnershipId,
    }
    if (input.combo) payload.combo = input.combo
    if (input.recipientName) payload.recipient_name = input.recipientName
    if (input.recipientPhone) {
      payload.recipient_phone = input.recipientPhone
      const variants = phoneVariants(input.recipientPhone)
      if (variants.length > 0) payload.phone_variants = variants
    }
    if (input.recipientCpf) payload.recipient_cpf = input.recipientCpf
    if (input.validityDays != null) payload.validity_days = input.validityDays
    if (input.notes) payload.notes = input.notes

    const BACKOFFS_MS = [100, 300, 700]
    let lastError: string | undefined

    for (let attempt = 0; attempt < BACKOFFS_MS.length; attempt++) {
      const { data, error } = await this.supabase.rpc(
        'b2b_voucher_issue_with_dedup',
        { p_payload: payload },
      )

      if (error) {
        // Detect serialization_failure · PG SQLSTATE 40001.
        // supabase-js wraps PG errors · code pode estar em error.code ou
        // dentro da message. Cobrimos ambos.
        const msg = String(error.message ?? '')
        const code = (error as { code?: string }).code ?? ''
        const isSerializationFailure =
          code === '40001' ||
          /could not serialize/i.test(msg) ||
          /serialization_failure/i.test(msg)

        if (isSerializationFailure && attempt < BACKOFFS_MS.length - 1) {
          lastError = msg
          // Backoff e retenta · race resolveu, proxima tentativa vence ou
          // pega dedup_hit do voucher recem-criado.
          await new Promise((resolve) => setTimeout(resolve, BACKOFFS_MS[attempt]))
          continue
        }
        return {
          ok: false,
          error: msg || lastError || 'rpc_error',
          retries: attempt,
        }
      }

      const result = data as {
        ok?: boolean
        id?: string
        token?: string
        valid_until?: string
        error?: string
        dedup_hit?: {
          kind: DedupHitKind
          id: string
          name?: string | null
          phone?: string | null
          since: string
          partnership_name?: string | null
        }
      } | null

      if (result?.dedup_hit) {
        return {
          ok: result.ok === true,
          retries: attempt,
          dedupHit: {
            kind: result.dedup_hit.kind,
            id: String(result.dedup_hit.id),
            name: result.dedup_hit.name ?? null,
            phone: String(result.dedup_hit.phone ?? input.recipientPhone ?? ''),
            since: String(result.dedup_hit.since ?? new Date().toISOString()),
            partnershipName: result.dedup_hit.partnership_name ?? null,
          },
        }
      }

      return {
        ok: result?.ok === true,
        id: result?.id,
        token: result?.token,
        validUntil: result?.valid_until,
        error: result?.error,
        retries: attempt,
      }
    }

    return {
      ok: false,
      error: lastError ?? 'serialization_failure_max_retries',
      retries: BACKOFFS_MS.length,
    }
  }

  async getById(id: string): Promise<B2BVoucherDTO | null> {
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    return data ? mapVoucherRow(data) : null
  }

  async getByToken(token: string): Promise<B2BVoucherDTO | null> {
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    return data ? mapVoucherRow(data) : null
  }

  async listByPartnership(partnershipId: string, limit = 50): Promise<B2BVoucherDTO[]> {
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('partnership_id', partnershipId)
      .order('issued_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(mapVoucherRow)
  }

  /**
   * Conta vouchers emitidos no mes corrente · usado pra checar voucher_monthly_cap.
   */
  async countMonthlyByPartnership(partnershipId: string): Promise<number> {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const { count } = await this.supabase
      .from('b2b_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('partnership_id', partnershipId)
      .gte('issued_at', monthStart.toISOString())
    return count ?? 0
  }

  async updateStatus(id: string, status: B2BVoucherDTO['status']): Promise<void> {
    await this.supabase.from('b2b_vouchers').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  }

  /**
   * Marca voucher como entregue (delivered) · usado quando admin confirma
   * que enviou link/audio pra parceira manualmente. RPC b2b_voucher_mark_delivered.
   */
  async markDelivered(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_voucher_mark_delivered', {
      p_voucher_id: id,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: (data as { ok?: boolean })?.ok === true }
  }

  /**
   * Cancela voucher · marca status='cancelled' + razao opcional.
   * RPC b2b_voucher_cancel(p_voucher_id, p_reason).
   */
  async cancel(id: string, reason: string | null): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_voucher_cancel', {
      p_voucher_id: id,
      p_reason: reason ?? null,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: (data as { ok?: boolean })?.ok === true }
  }

  /**
   * Funnel de vouchers de uma parceria · contagens por status + redemption rate.
   * RPC b2b_voucher_funnel(p_partnership_id) retorna jsonb.
   */
  async funnel(partnershipId: string): Promise<{
    issued: number
    delivered: number
    opened: number
    redeemed: number
    expired: number
    cancelled: number
    total: number
    redemption_rate_pct: number
    last_issued_at: string | null
  } | null> {
    const { data, error } = await this.supabase.rpc('b2b_voucher_funnel', {
      p_partnership_id: partnershipId,
    })
    if (error || !data) return null
    return data as {
      issued: number
      delivered: number
      opened: number
      redeemed: number
      expired: number
      cancelled: number
      total: number
      redemption_rate_pct: number
      last_issued_at: string | null
    }
  }

  /**
   * Conta vouchers no periodo · usado em dashboard pra "vouchers emitidos hoje/7d".
   */
  async countByPeriod(
    clinicId: string,
    sinceIso: string,
    filters: { status?: B2BVoucherDTO['status'] | B2BVoucherDTO['status'][] } = {},
  ): Promise<number> {
    let q = this.supabase
      .from('b2b_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('issued_at', sinceIso)
    if (filters.status) {
      const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
      q = q.in('status', arr as unknown as string[])
    }
    const { count } = await q
    return count ?? 0
  }

  // ── Lara follow-up (mig 800-07) ────────────────────────────────────────

  /**
   * Busca voucher recente do recipient por phone variants · usado pelo webhook
   * Lara pra detectar "essa pessoa e beneficiaria de voucher emitido nas
   * ultimas 72h e ainda nao foi engaged/cancelled".
   *
   * Multi-tenant strict (clinicId). Filtra:
   *   - status NOT IN ('cancelled', 'expired')
   *   - audio_sent_at IS NOT NULL (so vouchers ja despachados pra recipient)
   *   - audio_sent_at >= now() - 72h
   *   - lara_followup_state NOT IN ('cancelled', 'scheduled')
   * Ordena por audio_sent_at DESC · pega o mais recente.
   */
  async findRecentByRecipientPhone(
    clinicId: string,
    phone: string,
    windowHours = 72,
  ): Promise<B2BVoucherDTO | null> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return null
    const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('recipient_phone', variants)
      .not('audio_sent_at', 'is', null)
      .gte('audio_sent_at', sinceIso)
      .not('status', 'in', '("cancelled","expired")')
      .not('lara_followup_state', 'in', '("cancelled","scheduled")')
      .order('audio_sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? mapVoucherRow(data) : null
  }

  /**
   * Busca candidatos a follow-up · wraps RPC lara_voucher_followup_pick.
   * Cron passa p_now (default = now()) e ressecuta cada hora.
   *
   * Mig 800-09 · pick agora aceita p_limit (default 10, hard cap 100).
   * O servidor seta lara_followup_picking_at = now() atomicamente nos rows
   * retornados · evita 2 crons concorrentes pegarem os mesmos vouchers.
   * Caller deve chamar markFollowupSent (libera lock) ou clearStuckFollowups
   * (libera locks > 5min) pra eventualmente liberar vouchers.
   *
   * Ordem priorizada server-side:
   *   bucket_priority DESC (72h > 48h > 24h) · audio_sent_at ASC.
   */
  async findFollowupCandidates(
    now?: Date,
    limit = 10,
  ): Promise<LaraFollowupCandidateDTO[]> {
    const args: Record<string, unknown> = {
      p_limit: Math.max(1, Math.min(100, Math.floor(limit))),
    }
    if (now) args.p_now = now.toISOString()
    const { data, error } = await this.supabase.rpc('lara_voucher_followup_pick', args)
    if (error) return []
    const result = data as { ok?: boolean; items?: unknown[] } | null
    if (!result?.ok || !Array.isArray(result.items)) return []
    return (result.items as Array<Record<string, unknown>>).map((it) => ({
      voucherId: String(it.voucher_id ?? ''),
      clinicId: String(it.clinic_id ?? ''),
      partnershipId: String(it.partnership_id ?? ''),
      partnershipName: (it.partnership_name as string | null) ?? null,
      partnerContactName: (it.partner_contact_name as string | null) ?? null,
      partnerContactPhone: (it.partner_contact_phone as string | null) ?? null,
      partnerFirstName: (it.partner_first_name as string | null) ?? null,
      recipientName: (it.recipient_name as string | null) ?? null,
      recipientFirstName: (it.recipient_first_name as string | null) ?? null,
      recipientPhone: String(it.recipient_phone ?? ''),
      combo: (it.combo as string | null) ?? null,
      audioSentAt: String(it.audio_sent_at ?? ''),
      bucket: (it.bucket as LaraFollowupBucket) ?? '24h',
    }))
  }

  /**
   * Reset picking_at em vouchers stuck > 5min (mig 800-09) · wraps RPC
   * lara_voucher_followup_clear_stuck. Cron chama antes do pick · evita
   * que voucher fique permanentemente lockado se cron crashou no meio.
   */
  async clearStuckFollowups(): Promise<{ ok: boolean; cleared: number }> {
    const { data, error } = await this.supabase.rpc('lara_voucher_followup_clear_stuck')
    if (error) return { ok: false, cleared: 0 }
    const result = data as { ok?: boolean; cleared?: number } | null
    return {
      ok: result?.ok === true,
      cleared: typeof result?.cleared === 'number' ? result.cleared : 0,
    }
  }

  /**
   * Marca voucher como engaged · recipient respondeu no whats. Wraps RPC.
   * Idempotente: so atualiza se state em (pending, cold_*).
   */
  async markEngaged(voucherId: string): Promise<{ ok: boolean }> {
    const { data, error } = await this.supabase.rpc('lara_voucher_mark_engaged', {
      p_voucher_id: voucherId,
    })
    if (error) return { ok: false }
    return { ok: (data as { ok?: boolean })?.ok === true }
  }

  /**
   * Marca follow-up enviado · cron chama apos disparar mensagem em cada bucket.
   * Atualiza coluna timestamp + state (cold_<bucket>).
   */
  async markFollowupSent(
    voucherId: string,
    bucket: LaraFollowupBucket,
  ): Promise<{ ok: boolean; newState?: string }> {
    const { data, error } = await this.supabase.rpc('lara_voucher_mark_followup_sent', {
      p_voucher_id: voucherId,
      p_bucket: bucket,
    })
    if (error) return { ok: false }
    const result = data as { ok?: boolean; new_state?: string } | null
    return { ok: result?.ok === true, newState: result?.new_state }
  }

  /**
   * Lista vouchers da clinica com filtros · paginated. Usado em /vouchers UI.
   */
  async list(
    clinicId: string,
    filters: {
      status?: B2BVoucherDTO['status']
      partnershipId?: string
      sinceIso?: string
      limit?: number
      offset?: number
    } = {},
  ): Promise<B2BVoucherDTO[]> {
    let q = this.supabase
      .from('b2b_vouchers')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('issued_at', { ascending: false })
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.partnershipId) q = q.eq('partnership_id', filters.partnershipId)
    if (filters.sinceIso) q = q.gte('issued_at', filters.sinceIso)
    const limit = Math.min(filters.limit ?? 100, 500)
    const offset = filters.offset ?? 0
    q = q.range(offset, offset + limit - 1)
    const { data } = await q
    return (data ?? []).map(mapVoucherRow)
  }

  /**
   * IDs de parcerias com vouchers expirando entre `now` e `now + days`.
   * Exclui status terminais (expired/cancelled/redeemed) e o status sintético
   * 'purchased' do funnel · esses ja nao precisam de acao.
   * Usado pelo smart filter "Vouchers expirando 7d" (QuickSearch).
   */
  async listPartnershipsWithExpiringVouchers(
    clinicId: string,
    days = 7,
  ): Promise<string[]> {
    const now = new Date()
    const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('partnership_id')
      .eq('clinic_id', clinicId)
      .gte('valid_until', now.toISOString())
      .lte('valid_until', limit.toISOString())
      .not('status', 'in', '(expired,cancelled,redeemed,purchased)')
    const ids = new Set<string>()
    for (const row of data ?? []) {
      const id = (row as { partnership_id?: string }).partnership_id
      if (id) ids.add(id)
    }
    return Array.from(ids)
  }

  /**
   * Mapa partnership_id → ultima emissao (issued_at ISO). Usado pelo smart
   * filter "Sem voucher 60d" · pra detectar parcerias dormindo. Parcerias
   * sem ENTRADA no map nunca emitiram voucher.
   */
  async lastIssuedAtByPartnership(
    clinicId: string,
  ): Promise<Map<string, string>> {
    // Pega ultimo issued_at por partnership · ordenando desc + dedup no client.
    // Volume tipico clinic-dashboard: < 5k vouchers, OK rodar 1 query.
    const { data } = await this.supabase
      .from('b2b_vouchers')
      .select('partnership_id, issued_at')
      .eq('clinic_id', clinicId)
      .order('issued_at', { ascending: false })
      .limit(5000)
    const map = new Map<string, string>()
    for (const row of data ?? []) {
      const r = row as { partnership_id?: string; issued_at?: string }
      if (!r.partnership_id || !r.issued_at) continue
      if (!map.has(r.partnership_id)) {
        map.set(r.partnership_id, r.issued_at)
      }
    }
    return map
  }
}
