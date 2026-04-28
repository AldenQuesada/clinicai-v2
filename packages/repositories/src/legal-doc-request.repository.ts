/**
 * LegalDocRequestRepository · CRUD de requests de assinatura.
 *
 * Cada request e uma instancia especifica gerada a partir de um template ·
 * snapshot imutavel + token publico unico. Status: pending|viewed|signed|
 * expired|revoked.
 *
 * Vinculo a parceria B2B: usa o campo `appointment_id` (text) com convencao
 * `partnership:<uuid>` pra evitar nova migration de schema. Vinculo a
 * paciente: campo `patient_id` (text, ja existente).
 *
 * RPCs:
 *   - legal_doc_create_request (auth)
 *   - legal_doc_validate_token (anon · public route)
 *   - legal_doc_list_requests (auth · filtra clinic via app_clinic_id)
 *   - legal_doc_revoke (admin)
 *
 * Boundary ADR-005 · DTO camelCase.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export type LegalDocStatus = 'pending' | 'viewed' | 'signed' | 'expired' | 'revoked'

export interface LegalDocRequestDTO {
  id: string
  clinicId: string
  templateId: string
  templateName: string | null
  patientId: string | null
  patientName: string
  patientCpf: string | null
  patientPhone: string | null
  appointmentId: string | null
  partnershipId: string | null
  professionalName: string | null
  professionalReg: string | null
  professionalSpec: string | null
  publicSlug: string
  status: LegalDocStatus
  hasSignature: boolean
  contentSnapshot: string | null
  documentHash: string | null
  expiresAt: string | null
  createdAt: string
  viewedAt: string | null
  signedAt: string | null
  revokedAt: string | null
}

export interface ValidatedRequestDTO {
  id: string
  patientName: string
  patientCpf: string | null
  professionalName: string | null
  professionalReg: string | null
  professionalSpec: string | null
  content: string
  documentHash: string | null
  status: LegalDocStatus
  createdAt: string
}

export interface CreateLegalDocRequestInput {
  templateId: string
  patientId?: string | null
  patientName: string
  patientCpf?: string | null
  patientPhone?: string | null
  /** UUID da parceria · convencao: serializado em appointment_id como `partnership:<id>`. */
  partnershipId?: string | null
  appointmentId?: string | null
  professionalName?: string | null
  professionalReg?: string | null
  professionalSpec?: string | null
  /** Snapshot ja com merge de variaveis · se ausente usa template puro. */
  contentSnapshot?: string | null
  expiresHours?: number
}

const PARTNERSHIP_PREFIX = 'partnership:'

function encodeAppointmentField(input: CreateLegalDocRequestInput): string | null {
  if (input.partnershipId) return `${PARTNERSHIP_PREFIX}${input.partnershipId}`
  return input.appointmentId ?? null
}

