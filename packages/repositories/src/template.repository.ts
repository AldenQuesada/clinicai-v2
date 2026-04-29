/**
 * TemplateRepository · acesso canonico a `wa_message_templates`.
 *
 * Soft delete: marca is_active=false em vez de DELETE (audit-safe).
 * Tabela tem campos legacy duplicados (active + is_active · message + content)
 * · mantemos sync.
 *
 * Schema completo (paridade clinic-dashboard agenda-mensagens.js):
 *   - type   text · 8 valores: confirmacao/lembrete/engajamento/boas_vindas/
 *            consent_img/consent_info/manual/null (cor+icone na timeline)
 *   - day    int  · -7 a +30 (dias relativos a consulta)
 *   - active bool · ativo/inativo (toggle UI)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  mapTemplateRow,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type TemplateDTO,
} from './types'
import type { Database } from '@clinicai/supabase'

export class TemplateRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /** Lista templates da clinica · ordena por sort_order asc, day asc, name asc. */
  async listAll(clinicId: string): Promise<TemplateDTO[]> {
    const { data } = await this.supabase
      .from('wa_message_templates')
      .select(
        'id, name, message, content, category, trigger_phase, type, day, active, is_active, sort_order, created_at, clinic_id',
      )
      .eq('clinic_id', clinicId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('day', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    return (data ?? []).map(mapTemplateRow)
  }

  /** Lista somente ativos (is_active=true AND active=true). */
  async listActive(clinicId: string): Promise<TemplateDTO[]> {
    const all = await this.listAll(clinicId)
    return all.filter((t) => t.isActive && t.active)
  }

  async create(clinicId: string, input: CreateTemplateInput): Promise<string> {
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 60)

    const { data, error } = await this.supabase
      .from('wa_message_templates')
      .insert({
        clinic_id: clinicId,
        name: input.name,
        content: input.content,
        message: input.content, // legacy column · sync
        category: input.category ?? 'quick_reply',
        sort_order: input.sortOrder ?? 0,
        trigger_phase: input.triggerPhase ?? null,
        type: input.type ?? 'manual',
        day: input.day ?? null,
        is_active: input.active !== false,
        active: input.active !== false,
        slug,
      })
      .select('id')
      .single()

    if (error) throw error
    return String(data?.id ?? '')
  }

  /** Update parcial · so atualiza campos enviados. */
  async update(
    clinicId: string,
    id: string,
    input: UpdateTemplateInput,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {}
    if (input.name !== undefined) update.name = input.name
    if (input.content !== undefined) {
      update.content = input.content
      update.message = input.content // legacy sync
    }
    if (input.category !== undefined) update.category = input.category
    if (input.sortOrder !== undefined) update.sort_order = input.sortOrder
    if (input.triggerPhase !== undefined) update.trigger_phase = input.triggerPhase
    if (input.type !== undefined) update.type = input.type
    if (input.day !== undefined) update.day = input.day
    if (input.active !== undefined) {
      update.active = input.active
      update.is_active = input.active // legacy sync
    }

    if (Object.keys(update).length === 0) return

    await this.supabase
      .from('wa_message_templates')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('id', id)
      .eq('clinic_id', clinicId)
  }

  /** Toggle active/inactive (sem hard delete). */
  async setActive(clinicId: string, id: string, active: boolean): Promise<void> {
    await this.supabase
      .from('wa_message_templates')
      .update({ active, is_active: active })
      .eq('id', id)
      .eq('clinic_id', clinicId)
  }

  /** Soft delete · is_active=false + active=false. Mantem row pra audit. */
  async softDelete(clinicId: string, id: string): Promise<void> {
    await this.setActive(clinicId, id, false)
  }
}
