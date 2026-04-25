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

export interface B2BCommTemplateDTO {
  id: string
  clinicId: string
  partnershipId: string | null
  eventKey: string
  channel: 'text' | 'audio' | 'both'
  recipientRole: 'partner' | 'beneficiary' | 'admin'
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
    recipientRole: (row.recipient_role ?? 'partner') as B2BCommTemplateDTO['recipientRole'],
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
}
