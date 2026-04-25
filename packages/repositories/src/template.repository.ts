/**
 * TemplateRepository · acesso canonico a `wa_message_templates`.
 *
 * Soft delete: marca is_active=false em vez de DELETE (audit-safe).
 * Tabela tem campos legacy duplicados (active + is_active) · mantemos sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { mapTemplateRow, type CreateTemplateInput, type TemplateDTO } from './types'

export class TemplateRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista templates da clinica · default ordena por sort_order asc, name asc.
   * Inclui inativos (caller filtra) pra evitar segunda query na pagina de admin.
   */
  async listAll(clinicId: string): Promise<TemplateDTO[]> {
    const { data } = await this.supabase
      .from('wa_message_templates')
      .select('id, name, message, content, category, trigger_phase, active, is_active, sort_order, created_at, clinic_id')
      .eq('clinic_id', clinicId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    return (data ?? []).map(mapTemplateRow)
  }

  /**
   * Lista somente ativos (is_active=true AND active=true).
   */
  async listActive(clinicId: string): Promise<TemplateDTO[]> {
    const all = await this.listAll(clinicId)
    return all.filter((t) => t.isActive && t.active)
  }

  async create(clinicId: string, input: CreateTemplateInput): Promise<void> {
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 60)

    await this.supabase.from('wa_message_templates').insert({
      clinic_id: clinicId,
      name: input.name,
      content: input.content,
      message: input.content, // legacy column · sync
      category: input.category ?? 'quick_reply',
      sort_order: input.sortOrder ?? 0,
      trigger_phase: input.triggerPhase ?? null,
      is_active: true,
      active: true,
      type: 'manual',
      slug,
    })
  }

  /**
   * Soft delete · is_active=false + active=false. Mantem row pra audit.
   */
  async softDelete(clinicId: string, id: string): Promise<void> {
    await this.supabase
      .from('wa_message_templates')
      .update({ is_active: false, active: false })
      .eq('id', id)
      .eq('clinic_id', clinicId)
  }
}
