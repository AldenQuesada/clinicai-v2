/**
 * WaMediaBankRepository · acesso canonico a `wa_media_bank`.
 *
 * Banco de fotos antes/depois categorizadas (queixa + funnel + phase).
 * Usado por:
 *   - apps/lara/src/lib/webhook/media-dispatch.ts (RPC wa_get_media)
 *   - apps/lara/src/app/midia/* (UI CRUD)
 *
 * Soft delete: is_active=false (audit-safe · mantem URL/file no Storage).
 * Multi-tenant ADR-028 · clinic_id explicito em toda operacao.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type MediaFunnel = 'olheiras' | 'fullface' | null

export type PhotoTag =
  | 'geral'
  | 'olheiras'
  | 'sulcos'
  | 'flacidez'
  | 'contorno'
  | 'papada'
  | 'textura'
  | 'rugas'
  | 'rejuvenescimento'
  | 'fullface'
  | 'firmeza'
  | 'manchas'
  | 'mandibula'
  | 'perfil'
  | 'bigode_chines'

export const KNOWN_PHOTO_TAGS: readonly PhotoTag[] = [
  'geral',
  'olheiras',
  'sulcos',
  'flacidez',
  'contorno',
  'papada',
  'textura',
  'rugas',
  'rejuvenescimento',
  'fullface',
  'firmeza',
  'manchas',
  'mandibula',
  'perfil',
  'bigode_chines',
] as const

export interface WaMediaBankDTO {
  id: string
  clinicId: string
  filename: string
  url: string
  category: string
  funnel: string | null
  queixas: string[]
  phase: string | null
  caption: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
}

export interface CreateMediaInput {
  filename: string
  url: string
  category?: string
  funnel?: string | null
  queixas?: string[]
  phase?: string | null
  caption?: string | null
  isActive?: boolean
  sortOrder?: number
}

export interface UpdateMediaInput {
  filename?: string
  caption?: string | null
  funnel?: string | null
  queixas?: string[]
  phase?: string | null
  isActive?: boolean
  sortOrder?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): WaMediaBankDTO {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    filename: String(row.filename ?? ''),
    url: String(row.url ?? ''),
    category: String(row.category ?? 'before_after'),
    funnel: row.funnel ?? null,
    queixas: Array.isArray(row.queixas) ? row.queixas : [],
    phase: row.phase ?? null,
    caption: row.caption ?? null,
    isActive: row.is_active !== false,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    createdAt: String(row.created_at ?? ''),
  }
}

export class WaMediaBankRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista todas as midias da clinica (ativas e inativas) · ordena por sort_order.
   */
  async listAll(clinicId: string): Promise<WaMediaBankDTO[]> {
    const { data } = await this.supabase
      .from('wa_media_bank')
      .select(
        'id, clinic_id, filename, url, category, funnel, queixas, phase, caption, is_active, sort_order, created_at',
      )
      .eq('clinic_id', clinicId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    return (data ?? []).map(mapRow)
  }

  async findById(clinicId: string, id: string): Promise<WaMediaBankDTO | null> {
    const { data } = await this.supabase
      .from('wa_media_bank')
      .select(
        'id, clinic_id, filename, url, category, funnel, queixas, phase, caption, is_active, sort_order, created_at',
      )
      .eq('clinic_id', clinicId)
      .eq('id', id)
      .maybeSingle()

    return data ? mapRow(data) : null
  }

  async create(clinicId: string, input: CreateMediaInput): Promise<WaMediaBankDTO | null> {
    const row: Record<string, unknown> = {
      clinic_id: clinicId,
      filename: input.filename,
      url: input.url,
      category: input.category ?? 'before_after',
      funnel: input.funnel ?? null,
      queixas: input.queixas ?? [],
      phase: input.phase ?? null,
      caption: input.caption ?? null,
      is_active: input.isActive !== false,
      sort_order: input.sortOrder ?? 0,
    }

    const { data } = await this.supabase
      .from('wa_media_bank')
      .insert(row)
      .select(
        'id, clinic_id, filename, url, category, funnel, queixas, phase, caption, is_active, sort_order, created_at',
      )
      .single()

    return data ? mapRow(data) : null
  }

  async update(clinicId: string, id: string, patch: UpdateMediaInput): Promise<void> {
    const update: Record<string, unknown> = {}
    if (patch.filename !== undefined) update.filename = patch.filename
    if (patch.caption !== undefined) update.caption = patch.caption
    if (patch.funnel !== undefined) update.funnel = patch.funnel
    if (patch.queixas !== undefined) update.queixas = patch.queixas
    if (patch.phase !== undefined) update.phase = patch.phase
    if (patch.isActive !== undefined) update.is_active = patch.isActive
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder

    if (Object.keys(update).length === 0) return

    await this.supabase
      .from('wa_media_bank')
      .update(update)
      .eq('clinic_id', clinicId)
      .eq('id', id)
  }

  async toggleActive(clinicId: string, id: string, isActive: boolean): Promise<void> {
    await this.supabase
      .from('wa_media_bank')
      .update({ is_active: isActive })
      .eq('clinic_id', clinicId)
      .eq('id', id)
  }

  /**
   * Hard delete · usado quando filename foi removido do Storage tambem.
   * Caller deve garantir que o objeto ja saiu do bucket antes de chamar isso.
   */
  async hardDelete(clinicId: string, id: string): Promise<void> {
    await this.supabase
      .from('wa_media_bank')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('id', id)
  }
}
