/**
 * B2BCommTemplateRepository · b2b_comm_templates (clinic-dashboard mig 0509).
 *
 * Templates de comunicacao B2B em DB · 13 seeds em prod cobrem:
 * - partnership_activated (text + audio · welcome)
 * - voucher_issued_beneficiary (audio · Lara/Mih voice)
 * - voucher_issued_partner (text · confirma pra parceira)
 * - voucher_opened, voucher_scheduled, voucher_expiring_3d, voucher_expired
 * - voucher_cap_reached
 * - monthly_report
 *
 * Decisao Alden: nao hardcodar templates no codigo · sempre vir do DB pra
 * Mirian editar via UI admin (entra na P1).
 *
 * partnership_id NULL = template global · uuid = override por parceria.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Mig 800-41 · catalogo de event_keys vira tabela editavel.
 * Bucket = string livre (UI sugere parceiros/convidadas/admin).
 */
export interface B2BCommEventKeyDTO {
  id: string
  clinicId: string
  key: string
  label: string
  bucket: string
  groupLabel: string
  recipientRole: string
  triggerDesc: string | null
  isSystem: boolean
  isActive: boolean
  sortOrder: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEventKeyRow(row: any): B2BCommEventKeyDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    key: String(row.key),
    label: String(row.label ?? row.key),
    bucket: String(row.bucket ?? 'parceiros'),
    groupLabel: String(row.group_label ?? 'Outros'),
    recipientRole: String(row.recipient_role ?? 'partner'),
    triggerDesc: row.trigger_desc ?? null,
    isSystem: row.is_system === true,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 100),
  }
}

