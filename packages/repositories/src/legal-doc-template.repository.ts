/**
 * LegalDocTemplateRepository · CRUD de templates de documentos legais.
 *
 * Espelha a logica do legacy clinic-dashboard (mig 20260636) · agora portado
 * pra Mira (Onda 4 · 2026-04-26). Templates sao reutilizaveis · podem virar
 * termo de contrato, autorizacao de uso de imagem, LGPD, etc.
 *
 * RPCs (security definer):
 *   - legal_doc_list_templates() · lista todos da clinica (RLS filtra)
 *   - legal_doc_upsert_template(p_id, p_slug, p_name, ...) · cria/atualiza
 *   - (archive · UPDATE direto via repo · trigger de soft-delete)
 *
 * Boundary ADR-005 · DTO camelCase. Multi-tenant ADR-028 · clinic_id
 * resolvido pela RPC via app_clinic_id().
 */

import type { SupabaseClient } from '@supabase/supabase-js'
export type LegalDocType = 'uso_imagem' | 'procedimento' | 'anestesia' | 'lgpd' | 'contrato' | 'custom'

export interface LegalDocTemplateDTO {
  id: string
  clinicId: string
  slug: string
  name: string
  docType: LegalDocType | string
  content: string
  variables: string[]
  version: number
  isActive: boolean
  triggerStatus: string | null
  triggerProcedures: string[] | null
  professionalId: string | null
  redirectUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface LegalDocTemplateUpsertInput {
  id?: string
  slug?: string
  name: string
  docType?: LegalDocType | string
  content: string
  variables?: string[]
  isActive?: boolean
  triggerStatus?: string | null
  triggerProcedures?: string[] | null
  professionalId?: string | null
  redirectUrl?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplateRow(r: any): LegalDocTemplateDTO {
  return {
    id: String(r.id),
    clinicId: String(r.clinic_id ?? ''),
    slug: String(r.slug ?? ''),
    name: String(r.name ?? ''),
    docType: (r.doc_type ?? 'custom') as LegalDocType | string,
    content: String(r.content ?? ''),
    variables: Array.isArray(r.variables) ? r.variables.map(String) : [],
    version: Number(r.version ?? 1),
    isActive: r.is_active === true,
    triggerStatus: r.trigger_status ?? null,
    triggerProcedures: Array.isArray(r.trigger_procedures) ? r.trigger_procedures.map(String) : null,
    professionalId: r.professional_id ?? null,
    redirectUrl: r.redirect_url ?? null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }
}

export class LegalDocTemplateRepository {
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista templates da clinica (apenas nao deletados). RLS filtra clinic_id.
   */
  async list(): Promise<LegalDocTemplateDTO[]> {
    const { data, error } = await this.supabase.rpc('legal_doc_list_templates')
    if (error) return []
    const obj = data as { ok?: boolean; data?: unknown[] }
    if (!obj || obj.ok !== true || !Array.isArray(obj.data)) return []
    return obj.data.map(mapTemplateRow)
  }

  /**
   * Lista somente ativos (filtra is_active=true).
   */
  async listActive(): Promise<LegalDocTemplateDTO[]> {
    const all = await this.list()
    return all.filter((t) => t.isActive)
  }

  async getById(id: string): Promise<LegalDocTemplateDTO | null> {
    const { data, error } = await this.supabase
      .from('legal_doc_templates')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error || !data) return null
    return mapTemplateRow(data)
  }

  /**
   * Cria ou atualiza template via RPC (admin/owner).
   */
  async upsert(
    input: LegalDocTemplateUpsertInput,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('legal_doc_upsert_template', {
      p_id: input.id ?? null,
      p_slug: input.slug ?? null,
      p_name: input.name,
      p_doc_type: input.docType ?? 'custom',
      p_content: input.content,
      p_variables: input.variables ?? null,
      p_is_active: input.isActive ?? true,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; id?: string; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }

    // Se houver triggers/redirect/professional · update direto (RPC base nao cobre)
    if (
      obj.id &&
      (input.triggerStatus !== undefined ||
        input.triggerProcedures !== undefined ||
        input.professionalId !== undefined ||
        input.redirectUrl !== undefined)
    ) {
      const patch: Record<string, unknown> = {}
      if (input.triggerStatus !== undefined) patch.trigger_status = input.triggerStatus
      if (input.triggerProcedures !== undefined) patch.trigger_procedures = input.triggerProcedures
      if (input.professionalId !== undefined) patch.professional_id = input.professionalId
      if (input.redirectUrl !== undefined) patch.redirect_url = input.redirectUrl
      patch.updated_at = new Date().toISOString()
      await this.supabase.from('legal_doc_templates').update(patch).eq('id', obj.id)
    }

    return { ok: true, id: obj.id }
  }

  /**
   * Arquiva template · soft-delete (deleted_at = now()). RLS exige admin/owner.
   */
  async archive(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('legal_doc_templates')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Renderiza template substituindo {{variavel}} por valor. Espelha
   * legal-documents.service.js#renderTemplate (legacy).
   */
  static render(content: string, vars: Record<string, string | number | null | undefined>): string {
    if (!content) return ''
    return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = vars[key]
      return v != null ? String(v) : ''
    })
  }
}
