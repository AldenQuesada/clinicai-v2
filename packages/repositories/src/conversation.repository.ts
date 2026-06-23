/**
 * ConversationRepository · acesso canonico a `wa_conversations`.
 *
 * Auto-revive (ADR-028 + lara webhook): conversation 'archived' que recebe
 * mensagem volta pra 'active' antes de retornar · evita criar duplicata.
 *
 * Multi-tenant ADR-028 · clinic_id explicito em todas listagens.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import {
  mapConversationRow,
  type ConversationDTO,
  type ConversationStatus,
  type CreateConversationInput,
} from './types'
import { computeSla } from './sla'
export type StatusFilter = 'active' | 'archived' | 'resolved' | 'dra'

export class ConversationRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Busca conversation em qualquer variante de telefone (status amplo).
   * Auto-revive: se status='archived', flipa pra 'active' antes de retornar.
   *
   * Mig 100/101 · multi-canal:
   *   Se waNumberId fornecido → filtra por canal (cada wa_number tem sua conv
   *   pro mesmo paciente). Caso de admin testando 2 canais ou paciente que
   *   contata clinic via Lara IA + Secretaria humana usa 2 convs separadas.
   *   Se waNumberId NULL/omitido → busca em qualquer canal (legacy compat).
   */
  async findActiveByPhoneVariants(
    clinicId: string,
    variants: string[],
    waNumberId?: string | null,
  ): Promise<ConversationDTO | null> {
    if (!variants.length) return null

    let q = this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .in('status', ['active', 'paused', 'archived'])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)

    // Scope por canal · permite 2 convs (1 por wa_number) pro mesmo paciente
    if (waNumberId) {
      q = q.eq('wa_number_id', waNumberId)
    }

    const { data } = await q.maybeSingle()

    if (!data) return null

    if (data.status === 'archived') {
      await this.supabase
        .from('wa_conversations')
        .update({ status: 'active', ai_enabled: true })
        .eq('id', data.id)
      data.status = 'active'
      data.ai_enabled = true
    }

    return mapConversationRow(data)
  }

  async create(
    clinicId: string,
    input: CreateConversationInput,
  ): Promise<ConversationDTO | null> {
    const now = new Date().toISOString()
    const { data, error } = await this.supabase
      .from('wa_conversations')
      .insert({
        id: uuidv4(),
        clinic_id: clinicId,
        phone: input.phone,
        lead_id: input.leadId,
        display_name: input.displayName ?? null,
        status: input.status ?? 'active',
        ai_enabled: input.aiEnabled ?? true,
        // Mig 91 · trigger fn_wa_conversations_inbox_role_sync copia inbox_role
        // do wa_numbers automaticamente quando wa_number_id e setado. Sem
        // wa_number_id, default 'sdr' (legacy/Evolution).
        wa_number_id: input.waNumberId ?? null,
        created_at: now,
        last_message_at: now,
      })
      .select()
      .single()

    if (error || !data) return null
    return mapConversationRow(data)
  }

  async getById(conversationId: string): Promise<ConversationDTO | null> {
    const { data } = await this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle()
    return data ? mapConversationRow(data) : null
  }

  /**
   * Lista conversas por filtro de status (usado pelo /api/conversations + dashboard).
   * Multi-tenant: clinic_id obrigatorio · escopa por clinica do JWT.
   *
   * Patch 2D · isolation 2986 (2026-05-11): `waNumberId` opcional permite
   * escopar por canal especifico. /secretaria DEVE passar o id do canal Mih
   * pra nao misturar com Mira/Marci/Auxiliar (4 canais carregam
   * inbox_role='secretaria' · sem waNumberId a lista cruza canais e diverge
   * dos KPIs · que ja sao hardcoded no view operational).
   */
  async listByStatus(
    clinicId: string,
    filter: StatusFilter = 'active',
    opts?: {
      limit?: number
      beforeIso?: string
      inboxRole?: 'sdr' | 'secretaria'
      waNumberId?: string
    },
  ): Promise<ConversationDTO[]> {
    let statuses: ConversationStatus[] = ['active', 'paused']
    if (filter === 'archived') statuses = ['archived']
    if (filter === 'resolved') statuses = ['resolved']
    if (filter === 'dra') statuses = ['dra']

    // P-02 (2026-04-29): paginacao cursor-based em last_message_at desc.
    // limit default 50 cobre carga inicial · cliente chama com beforeIso pro
    // proximo lote. Cursor evita pular linhas em concurrent updates (offset
    // shift bug em workloads write-heavy).
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 50))

    let q = this.supabase
      .from('wa_conversations')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('status', statuses)
      .order('last_message_at', { ascending: false })
      .limit(limit)

    if (opts?.beforeIso) {
      q = q.lt('last_message_at', opts.beforeIso)
    }

    // Mig 91 · filter por inbox · /conversas (sdr=Lara) vs /secretaria.
    // Default 'sdr' quando omitido (compat com callers existentes).
    if (opts?.inboxRole) {
      q = q.eq('inbox_role', opts.inboxRole)
    }

    // Patch 2D · isolation 2986 (2026-05-11): escopo por canal explicito.
    // Mais especifico que inbox_role (que mistura Mih + Mira + Marci + Aux).
    // Quando ambos sao passados, viram filtros AND · waNumberId sozinho ja
    // implica inbox_role do canal (denorm via mig 91 trigger).
    if (opts?.waNumberId) {
      q = q.eq('wa_number_id', opts.waNumberId)
    }

    const { data } = await q
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = data ?? []
    if (rows.length === 0) return []

    // SLA secretaria + KPI Retorno · 1 query auxiliar batched pra resolver
    // lastHumanReply (sentAt + content) por conversa. Single source of truth
    // = computeSla() no mapper + isReturnPending() na UI.
    const ids = rows.map((r) => String(r.id))
    const humanReplies = await this.getLastHumanReplyByConvs(ids)
    return rows.map((row) => {
      const hr = humanReplies.get(String(row.id))
      return mapConversationRow(row, hr?.sentAt ?? null, hr?.content ?? null)
    })
  }

  /**
   * Resolve a última resposta humana válida por conversation_id em batch.
   * Critério canônico (Alden 2026-05-04 · sla.ts):
   *   direction = 'outbound'
   *   AND sender   = 'humano'
   *   AND deleted_at IS NULL
   *   AND status IS DISTINCT FROM 'note'
   *
   * Retorna Map<conversation_id, { sentAt, content }> com a mais recente por
   * conv. Conversas sem resposta humana ficam fora do Map (caller usa null
   * default). `content` necessário pra detectar promessa de retorno (KPI
   * Retorno · isReturnPending em apps/lara/.../lib/returnPromises.ts).
   *
   * Usado por listByStatus + getInsights pra alimentar:
   *   - computeSla() (lastHumanReplyAt)
   *   - isReturnPending() (lastHumanReplyText)
   * UI nunca recalcula regra · só renderiza/filtra a partir do DTO.
   */
  async getLastHumanReplyByConvs(
    conversationIds: string[],
  ): Promise<Map<string, { sentAt: string; content: string | null }>> {
    const result = new Map<string, { sentAt: string; content: string | null }>()
    if (conversationIds.length === 0) return result

    const { data } = await this.supabase
      .from('wa_messages')
      .select('conversation_id, sent_at, content')
      .in('conversation_id', conversationIds)
      .eq('direction', 'outbound')
      .eq('sender', 'humano')
      .is('deleted_at', null)
      // status IS DISTINCT FROM 'note' · cobre tanto NULL quanto valores ≠ 'note'
      .or('status.is.null,status.neq.note')
      .order('sent_at', { ascending: false })

    // Como ordenamos DESC por sent_at, a primeira ocorrência por conversation_id
    // é a mais recente. Set apenas no primeiro hit · ignora subsequentes.
    for (const row of (data ?? []) as Array<{
      conversation_id: string
      sent_at: string
      content: string | null
    }>) {
      const cid = String(row.conversation_id)
      if (!result.has(cid)) {
        result.set(cid, {
          sentAt: String(row.sent_at),
          content: row.content ?? null,
        })
      }
    }
    return result
  }

  /**
   * Mig 91 · seta wa_number_id em conv existente · trigger
   * fn_wa_conversations_inbox_role_sync sincroniza inbox_role + context_type
   * do wa_numbers. Usado pelo backfill de convs legacy criadas pela wa-inbound
   * (que nao preenchia wa_number_id) quando recebe nova mensagem agora.
   *
   * Race-safe (HIGH-2 · 2026-05-07): UPDATE só vence quando a linha ainda
   * tem `wa_number_id IS NULL` E `deleted_at IS NULL`. Se 2 webhooks tentam
   * adotar a mesma órfã ao mesmo tempo, só o primeiro grava · o segundo
   * recebe `null` (zero rows afetadas) e o caller decide o que fazer (pular
   * adoção com warning). Também impede sobrescrever canal de conv que JÁ
   * tinha wa_number_id setado por qualquer outra via.
   */
  async setWaNumber(
    conversationId: string,
    waNumberId: string,
  ): Promise<ConversationDTO | null> {
    const { data, error } = await this.supabase
      .from('wa_conversations')
      .update({
        wa_number_id: waNumberId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .is('wa_number_id', null)
      .is('deleted_at', null)
      .select()
      .maybeSingle()

    if (error || !data) return null
    return mapConversationRow(data)
  }

  /**
   * Atualiza apenas `display_name` · usado pelo webhook quando pushName
   * válido aparece numa inbound posterior à criação (conversa começou com
   * phone como display_name). Caller é responsável por aplicar
   * `isGoodHumanName` + `shouldUpdateName` ANTES de chamar.
   *
   * Retorna `true` se UPDATE foi confirmado, `false` caso contrário.
   */
  async updateDisplayName(
    conversationId: string,
    displayName: string,
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('wa_conversations')
      .update({ display_name: displayName })
      .eq('id', conversationId)
    return !error
  }

  /**
   * Atualiza last_message_at + last_message_text (snapshot pro inbox).
   * Truncate text em 200 chars (mesma regra do webhook legado).
   */
  async updateLastMessage(
    conversationId: string,
    text: string,
    isInbound: boolean,
    when?: string,
  ): Promise<void> {
    const ts = when ?? new Date().toISOString()
    const patch: Record<string, unknown> = {
      last_message_at: ts,
      last_message_text: text.substring(0, 200),
    }
    if (isInbound) patch.last_lead_msg = ts
    await this.supabase.from('wa_conversations').update(patch).eq('id', conversationId)
  }

  /**
   * Set ai_paused_until + ai_enabled num único update.
   * Quando until=null e enabled=true, libera IA imediatamente.
   */
  async updateAiPause(
    conversationId: string,
    update: {
      pausedUntil: string | null
      aiEnabled: boolean
      pausedBy?: string | null
      status?: ConversationStatus
    },
    clinicId?: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      ai_paused_until: update.pausedUntil,
      ai_enabled: update.aiEnabled,
    }
    if (update.pausedBy !== undefined) patch.paused_by = update.pausedBy
    if (update.status) patch.status = update.status
    // Scope hardening · em caminho service_role (RLS furada) o caller passa
    // clinicId pra escopar o UPDATE por id + clinic_id (multi-tenant ADR-028).
    // Param opcional · callers existentes (já validados antes) não quebram.
    let q = this.supabase.from('wa_conversations').update(patch).eq('id', conversationId)
    if (clinicId) q = q.eq('clinic_id', clinicId)
    await q
  }

  async setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await this.supabase
      .from('wa_conversations')
      .update({ status })
      .eq('id', conversationId)
  }

  /**
   * Encerrar operacional (Secretaria · mig 200) · seta kpi_cleared_at = agora.
   *
   * Limpa APENAS as lentes de KPI (Aguardando/Urgente) na
   * wa_conversations_operational_view. NÃO muda status, last_message_at,
   * sort, ai_enabled nem remove da inbox/timeline. Se o paciente mandar
   * mensagem nova (patient_last_at > kpi_cleared_at), o KPI reabre sozinho.
   * Escopo multi-tenant ADR-028: id + clinic_id (caminho service_role).
   */
  async clearSecretariaKpi(
    conversationId: string,
    clinicId: string,
  ): Promise<{ kpi_cleared_at: string }> {
    const clearedAt = new Date().toISOString()
    // patch destipado (mesmo padrão de updateAiPause) · não depende do tipo
    // gerado da tabela conter kpi_cleared_at.
    const patch: Record<string, unknown> = { kpi_cleared_at: clearedAt }
    const { error } = await this.supabase
      .from('wa_conversations')
      .update(patch)
      .eq('id', conversationId)
      .eq('clinic_id', clinicId)
    if (error) throw new Error(error.message)
    return { kpi_cleared_at: clearedAt }
  }

  /**
   * P-12 · atribui conversa a um membro da clinic via RPC atomico
   * (wa_conversation_assign). Retorna estado final · UI reconcilia
   * em race entre 2 atendentes.
   */
  async assignConversation(
    conversationId: string,
    userId: string,
  ): Promise<{
    ok: boolean
    error?: string
    assignedTo?: string
    assignedAt?: string
  }> {
    const { data, error } = await this.supabase.rpc('wa_conversation_assign', {
      p_conversation_id: conversationId,
      p_user_id: userId,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    // RPC retorna jsonb · supabase devolve o objeto direto
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any) ?? {}
    return {
      ok: result.ok === true,
      error: result.error ?? undefined,
      assignedTo: result.assigned_to ?? undefined,
      assignedAt: result.assigned_at ?? undefined,
    }
  }

  /**
   * P-12 · libera conversa (assigned_to = NULL).
   */
  async unassignConversation(
    conversationId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('wa_conversation_unassign', {
      p_conversation_id: conversationId,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any) ?? {}
    return {
      ok: result.ok === true,
      error: result.error ?? undefined,
    }
  }

  /**
   * Mig 91 · handoff atomico Lara→Secretaria via RPC.
   * Pausa Lara 30d + dispara inbox_notification (kind=handoff_secretaria).
   * Idempotente · retorna already_handed_off=true em re-chamada.
   */
  async handoffSecretaria(
    conversationId: string,
    reason?: string,
  ): Promise<{ ok: boolean; error?: string; alreadyHandedOff?: boolean }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'wa_conversation_handoff_secretaria',
      {
        p_conversation_id: conversationId,
        p_reason: reason ?? null,
      },
    )
    if (error) {
      return { ok: false, error: error.message }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any) ?? {}
    return {
      ok: result.ok === true,
      error: result.error ?? undefined,
      alreadyHandedOff: result.already_handed_off === true,
    }
  }

  /**
   * P-12 · le assignment atual de uma conversa (sem JOIN com profiles ·
   * o caller resolve o profile via useClinicMembers cache pra evitar N+1).
   */
  async getAssignment(conversationId: string): Promise<{
    assignedTo: string | null
    assignedAt: string | null
  } | null> {
    const { data } = await this.supabase
      .from('wa_conversations')
      .select('assigned_to, assigned_at')
      .eq('id', conversationId)
      .maybeSingle()
    if (!data) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    return {
      assignedTo: row.assigned_to ?? null,
      assignedAt: row.assigned_at ?? null,
    }
  }

  /**
   * Conta conversations num filtro · usado pelo dashboard pra cards.
   * Composição estilo: { aiEnabled?, statuses?, lastMessageSince? }.
   */
  async count(
    clinicId: string,
    filter: {
      statuses?: ConversationStatus[]
      aiEnabled?: boolean
      lastMessageSince?: string
    },
  ): Promise<number> {
    let q = this.supabase
      .from('wa_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)

    if (filter.statuses?.length) q = q.in('status', filter.statuses)
    if (filter.aiEnabled !== undefined) q = q.eq('ai_enabled', filter.aiEnabled)
    if (filter.lastMessageSince) q = q.gte('last_message_at', filter.lastMessageSince)

    const { count } = await q
    return count ?? 0
  }

  /**
   * Insights agregados pro top bar do /conversas.
   *
   * Definições canônicas (Alden 2026-05-04/05 · sla.ts é source of truth):
   *
   *  - aguardando:    waitingHumanResponse = true E !assigned_to_doctor.
   *                   Computado por computeSla sobre last_lead_msg vs
   *                   MAX(sent_at) WHERE sender='humano' AND status≠'note'.
   *                   Lara/IA NÃO conta como resposta humana. Conversas
   *                   atribuídas à Dra (assigned_to=doctorUserId) saem da
   *                   fila secretária · contam em `dra`.
   *
   *  - urgentes:      subset de aguardando onde responseColor ∈
   *                   { 'vermelho', 'critico', 'atrasado_fixo', 'antigo_parado' }
   *                   (≥ 7min sem resposta humana · não-Dra).
   *
   *  - dra:           assigned_to = doctorUserId AND status IN ('active','paused')
   *                   (transferidas pra fila Dra · indep. de SLA).
   *
   *  - lara_ativa:    ai_enabled = true E !assigned_to_doctor (Lara só
   *                   conduz convs que ainda estão na fila secretária).
   *
   *  - resolvidos_hoje: status='resolved' AND last_message_at >= todayStartIso.
   *
   *  - novos_leads:   leads.created_at >= todayStartIso (contatos NOVOS hoje ·
   *                   não mensagens novas de leads existentes).
   *
   * Implementação: 3 queries em paralelo via Promise.all + 1 query auxiliar
   * pra resolver lastHumanReplyAt em batch. Counters varridos em TS sobre
   * activeConvs (volume baixo · até alguns milhares de convs por clinic é
   * trivial). Resolvidos_hoje e novos_leads continuam count(*) puro.
   *
   * Param `fiveMinAgoIso` mantido na assinatura por compat (não usado aqui ·
   * thresholds vivem em sla.ts agora).
   *
   * Param `doctorUserId` (opcional · default null): user_id da doutora pra
   * separar fila Dra da fila secretária. Quando null/omitido, fila Dra fica
   * em zero e nada é excluído de aguardando · comportamento idêntico ao
   * pre-doctor. Single-tenant V2 hoje: caller passa
   * apps/lara/src/lib/clinic-profiles.DOCTOR_USER_ID.
   *
   * Multi-tenant: clinic_id via JWT no caller.
   */
  async getInsights(
    clinicId: string,
    opts: { fiveMinAgoIso: string; todayStartIso: string; doctorUserId?: string | null },
  ): Promise<{
    urgentes: number
    aguardando: number
    laraAtiva: number
    resolvidosHoje: number
    novosLeads: number
    dra: number
  }> {
    const activeStatuses: ConversationStatus[] = ['active', 'paused']
    const _unused = opts.fiveMinAgoIso // kept for backward-compat assinatura
    void _unused
    const now = new Date()
    const doctorUserId = opts.doctorUserId ?? null

    const [activeConvsRes, resolvidosQ, novosLeadsQ] = await Promise.all([
      this.supabase
        .from('wa_conversations')
        .select('id, last_lead_msg, ai_enabled, assigned_to')
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses),
      this.supabase
        .from('wa_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'resolved')
        .gte('last_message_at', opts.todayStartIso),
      this.supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .gte('created_at', opts.todayStartIso),
    ])

    const activeConvs = (activeConvsRes.data ?? []) as Array<{
      id: string
      last_lead_msg: string | null
      ai_enabled: boolean | null
      assigned_to: string | null
    }>
    const ids = activeConvs.map((c) => String(c.id))
    const humanReplies = await this.getLastHumanReplyByConvs(ids)

    let aguardando = 0
    let urgentes = 0
    let laraAtiva = 0
    let dra = 0
    for (const c of activeConvs) {
      // Conversa atribuída à Dra · vai pra fila Dra, sai das filas
      // secretária/Lara. Decisão Alden 2026-05-05 · "Aguardando é fila da
      // Luciana, Dra é fila da Mirian, Todas é visão geral".
      if (doctorUserId && c.assigned_to === doctorUserId) {
        dra++
        continue
      }
      if (c.ai_enabled !== false) laraAtiva++
      const sla = computeSla({
        lastPatientMsgAt: c.last_lead_msg ?? null,
        lastHumanReplyAt: humanReplies.get(String(c.id))?.sentAt ?? null,
        now,
      })
      if (!sla.waitingHumanResponse) continue
      aguardando++
      if (
        sla.responseColor === 'vermelho' ||
        sla.responseColor === 'critico' ||
        sla.responseColor === 'atrasado_fixo' ||
        sla.responseColor === 'antigo_parado'
      ) {
        urgentes++
      }
    }

    return {
      urgentes,
      aguardando,
      laraAtiva,
      resolvidosHoje: resolvidosQ.count ?? 0,
      novosLeads: novosLeadsQ.count ?? 0,
      dra,
    }
  }

  /**
   * KPI Secretaria · Patch SECRETARIA KPI A (2026-05-07).
   *
   * Counts reais pro topo da Secretaria · independente da paginacao da lista
   * (PAGE_SIZE=50). Fonte: wa_conversations_operational_view (mesma SoT que
   * a UI usa pros pills/filtros). 5 COUNT(*) em paralelo · sem RPC nova.
   *
   * Semantica preservada (Onda 2 vai renomear Luciana, NAO neste patch):
   *   - todos       · isOperational (status active+paused)
   *   - mirian      · is_dra OU operational_owner='mirian'
   *   - luciana     · is_luciana OU operational_owner='luciana'
   *   - aguardando  · is_aguardando=true
   *   - urgente     · is_urgente=true
   *
   * View ja restringe wa_number_id (hardcoded · "Secretaria B&H") + inbox_role
   * = 'secretaria' + filtros de archived/cross-loop · multi-tenant scope vem
   * via clinic_id no SELECT (RLS de wa_conversations vale pra view).
   */
  async getSecretariaKpiCounts(clinicId: string): Promise<{
    total: number
    /** Mig 147 (2026-05-08) · bucket default da fila Secretaria · count via
        operational_owner='secretaria' (sempre · NUNCA mais via 'luciana' ·
        Luciana virou pessoa real, nao alias). */
    secretaria: number
    mirian: number
    /** Onda 3 (2026-05-06) · count de conversas atribuidas ao Dr. Alden ·
        operational_owner='alden' via UUID na view (mig 146). */
    alden: number
    aguardando: number
    urgente: number
  }> {
    const view = 'wa_conversations_operational_view'
    const activeStatuses: ConversationStatus[] = ['active', 'paused']

    const [totalQ, mirianQ, aldenQ, secretariaQ, aguardandoQ, urgenteQ] = await Promise.all([
      this.supabase
        .from(view)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses),
      this.supabase
        .from(view)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .or('is_dra.eq.true,operational_owner.eq.mirian'),
      // Onda 3 · Alden eh APENAS via operational_owner='alden' (mig 146 · UUID).
      // is_dra continua Mirian-only por decisao de produto.
      this.supabase
        .from(view)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .eq('operational_owner', 'alden'),
      // Mig 147 · bucket default = operational_owner='secretaria'. NAO mais
      // 'luciana' OR is_luciana=true · view foi normalizada · Luciana so eh
      // owner se realmente atribuida (rara · 0 em prod hoje).
      this.supabase
        .from(view)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .eq('operational_owner', 'secretaria'),
      this.supabase
        .from(view)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .eq('is_aguardando', true),
      this.supabase
        .from(view)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', activeStatuses)
        .eq('is_urgente', true),
    ])

    return {
      total: totalQ.count ?? 0,
      secretaria: secretariaQ.count ?? 0,
      mirian: mirianQ.count ?? 0,
      alden: aldenQ.count ?? 0,
      aguardando: aguardandoQ.count ?? 0,
      urgente: urgenteQ.count ?? 0,
    }
  }

  /**
   * Historico de assignment de uma conversa · le da view semantica
   * public.wa_conversation_assignment_events_view (Mig 148 · grants Mig 149).
   *
   * Source · rotula transicoes do audit_wa_conversations bruto:
   *   assignment_action · assigned | returned | reassigned | profile_changed | updated
   *   from_owner/to_owner · secretaria | alden | mirian | luciana | responsavel
   *
   * Multi-tenant guard:
   *   View nao tem RLS proprio · scope manual via .eq('clinic_id', ...) +
   *   .eq('conversation_id', ...) garante que o caller so ve eventos da
   *   conv requisitada da clinic do JWT. Caller deve validar conv ownership
   *   (clinicId match) ANTES de chamar este metodo.
   *
   * Limit:
   *   Cap em 50 por chamada · evita payload gigante em conv com muitos
   *   handoffs. Ordenacao audit_at DESC · mais recente primeiro.
   *
   * NAO retorna old_data/new_data brutos · view ja descarta esses campos
   * sensiveis · so colunas semanticas/canonicas sao expostas.
   */
  async getAssignmentEvents(
    conversationId: string,
    clinicId: string,
    limit = 50,
  ): Promise<
    Array<{
      auditAt: string
      assignmentAction: string
      fromOwner: string
      fromAssignedToName: string | null
      toOwner: string
      toAssignedToName: string | null
      actorRole: string | null
      auditReason: string | null
      phone: string | null
      displayName: string | null
      status: string | null
    }>
  > {
    const { data, error } = await this.supabase
      .from('wa_conversation_assignment_events_view')
      .select(
        // SELECT explicito · campos seguros · NUNCA old_data/new_data/audit_id.
        'audit_at, assignment_action, ' +
          'from_owner, from_assigned_to_name, ' +
          'to_owner, to_assigned_to_name, ' +
          'actor_role, audit_reason, ' +
          'phone, display_name, status',
      )
      .eq('clinic_id', clinicId)
      .eq('conversation_id', conversationId)
      .order('audit_at', { ascending: false })
      .limit(Math.max(1, Math.min(50, limit)))

    if (error || !data) return []

    return data.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = r as any
      return {
        auditAt: String(row.audit_at ?? ''),
        assignmentAction: String(row.assignment_action ?? 'updated'),
        fromOwner: String(row.from_owner ?? 'responsavel'),
        fromAssignedToName: row.from_assigned_to_name ?? null,
        toOwner: String(row.to_owner ?? 'responsavel'),
        toAssignedToName: row.to_assigned_to_name ?? null,
        actorRole: row.actor_role ?? null,
        auditReason: row.audit_reason ?? null,
        phone: row.phone ?? null,
        displayName: row.display_name ?? null,
        status: row.status ?? null,
      }
    })
  }

  /**
   * Log global de assignment events da clinica · le da view semantica
   * public.wa_conversation_assignment_events_view (Mig 148 · grants 149).
   *
   * Diferente de getAssignmentEvents(conversationId, ...) que escopa por
   * conversa, este metodo escopa por clinic e aplica filtros opcionais
   * pra alimentar pagina global de Logs de Transferencias.
   *
   * Defaults:
   *   - limit: 50 · cap 200
   *   - excludeProfileChanged: true (profile_changed eh ruido tecnico ·
   *     so aparece se filters.includeTechnical=true)
   *   - ordem: audit_at DESC (api ja eh DESC · view nao tem default · explicit)
   *
   * Filtros opcionais:
   *   - action · assignment_action exato
   *   - fromOwner / toOwner · from_owner / to_owner exatos
   *   - actorRole · actor_role exato
   *   - q · busca em display_name OU phone via ilike
   *   - dateFrom / dateTo · ISO timestamp · audit_at >= dateFrom AND <= dateTo
   *   - includeTechnical · false (default) exclui profile_changed
   *
   * Retorna conversation_id (uso futuro · UI pode navegar pra conversa) ·
   * nao expoe audit_id, old_data, new_data, changed_fields.
   */
  async getAssignmentEventsLog(
    clinicId: string,
    filters: {
      limit?: number
      action?: string | null
      fromOwner?: string | null
      toOwner?: string | null
      actorRole?: string | null
      q?: string | null
      includeTechnical?: boolean
      dateFrom?: string | null
      dateTo?: string | null
    } = {},
  ): Promise<
    Array<{
      auditAt: string
      assignmentAction: string
      fromOwner: string
      fromAssignedToName: string | null
      toOwner: string
      toAssignedToName: string | null
      actorRole: string | null
      auditReason: string | null
      phone: string | null
      displayName: string | null
      status: string | null
      conversationId: string | null
    }>
  > {
    const limit = Math.max(1, Math.min(200, filters.limit ?? 50))
    const includeTechnical = filters.includeTechnical === true

    let query = this.supabase
      .from('wa_conversation_assignment_events_view')
      .select(
        // SELECT explicito · campos seguros · NUNCA audit_id/old_data/new_data/changed_fields.
        // conversation_id incluido pra navegacao futura (Spec UI 2026-05-08).
        'audit_at, assignment_action, ' +
          'from_owner, from_assigned_to_name, ' +
          'to_owner, to_assigned_to_name, ' +
          'actor_role, audit_reason, ' +
          'phone, display_name, status, ' +
          'conversation_id',
      )
      .eq('clinic_id', clinicId)

    if (!includeTechnical) {
      query = query.neq('assignment_action', 'profile_changed')
    }
    if (filters.action) {
      query = query.eq('assignment_action', filters.action)
    }
    if (filters.fromOwner) {
      query = query.eq('from_owner', filters.fromOwner)
    }
    if (filters.toOwner) {
      query = query.eq('to_owner', filters.toOwner)
    }
    if (filters.actorRole) {
      query = query.eq('actor_role', filters.actorRole)
    }
    if (filters.dateFrom) {
      const d = new Date(filters.dateFrom)
      if (!Number.isNaN(d.getTime())) {
        query = query.gte('audit_at', d.toISOString())
      }
    }
    if (filters.dateTo) {
      const d = new Date(filters.dateTo)
      if (!Number.isNaN(d.getTime())) {
        query = query.lte('audit_at', d.toISOString())
      }
    }
    if (filters.q && filters.q.trim().length > 0) {
      // Sanitiza pra evitar quebra do PostgREST .or() · escapa virgula/parenteses
      // que tem semantica de separador. ilike eh case-insensitive.
      const safe = filters.q.trim().replace(/[,()]/g, ' ')
      // .or() aceita CSV de filtros · busca em display_name OU phone
      query = query.or(`display_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
    }

    const { data, error } = await query
      .order('audit_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    return data.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = r as any
      return {
        auditAt: String(row.audit_at ?? ''),
        assignmentAction: String(row.assignment_action ?? 'updated'),
        fromOwner: String(row.from_owner ?? 'responsavel'),
        fromAssignedToName: row.from_assigned_to_name ?? null,
        toOwner: String(row.to_owner ?? 'responsavel'),
        toAssignedToName: row.to_assigned_to_name ?? null,
        actorRole: row.actor_role ?? null,
        auditReason: row.audit_reason ?? null,
        phone: row.phone ?? null,
        displayName: row.display_name ?? null,
        status: row.status ?? null,
        conversationId: row.conversation_id ?? null,
      }
    })
  }

  /**
   * Sprint B (2026-04-29): Copiloto AI cache.
   * getCopilot le ai_copilot + ai_copilot_at + last_message_at pra decidir
   * se cache esta fresco. Tolerante a coluna ausente (migration pode nao
   * ter sido aplicada ainda) · retorna null sem propagar erro.
   */
  async getCopilot(conversationId: string): Promise<{
    aiCopilot: unknown | null
    aiCopilotAt: string | null
    lastMessageAt: string | null
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('wa_conversations')
        .select('ai_copilot, ai_copilot_at, last_message_at')
        .eq('id', conversationId)
        .maybeSingle()
      if (error || !data) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data as any
      return {
        aiCopilot: row.ai_copilot ?? null,
        aiCopilotAt: row.ai_copilot_at ?? null,
        lastMessageAt: row.last_message_at ?? null,
      }
    } catch {
      // Coluna ainda nao existe (migration pendente) · degrada silencioso
      return null
    }
  }

  /**
   * Sprint B: Persiste output do copiloto AI no cache. Idempotente · sobrescreve
   * versao anterior. Tolerante a coluna ausente.
   */
  async updateCopilot(conversationId: string, copilot: unknown): Promise<void> {
    try {
      await this.supabase
        .from('wa_conversations')
        .update({
          ai_copilot: copilot,
          ai_copilot_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    } catch {
      // Coluna ausente · ignora silencioso · proxima request re-gera
    }
  }

  async setReactivationSent(conversationId: string, value = true): Promise<void> {
    await this.supabase
      .from('wa_conversations')
      .update({ reactivation_sent: value })
      .eq('id', conversationId)
  }

  /**
   * Busca conversations 'active' candidatas a reativação D1 (cron 23h-26h).
   * Retorna campos mínimos · cron usa só id/phone/lead_id/clinic_id.
   */
  async findReactivationCandidates(window: {
    olderThan: string
    newerThan: string
  }): Promise<Array<{
    id: string
    phone: string
    leadId: string | null
    clinicId: string
    waNumberId: string | null
  }>> {
    // Camada 3.5 (audit 2026-04-28): incluido wa_number_id pra cron
    // reactivate poder resolver credenciais Cloud API per-tenant via
    // createWhatsAppCloudFromWaNumber. Sem isso, fallback env global.
    const { data } = await this.supabase
      .from('wa_conversations')
      .select('id, phone, lead_id, clinic_id, wa_number_id')
      .eq('status', 'active')
      .eq('reactivation_sent', false)
      .lte('last_lead_msg', window.olderThan)
      .gte('last_lead_msg', window.newerThan)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      phone: String(r.phone ?? ''),
      leadId: r.lead_id ?? null,
      clinicId: String(r.clinic_id),
      waNumberId: r.wa_number_id ?? null,
    }))
  }
}