function decodePartnershipFromAppointment(appointmentId: string | null): {
  partnershipId: string | null
  appointmentId: string | null
} {
  if (!appointmentId) return { partnershipId: null, appointmentId: null }
  if (appointmentId.startsWith(PARTNERSHIP_PREFIX)) {
    return { partnershipId: appointmentId.slice(PARTNERSHIP_PREFIX.length), appointmentId: null }
  }
  return { partnershipId: null, appointmentId }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRequestRow(r: any): LegalDocRequestDTO {
  const apptRaw: string | null = r.appointment_id ?? null
  const decoded = decodePartnershipFromAppointment(apptRaw)
  return {
    id: String(r.id),
    clinicId: String(r.clinic_id ?? ''),
    templateId: String(r.template_id ?? ''),
    templateName: r.template_name ?? null,
    patientId: r.patient_id ?? null,
    patientName: String(r.patient_name ?? ''),
    patientCpf: r.patient_cpf ?? null,
    patientPhone: r.patient_phone ?? null,
    appointmentId: decoded.appointmentId,
    partnershipId: decoded.partnershipId,
    professionalName: r.professional_name ?? null,
    professionalReg: r.professional_reg ?? null,
    professionalSpec: r.professional_spec ?? null,
    publicSlug: String(r.public_slug ?? ''),
    status: (r.status ?? 'pending') as LegalDocStatus,
    hasSignature: r.has_signature === true,
    contentSnapshot: r.content_snapshot ?? null,
    documentHash: r.document_hash ?? null,
    expiresAt: r.expires_at ?? null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    viewedAt: r.viewed_at ?? null,
    signedAt: r.signed_at ?? null,
    revokedAt: r.revoked_at ?? null,
  }
}

export class LegalDocRequestRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Cria novo request via RPC. Retorna { id, slug, token } pra montar link
   * publico. Token e' devolvido apenas UMA vez · so o hash fica no banco.
   */
  async issue(
    input: CreateLegalDocRequestInput,
  ): Promise<{ ok: boolean; id?: string; slug?: string; token?: string; error?: string }> {
    const { data, error } = await this.supabase.rpc('legal_doc_create_request', {
      p_template_id: input.templateId,
      p_patient_id: input.patientId ?? null,
      p_patient_name: input.patientName,
      p_patient_cpf: input.patientCpf ?? null,
      p_patient_phone: input.patientPhone ?? null,
      p_appointment_id: encodeAppointmentField(input),
      p_professional_name: input.professionalName ?? null,
      p_professional_reg: input.professionalReg ?? null,
      p_professional_spec: input.professionalSpec ?? null,
      p_content_snapshot: input.contentSnapshot ?? null,
      p_expires_hours: input.expiresHours ?? 48,
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; id?: string; slug?: string; token?: string; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true, id: obj.id, slug: obj.slug, token: obj.token }
  }

  /**
   * Valida slug+token (chamado pela rota publica /assinatura/[token]).
   * RPC roda anon · com rate limit de 10 falhas/15min por slug.
   * Marca como viewed na primeira chamada bem sucedida.
   */
  async validateToken(
    slug: string,
    token: string,
    ip?: string | null,
  ): Promise<{ ok: boolean; data?: ValidatedRequestDTO; error?: string; code?: string }> {
    const { data, error } = await this.supabase.rpc('legal_doc_validate_token', {
      p_slug: slug,
      p_token: token,
      p_ip: ip ?? null,
    })
    if (error) return { ok: false, error: error.message }
    const obj = data as
      | { ok?: boolean; data?: Record<string, unknown>; error?: string; code?: string }
      | null
    if (!obj || obj.ok !== true || !obj.data) {
      return { ok: false, error: obj?.error ?? 'invalid', code: obj?.code }
    }
    const d = obj.data
    return {
      ok: true,
      data: {
        id: String(d.id ?? ''),
        patientName: String(d.patient_name ?? ''),
        patientCpf: (d.patient_cpf as string | null) ?? null,
        professionalName: (d.professional_name as string | null) ?? null,
        professionalReg: (d.professional_reg as string | null) ?? null,
        professionalSpec: (d.professional_spec as string | null) ?? null,
        content: String(d.content ?? ''),
        documentHash: (d.document_hash as string | null) ?? null,
        status: (d.status ?? 'pending') as LegalDocStatus,
        createdAt: String(d.created_at ?? new Date().toISOString()),
      },
    }
  }

  /**
   * Busca by slug · usado em fluxos autenticados (admin) onde nao precisa
   * de token (RLS authenticated permite SELECT por clinic_id).
   */
  async getBySlug(slug: string): Promise<LegalDocRequestDTO | null> {
    const { data, error } = await this.supabase
      .from('legal_doc_requests')
      .select('*')
      .eq('public_slug', slug)
      .maybeSingle()
    if (error || !data) return null
    return mapRequestRow(data)
  }

  /**
   * Lista requests vinculados a uma parceria. Usa convencao de prefixo
   * `partnership:<uuid>` no campo appointment_id.
   *
   * Inclui template_name via join client-side.
   */
  async listByPartnership(partnershipId: string): Promise<LegalDocRequestDTO[]> {
    const { data, error } = await this.supabase
      .from('legal_doc_requests')
      .select('*, legal_doc_templates(name)')
      .eq('appointment_id', `${PARTNERSHIP_PREFIX}${partnershipId}`)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error || !Array.isArray(data)) return []
    return data.map((r: Record<string, unknown>) => {
      const tmpl = (r.legal_doc_templates as { name?: string } | null) ?? null
      const sigCount = 0 // best-effort · usar listSignedByRequest se necessario
      return mapRequestRow({
        ...r,
        template_name: tmpl?.name ?? null,
        has_signature: r.status === 'signed' || sigCount > 0,
      })
    })
  }

  /**
   * Lista por patient_id (text). Espelha legal_doc_list_requests.
   */
  async listByPatient(patientId: string, limit = 50): Promise<LegalDocRequestDTO[]> {
    const { data, error } = await this.supabase.rpc('legal_doc_list_requests', {
      p_patient_id: patientId,
      p_appointment_id: null,
      p_status: null,
      p_limit: limit,
    })
    if (error) return []
    const obj = data as { ok?: boolean; data?: unknown[] }
    if (!obj || obj.ok !== true || !Array.isArray(obj.data)) return []
    return obj.data.map(mapRequestRow)
  }

  /**
   * Lista geral · usado pelo painel admin. Filtros opcionais.
   */
  async listAll(opts: {
    patientId?: string | null
    appointmentId?: string | null
    status?: string | null
    limit?: number
  } = {}): Promise<LegalDocRequestDTO[]> {
    const { data, error } = await this.supabase.rpc('legal_doc_list_requests', {
      p_patient_id: opts.patientId ?? null,
      p_appointment_id: opts.appointmentId ?? null,
      p_status: opts.status ?? null,
      p_limit: opts.limit ?? 50,
    })
    if (error) return []
    const obj = data as { ok?: boolean; data?: unknown[] }
    if (!obj || obj.ok !== true || !Array.isArray(obj.data)) return []
    return obj.data.map(mapRequestRow)
  }

  /**
   * Revoga request (admin/owner) · status='revoked', revoked_at=now().
   */
  async revoke(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('legal_doc_revoke', { p_id: id })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as { ok?: boolean; error?: string }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true }
  }

  /**
   * Marca como signed manualmente · normalmente chamado pelo
   * legal_doc_submit_signature RPC (anon). Aqui apenas pra fallback admin.
   */
  async markSigned(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('legal_doc_requests')
      .update({ status: 'signed', signed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
}
