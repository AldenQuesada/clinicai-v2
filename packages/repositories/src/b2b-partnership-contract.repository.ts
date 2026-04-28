/**
 * B2BPartnershipContractRepository · contrato + atividades de parceria
 * (mig 800-34 · #8 do roadmap Alden 2026-04-26).
 *
 * 6 RPCs SECURITY DEFINER:
 *   Contracts:
 *     - b2b_contract_get(partnership_id) · busca contrato existente
 *     - b2b_contract_upsert(payload) · cria/atualiza
 *     - b2b_contract_delete(partnership_id) · remove
 *   Activities:
 *     - b2b_activities_list(partnership_id) · lista timeline
 *     - b2b_activity_upsert(payload) · cria/atualiza (id null = novo)
 *     - b2b_activity_delete(id) · remove uma
 *
 * Boundary ADR-005 · DTO camelCase. Multi-tenant via _sdr_clinic_id() na RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'expired' | 'cancelled'
export type ActivityKind =
  | 'monthly_meeting'
  | 'content_post'
  | 'event'
  | 'voucher_review'
  | 'training'
  | 'feedback_session'
  | 'custom'
export type ActivityStatus = 'pending' | 'completed' | 'cancelled'
export type ActivityResponsible = 'clinic' | 'partner' | 'both'

export interface PartnershipContractDTO {
  id: string
  clinicId: string
  partnershipId: string
  status: ContractStatus
  termsVersion: string | null
  sentAt: string | null
  signedAt: string | null
  expiryDate: string | null
  filePath: string | null
  fileSizeBytes: number | null
  signatureData: Record<string, unknown> | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PartnershipActivityDTO {
  id: string
  kind: ActivityKind
  title: string
  status: ActivityStatus
  dueDate: string | null
  completedAt: string | null
  responsible: ActivityResponsible
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ContractUpsertInput {
  partnership_id: string
  status?: ContractStatus
  terms_version?: string | null
  sent_at?: string | null
  signed_at?: string | null
  expiry_date?: string | null
  file_path?: string | null
  file_size_bytes?: number | null
  signature_data?: Record<string, unknown> | null
  notes?: string | null
}

export interface ActivityUpsertInput {
  id?: string
  partnership_id: string
  kind?: ActivityKind
  title: string
  status?: ActivityStatus
  due_date?: string | null
  responsible?: ActivityResponsible
  notes?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContractRow(r: any): PartnershipContractDTO {
  return {
    id: String(r.id),
    clinicId: String(r.clinic_id),
    partnershipId: String(r.partnership_id),
    status: (r.status ?? 'draft') as ContractStatus,
    termsVersion: r.terms_version ?? null,
    sentAt: r.sent_at ?? null,
    signedAt: r.signed_at ?? null,
    expiryDate: r.expiry_date ?? null,
    filePath: r.file_path ?? null,
    fileSizeBytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
    signatureData: r.signature_data ?? null,
    notes: r.notes ?? null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActivityRow(r: any): PartnershipActivityDTO {
  return {
    id: String(r.id),
    kind: (r.kind ?? 'custom') as ActivityKind,
    title: String(r.title ?? ''),
    status: (r.status ?? 'pending') as ActivityStatus,
    dueDate: r.due_date ?? null,
    completedAt: r.completed_at ?? null,
    responsible: (r.responsible ?? 'clinic') as ActivityResponsible,
    notes: r.notes ?? null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }
}

export class B2BPartnershipContractRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  // ─── Contracts ──────────────────────────────────────────────────────

  async getContract(partnershipId: string): Promise<PartnershipContractDTO | null> {
    const { data, error } = await this.supabase.rpc('b2b_contract_get', {
      p_partnership_id: partnershipId,
    })
    if (error) return null
    const obj = data as { ok?: boolean; contract?: unknown }
    if (!obj || obj.ok !== true || !obj.contract) return null
    return mapContractRow(obj.contract)
  }

  async upsertContract(
    payload: ContractUpsertInput,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_contract_upsert', {
      p_payload: payload,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; id?: string; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true, id: obj.id }
  }

  async deleteContract(partnershipId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_contract_delete', {
      p_partnership_id: partnershipId,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true }
  }

  // ─── Activities ─────────────────────────────────────────────────────

  async listActivities(partnershipId: string): Promise<PartnershipActivityDTO[]> {
    const { data, error } = await this.supabase.rpc('b2b_activities_list', {
      p_partnership_id: partnershipId,
    })
    if (error) return []
    const obj = data as { ok?: boolean; activities?: unknown[] }
    if (!obj || obj.ok !== true || !Array.isArray(obj.activities)) return []
    return obj.activities.map(mapActivityRow)
  }

  async upsertActivity(
    payload: ActivityUpsertInput,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_activity_upsert', {
      p_payload: payload,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; id?: string; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true, id: obj.id }
  }

  async deleteActivity(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('b2b_activity_delete', {
      p_id: id,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true }
  }
}