export interface B2BCommTemplateDTO {
  id: string
  clinicId: string
  partnershipId: string | null
  eventKey: string
  channel: 'text' | 'audio' | 'both'
  recipientRole: string
  senderInstance: string
  delayMinutes: number
  cronExpr: string | null
  textTemplate: string | null
  audioScript: string | null
  ttsVoice: string | null
  ttsInstructions: string | null
  isActive: boolean
  priority: number
  notes: string | null
  /** Mig 800-24 · nome da sequencia organizacional (null = template solto) */
  sequenceName: string | null
  /** Mig 800-24 · posicao 0-based dentro da sequencia */
  sequenceOrder: number
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplateRow(row: any): B2BCommTemplateDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    partnershipId: row.partnership_id ?? null,
    eventKey: String(row.event_key ?? ''),
    channel: (row.channel ?? 'text') as B2BCommTemplateDTO['channel'],
    recipientRole: String(row.recipient_role ?? 'partner'),
    senderInstance: String(row.sender_instance ?? 'mira-mirian'),
    delayMinutes: Number(row.delay_minutes ?? 0),
    cronExpr: row.cron_expr ?? null,
    textTemplate: row.text_template ?? null,
    audioScript: row.audio_script ?? null,
    ttsVoice: row.tts_voice ?? null,
    ttsInstructions: row.tts_instructions ?? null,
    isActive: row.is_active !== false,
    priority: Number(row.priority ?? 100),
    notes: row.notes ?? null,
    sequenceName: row.sequence_name ?? null,
    sequenceOrder: Number(row.sequence_order ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

export class B2BCommTemplateRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Resolve template ativo · prioriza override por parceria, fallback pra global.
   * Multiplos hits: ordena por priority ASC (1=alto, 100=default).
   */
  async getByEventKey(
    clinicId: string,
    eventKey: string,
    partnershipId?: string,
  ): Promise<B2BCommTemplateDTO | null> {
    // Tenta override por parceria primeiro
    if (partnershipId) {
      const { data } = await this.supabase
        .from('b2b_comm_templates')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('event_key', eventKey)
        .eq('partnership_id', partnershipId)
        .eq('is_active', true)
        .order('priority', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (data) return mapTemplateRow(data)
    }

    // Fallback global (partnership_id IS NULL)
    const { data: globalData } = await this.supabase
      .from('b2b_comm_templates')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('event_key', eventKey)
      .is('partnership_id', null)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(1)
      .maybeSingle()

    return globalData ? mapTemplateRow(globalData) : null
  }

  /**
   * Lista todos templates pra UI admin · suporta filtro por eventKey/partnership.
   */
  async listAll(
    clinicId: string,
    filters: { eventKey?: string; partnershipId?: string | null } = {},
  ): Promise<B2BCommTemplateDTO[]> {
    let q = this.supabase
      .from('b2b_comm_templates')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('event_key', { ascending: true })
      .order('priority', { ascending: true })

    if (filters.eventKey) q = q.eq('event_key', filters.eventKey)
    if (filters.partnershipId === null) q = q.is('partnership_id', null)
    else if (filters.partnershipId) q = q.eq('partnership_id', filters.partnershipId)

    const { data } = await q
    return (data ?? []).map(mapTemplateRow)
  }

  async create(input: Partial<B2BCommTemplateDTO>): Promise<B2BCommTemplateDTO | null> {
    const { data } = await this.supabase
      .from('b2b_comm_templates')
      .insert({
        clinic_id: input.clinicId,
        partnership_id: input.partnershipId ?? null,
        event_key: input.eventKey,
        channel: input.channel ?? 'text',
        recipient_role: input.recipientRole ?? 'partner',
        sender_instance: input.senderInstance ?? 'mira-mirian',
        delay_minutes: input.delayMinutes ?? 0,
        cron_expr: input.cronExpr ?? null,
        text_template: input.textTemplate ?? null,
        audio_script: input.audioScript ?? null,
        tts_voice: input.ttsVoice ?? null,
        tts_instructions: input.ttsInstructions ?? null,
        is_active: input.isActive !== false,
        priority: input.priority ?? 100,
        notes: input.notes ?? null,
      })
      .select()
      .single()
    return data ? mapTemplateRow(data) : null
  }

  async update(id: string, patch: Partial<B2BCommTemplateDTO>): Promise<B2BCommTemplateDTO | null> {
    const update: Record<string, unknown> = {}
    if (patch.textTemplate !== undefined) update.text_template = patch.textTemplate
    if (patch.audioScript !== undefined) update.audio_script = patch.audioScript
    if (patch.channel) update.channel = patch.channel
    if (patch.delayMinutes != null) update.delay_minutes = patch.delayMinutes
    if (patch.priority != null) update.priority = patch.priority
    if (patch.isActive !== undefined) update.is_active = patch.isActive
    if (patch.notes !== undefined) update.notes = patch.notes
    if (patch.ttsVoice !== undefined) update.tts_voice = patch.ttsVoice
    if (patch.ttsInstructions !== undefined) update.tts_instructions = patch.ttsInstructions

    if (Object.keys(update).length === 0) return null
    const { data } = await this.supabase
      .from('b2b_comm_templates')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    return data ? mapTemplateRow(data) : null
  }

  async softDelete(id: string): Promise<void> {
    await this.supabase
      .from('b2b_comm_templates')
      .update({ is_active: false })
      .eq('id', id)
  }

  // ─── RPC wrappers (espelho 1:1 do b2b.comm-templates.repository.js) ────
  // Estes metodos retornam o shape RAW do RPC porque a UI Comm consome os
  // campos snake_case originais (event_key, text_template, etc). Usar a UI
  // de admin com camelCase exigiria reescrever 8 arquivos UI · nao vale.

  /**
   * Lista templates via RPC · usado pela tab Comm (Disparos · Templates).
   * RPC: b2b_comm_templates_list(p_event_key, p_partnership_id).
   * Retorna shape raw da tabela b2b_comm_templates.
   */
  async list(opts: {
    eventKey?: string | null
    partnershipId?: string | null
  } = {}): Promise<B2BCommTemplateRaw[]> {
    const { data, error } = await this.supabase.rpc('b2b_comm_templates_list', {
      p_event_key: opts.eventKey ?? null,
      p_partnership_id: opts.partnershipId ?? null,
    })
    if (error || !Array.isArray(data)) return []
    return data as B2BCommTemplateRaw[]
  }

  /**
   * Upsert template via RPC · cria se id ausente, atualiza se presente.
   * RPC: b2b_comm_template_upsert(p_payload jsonb).
   * Aceita raw snake_case (editor da UI Comm produz nesse shape).
   */
  async upsert(
    payload: Omit<Partial<B2BCommTemplateRaw>, 'id'> & { id?: string | null },
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const dbPayload: Record<string, unknown> = {
      id: payload.id || null,
      partnership_id: payload.partnership_id ?? null,
      event_key: payload.event_key,
      channel: payload.channel ?? 'text',
      recipient_role: payload.recipient_role ?? 'partner',
      sender_instance: payload.sender_instance ?? 'mira-mirian',
      delay_minutes: payload.delay_minutes ?? 0,
      cron_expr: payload.cron_expr ?? null,
      text_template: payload.text_template ?? null,
      audio_script: payload.audio_script ?? null,
      tts_voice: payload.tts_voice ?? null,
      tts_instructions: payload.tts_instructions ?? null,
      is_active: payload.is_active !== false,
      priority: payload.priority ?? 100,
      notes: payload.notes ?? null,
    }
    const { data, error } = await this.supabase.rpc('b2b_comm_template_upsert', {
      p_payload: dbPayload,
    })
    if (error) return { ok: false, error: error.message }
    const result = data as { ok?: boolean; id?: string; error?: string }
    return { ok: result?.ok === true, id: result?.id, error: result?.error }
  }

  /**
   * Mig 800-24 · move template pra nova posicao dentro da mesma sequencia.
   * RPC: b2b_comm_template_reorder(p_id, p_new_order).
   */
  async reorder(
    id: string,
    newOrder: number,
  ): Promise<{ ok: boolean; sequence_name?: string | null; new_order?: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_comm_template_reorder', {
      p_id: id,
      p_new_order: newOrder,
    })
    if (error) return { ok: false, error: error.message }
    const r = data as { ok?: boolean; sequence_name?: string | null; new_order?: number; error?: string }
    return {
      ok: r?.ok === true,
      sequence_name: r?.sequence_name ?? null,
      new_order: r?.new_order,
      error: r?.error,
    }
  }

