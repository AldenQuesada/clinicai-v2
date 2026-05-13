/**
 * MedicalRecordAttachmentRepository · CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_WIRE.
 *
 * Vault clínico tenant-aware (mig 183). Faz CRUD seguro sobre
 * `public.medical_record_attachments` respeitando RLS:
 *
 *   - SELECT: owner/admin/professional/receptionist (filtra `deleted_at IS NULL`)
 *   - INSERT/UPDATE: owner/admin/professional
 *   - DELETE: bloqueado · use soft-delete via UPDATE deleted_at
 *
 * Contrato de privacidade:
 *
 *   - DTO público (`MedicalRecordAttachmentDTO`) NÃO contém `storagePath`/`bucket`.
 *   - Tipo interno (`MedicalRecordAttachmentInternalDTO`) inclui esses campos e
 *     é usado APENAS server-side (signed URL, delete de objeto físico).
 *   - Caller server-side é responsável por gerar signed URL via
 *     `createServiceRoleClient().storage.from(bucket).createSignedUrl(path, 300)`.
 *
 * Storage path canônico (cumpre policies tenant-aware do bucket `media`):
 *   {clinic_id}/medical-records/{patient_id}/{attachment_id}/{safe_filename}
 *
 * Sem provider externo · sem WhatsApp · sem wa_outbox · sem cron.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** DTO público · sem caminho de storage · seguro para enviar ao client. */
export interface MedicalRecordAttachmentDTO {
  id: string
  clinicId: string
  patientId: string
  appointmentId: string | null
  uploadedBy: string | null
  fileName: string
  mimeType: string
  sizeBytes: number | null
  category: string | null
  description: string | null
  visibility: string
  createdAt: string
  updatedAt: string
  /** Soft-delete · presente quando deletado. */
  deletedAt: string | null
}

/**
 * DTO interno · inclui `storagePath`/`bucket` para uso server-only
 * (signed URL, delete de objeto físico). NUNCA exportar para client.
 */
export interface MedicalRecordAttachmentInternalDTO extends MedicalRecordAttachmentDTO {
  bucket: string
  storagePath: string
}

export interface CreateAttachmentInput {
  clinicId: string
  patientId: string
  appointmentId?: string | null
  uploadedBy?: string | null
  bucket?: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes?: number | null
  category?: string | null
  description?: string | null
  visibility?: 'clinical' | 'administrative' | 'commercial'
}

export interface ListAttachmentsOptions {
  includeDeleted?: boolean
  limit?: number
}

type RawRow = {
  id: string
  clinic_id: string
  patient_id: string
  appointment_id: string | null
  uploaded_by: string | null
  bucket: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number | string | null
  category: string | null
  description: string | null
  visibility: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const PUBLIC_COLUMNS =
  'id, clinic_id, patient_id, appointment_id, uploaded_by, ' +
  'file_name, mime_type, size_bytes, category, description, visibility, ' +
  'created_at, updated_at, deleted_at'

const INTERNAL_COLUMNS = PUBLIC_COLUMNS + ', bucket, storage_path'

function mapPublic(r: RawRow): MedicalRecordAttachmentDTO {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    patientId: r.patient_id,
    appointmentId: r.appointment_id,
    uploadedBy: r.uploaded_by,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    category: r.category,
    description: r.description,
    visibility: r.visibility,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

function mapInternal(r: RawRow): MedicalRecordAttachmentInternalDTO {
  return {
    ...mapPublic(r),
    bucket: r.bucket,
    storagePath: r.storage_path,
  }
}

export class MedicalRecordAttachmentRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Lista attachments ativos do paciente (deleted_at IS NULL).
   * RLS adicional pelo banco · zero `storage_path` no DTO retornado.
   */
  async listByPatient(
    patientId: string,
    opts: ListAttachmentsOptions = {},
  ): Promise<MedicalRecordAttachmentDTO[]> {
    const limit = Math.min(opts.limit ?? 100, 500)
    let q = this.supabase
      .from('medical_record_attachments')
      .select(PUBLIC_COLUMNS)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (!opts.includeDeleted) {
      q = q.is('deleted_at', null)
    }
    const { data, error } = await q
    if (error || !data) return []
    return (data as unknown as RawRow[]).map(mapPublic)
  }

  /**
   * `getById` server-only · inclui `storagePath`/`bucket` para gerar signed
   * URL ou apagar objeto físico. NÃO enviar este DTO ao client.
   */
  async getInternalById(id: string): Promise<MedicalRecordAttachmentInternalDTO | null> {
    const { data, error } = await this.supabase
      .from('medical_record_attachments')
      .select(INTERNAL_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    return mapInternal(data as unknown as RawRow)
  }

  /**
   * Insert idempotente da metadata · `storage_path` deve já existir no bucket
   * (caller faz upload antes). Caller geralmente é server action que controla
   * a transação lógica upload+insert.
   */
  async createMetadata(
    input: CreateAttachmentInput,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!input.storagePath) return { ok: false, error: 'storage_path_required' }
    if (!input.fileName) return { ok: false, error: 'file_name_required' }
    if (!input.mimeType) return { ok: false, error: 'mime_type_required' }

    const payload: Record<string, unknown> = {
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      appointment_id: input.appointmentId ?? null,
      uploaded_by: input.uploadedBy ?? null,
      bucket: input.bucket ?? 'media',
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes ?? null,
      category: input.category ?? null,
      description: input.description ?? null,
      visibility: input.visibility ?? 'clinical',
    }

    const { data, error } = await this.supabase
      .from('medical_record_attachments')
      .insert(payload)
      .select('id')
      .single()
    if (error || !data) {
      return { ok: false, error: error?.message ?? 'insert_failed' }
    }
    return { ok: true, id: (data as { id: string }).id }
  }

  /**
   * Soft-delete · marca `deleted_at` mas preserva row + objeto físico
   * (caller pode optar por apagar o objeto separadamente via service_role).
   * RLS de UPDATE exige role owner/admin/professional + clinic_id batendo.
   */
  async softDelete(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('medical_record_attachments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /** Contagem rápida · usado em KPI do prontuário. */
  async countByPatient(patientId: string): Promise<{ active: number; deleted: number }> {
    const [{ count: active }, { count: deleted }] = await Promise.all([
      this.supabase
        .from('medical_record_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId)
        .is('deleted_at', null),
      this.supabase
        .from('medical_record_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId)
        .not('deleted_at', 'is', null),
    ])
    return { active: active ?? 0, deleted: deleted ?? 0 }
  }
}