  /**
   * Mig 800-24 · atribui template a uma sequencia (vai pro fim da fila)
   * ou desatribui passando sequenceName=null.
   * RPC: b2b_comm_template_assign_sequence(p_id, p_sequence_name).
   */
  async assignToSequence(
    id: string,
    sequenceName: string | null,
  ): Promise<{ ok: boolean; sequence_name?: string | null; sequence_order?: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_comm_template_assign_sequence', {
      p_id: id,
      p_sequence_name: sequenceName,
    })
    if (error) return { ok: false, error: error.message }
    const r = data as {
      ok?: boolean
      sequence_name?: string | null
      sequence_order?: number
      error?: string
    }
    return {
      ok: r?.ok === true,
      sequence_name: r?.sequence_name ?? null,
      sequence_order: r?.sequence_order,
      error: r?.error,
    }
  }

  /**
   * Mig 800-24 · lista todas sequencias agrupadas + grupo "Sem sequencia" no
   * fim. Usa direct query (select *) pra garantir leitura das colunas novas
   * mesmo que o RPC legacy `b2b_comm_templates_list` nao as exponha ainda.
   */
  async listSequences(clinicId: string): Promise<B2BCommTemplateSequenceGroup[]> {
    const { data } = await this.supabase
      .from('b2b_comm_templates')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('sequence_name', { ascending: true, nullsFirst: false })
      .order('sequence_order', { ascending: true })
      .order('priority', { ascending: true })

    const rows = (data ?? []).map(mapTemplateRow)
    const map = new Map<string | null, B2BCommTemplateDTO[]>()
    for (const t of rows) {
      const key = t.sequenceName ?? null
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }

    const named: B2BCommTemplateSequenceGroup[] = []
    let unassigned: B2BCommTemplateSequenceGroup | null = null
    for (const [name, templates] of map.entries()) {
      if (name === null) {
        unassigned = { name: null, templates }
      } else {
        templates.sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        named.push({ name, templates })
      }
    }
    named.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    if (unassigned) named.push(unassigned)
    return named
  }

  /**
   * Remove template via RPC · soft delete.
   * RPC: b2b_comm_template_delete(p_id).
   */
  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_comm_template_delete', { p_id: id })
    if (error) return { ok: false, error: error.message }
    return { ok: (data as { ok?: boolean })?.ok === true }
  }

  /**
   * Catalogo de eventos disponiveis · usado pra dropdown de eventKey.
   * RPC: b2b_comm_events_catalog() retorna jsonb agrupado:
   * [{group, events:[{key, label, trigger?, recipient}]}]
   */
  async eventsCatalog(): Promise<B2BCommEventCatalog> {
    const { data, error } = await this.supabase.rpc('b2b_comm_events_catalog')
    if (error || !Array.isArray(data)) return []
    return data as B2BCommEventCatalog
  }

  /**
   * Stats de comm · KPIs pra sidebar (templates ativos, sent 30d, taxa
   * envio, parceiras ativas).
   * RPC: b2b_comm_stats() retorna shape raw com snake_case (active_templates,
   * events_configured, sent_30d, failed_30d, attempted_30d, delivered_ok_30d,
   * delivery_rate_30d, partners_with_send_30d).
   */
  async stats(): Promise<B2BCommStats | null> {
    const { data, error } = await this.supabase.rpc('b2b_comm_stats')
    if (error || !data) return null
    return data as B2BCommStats
  }

  /**
   * Historico de envios · ultimas N dispatches.
   * RPC: b2b_comm_history(p_limit, p_event_key, p_partnership_id) retorna
   * tabela com snake_case (id, partnership_name, event_key, channel,
   * recipient_role, recipient_phone, sender_instance, text_content, status,
   * error_message, created_at).
   */
  async history(opts: {
    limit?: number
    eventKey?: string | null
    partnershipId?: string | null
  } = {}): Promise<B2BCommHistoryEntry[]> {
    const { data, error } = await this.supabase.rpc('b2b_comm_history', {
      p_limit: opts.limit ?? 50,
      p_event_key: opts.eventKey ?? null,
      p_partnership_id: opts.partnershipId ?? null,
    })
    if (error || !Array.isArray(data)) return []
    return data as B2BCommHistoryEntry[]
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mig 800-41 · catalogo editavel de event_keys (b2b_comm_event_keys)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Lista event_keys ativos · UI usa pra montar rail de buckets + dropdown.
   */
  async listEventKeys(clinicId: string): Promise<B2BCommEventKeyDTO[]> {
    const { data, error } = await this.supabase
      .from('b2b_comm_event_keys')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('bucket')
      .order('sort_order')
    if (error || !Array.isArray(data)) return []
    return data.map(mapEventKeyRow)
  }

  /**
   * Cria/edita event_key custom · permite "zero estrutura rigida" pra testes.
   * RPC b2b_comm_event_key_upsert valida + insert/update.
   */
  async upsertEventKey(payload: {
    key: string
    label?: string
    bucket?: string
    groupLabel?: string
    recipientRole?: string
    triggerDesc?: string | null
    isActive?: boolean
    sortOrder?: number
  }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_comm_event_key_upsert', {
      p_payload: {
        key: payload.key,
        label: payload.label,
        bucket: payload.bucket,
        group_label: payload.groupLabel,
        recipient_role: payload.recipientRole,
        trigger_desc: payload.triggerDesc,
        is_active: payload.isActive,
        sort_order: payload.sortOrder,
      },
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; id?: string; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true, id: obj.id }
  }

  /**
   * Remove event_key custom · system keys (is_system=true) protegidas.
   */
  async deleteEventKey(key: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_comm_event_key_delete', {
      p_key: key,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Tipos raw (snake_case · espelham os RPCs · UI Comm consome direto)
// ═══════════════════════════════════════════════════════════════════════

export interface B2BCommTemplateRaw {
  id: string
  clinic_id: string
  partnership_id: string | null
  event_key: string
  channel: 'text' | 'audio' | 'both'
  recipient_role: 'partner' | 'beneficiary' | 'admin'
  sender_instance: string
  delay_minutes: number
  cron_expr: string | null
  text_template: string | null
  audio_script: string | null
  tts_voice: string | null
  tts_instructions: string | null
  is_active: boolean
  priority: number
  notes: string | null
  /** Mig 800-24 · pode ser undefined se o RPC legacy ainda nao expor */
  sequence_name?: string | null
  /** Mig 800-24 · pode ser undefined se o RPC legacy ainda nao expor */
  sequence_order?: number
  created_at: string
  updated_at: string
}

/** Mig 800-24 · agrupamento usado pelo painel de Sequencias da UI Comm. */
export interface B2BCommTemplateSequenceGroup {
  /** null = grupo "Sem sequencia" (templates soltos) */
  name: string | null
  templates: B2BCommTemplateDTO[]
}

export interface B2BCommEventDef {
  key: string
  label: string
  trigger?: string
  /** String livre desde mig 800-41 (era union). UI sugere parceiros/convidadas/admin. */
  recipient?: string
  /** Mig 800-41 · bucket pra filtro (parceiros/convidadas/admin · string livre). */
  bucket?: string
  /** Mig 800-41 · system keys nao podem ser deletadas via UI. */
  is_system?: boolean
}

export type B2BCommEventCatalog = Array<{
  group: string
  /** Mig 800-41 · bucket do grupo (parceiros/convidadas/admin). */
  bucket?: string
  events: B2BCommEventDef[]
}>

export interface B2BCommStats {
  ok?: boolean
  active_templates: number | null
  events_configured: number | null
  sent_30d: number | null
  failed_30d?: number | null
  attempted_30d?: number | null
  delivered_ok_30d?: number | null
  delivery_rate_30d: number | null
  partners_with_send_30d: number | null
}

export interface B2BCommHistoryEntry {
  id: string
  partnership_id: string | null
  partnership_name: string | null
  event_key: string
  channel: 'text' | 'audio' | 'both'
  recipient_role: 'partner' | 'beneficiary' | 'admin'
  recipient_phone: string | null
  sender_instance: string
  text_content: string | null
  status: 'sent' | 'failed' | 'skipped'
  error_message: string | null
  created_at: string
}
