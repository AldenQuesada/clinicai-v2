'use server'

/**
 * Server Actions · CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_WIRE.
 *
 * Gerencia `medical_record_attachments` (mig 183) com 2 mutations:
 *
 *   - uploadMedicalRecordAttachmentAction (FormData · file + metadata)
 *   - softDeleteMedicalRecordAttachmentAction (UPDATE deleted_at)
 *
 * Role gate (defense-in-depth · DB tem RLS · TS aqui é UX/short-circuit):
 *   INSERT/UPDATE: owner, admin, professional.
 *   SELECT vive na page.tsx (RLS no DB já restringe a 4 roles).
 *
 * Privacidade · contrato absoluto:
 *   - storage_path bruto NUNCA viaja para o client.
 *   - Signed URL gerada apenas na page.tsx (server component) com TTL 5min.
 *   - DELETE bloqueado · soft-delete sempre.
 *   - Path canônico {clinic_id}/medical-records/{patient_id}/{attachment_id}/{safe_filename}
 *     (cumpre policies tenant-aware do bucket `media`).
 *
 * Zero envio · zero provider · zero wa_outbox · zero alteração de hard gate.
 */

import {
  CRM_TAGS,
  createLogger,
  fail,
  loadServerReposContext,
  ok,
  requireRole,
  updateTag,
  zodFail,
  z,
  type Result,
} from '@/app/crm/_actions/shared'
import { createServiceRoleClient } from '@clinicai/supabase'

const log = createLogger({ app: 'lara' })

// NOTA · mig 183 escreveu policies com role literal 'professional', mas o
// projeto usa `therapist` como role canônico para clinical staff (vide
// `apps/lara/src/lib/permissions.ts`). Alinhamos o TS com o role real ·
// gap deve ser corrigido em mig 184 (policy update). Owner/admin operam
// hoje sem bloqueio · therapist depende da mig corretiva.
const WRITE_ROLES = ['owner', 'admin', 'therapist'] as const

const ALLOWED_MIME = new Set([
  // Imagens clínicas
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  // Documentos
  'application/pdf',
])
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

const CATEGORY = z.enum([
  'clinical_photo',
  'exam',
  'document',
  'consent',
  'budget',
  'other',
])

const VISIBILITY = z.enum(['clinical', 'administrative', 'commercial'])

/**
 * Sanitiza nome de arquivo · alfanumérico + `-`, `_`, `.`. Demais → `_`.
 * Preserva extensão original. Limita a 80 chars (sem extensão).
 */
function safeFileName(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/')
  const last = trimmed.split('/').pop() ?? trimmed
  const dot = last.lastIndexOf('.')
  const base = (dot > 0 ? last.slice(0, dot) : last)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80)
  const ext = (dot > 0 ? last.slice(dot + 1) : '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 10)
    .toLowerCase()
  if (!base) return ext ? `file.${ext}` : 'file'
  return ext ? `${base}.${ext}` : base
}

// ── uploadMedicalRecordAttachmentAction ────────────────────────────────────

export async function uploadMedicalRecordAttachmentAction(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const patientId = formData.get('patientId')
  const file = formData.get('file')
  const categoryRaw = formData.get('category')
  const descriptionRaw = formData.get('description')
  const appointmentIdRaw = formData.get('appointmentId')
  const visibilityRaw = formData.get('visibility')

  if (typeof patientId !== 'string' || !patientId) {
    return fail('invalid_patient_id')
  }
  if (!(file instanceof File)) {
    return fail('no_file')
  }
  if (file.size > MAX_BYTES) {
    return fail('file_too_large', { maxMb: 20 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return fail('invalid_mime', {
      allowed: ['jpeg', 'jpg', 'png', 'webp', 'pdf'],
    })
  }
  if (file.size === 0) {
    return fail('empty_file')
  }

  // Validar categoria/visibilidade (opcionais · default abaixo)
  const categoryParsed = categoryRaw == null || categoryRaw === ''
    ? { success: true as const, data: 'document' as const }
    : CATEGORY.safeParse(categoryRaw)
  if (!categoryParsed.success) return zodFail(categoryParsed.error)

  const visibilityParsed = visibilityRaw == null || visibilityRaw === ''
    ? { success: true as const, data: 'clinical' as const }
    : VISIBILITY.safeParse(visibilityRaw)
  if (!visibilityParsed.success) return zodFail(visibilityParsed.error)

  const description =
    typeof descriptionRaw === 'string' && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim().slice(0, 2000)
      : null

  const appointmentId =
    typeof appointmentIdRaw === 'string' && appointmentIdRaw.trim().length > 0
      ? appointmentIdRaw.trim()
      : null
  if (appointmentId && !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
    return fail('invalid_appointment_id')
  }

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, WRITE_ROLES)
  if (forbidden) return forbidden

  // Tenant guard explícito
  const patient = await repos.patients.getById(patientId).catch(() => null)
  if (!patient || patient.clinicId !== ctx.clinic_id) {
    return fail('patient_not_found')
  }

  // Path canônico · primeira pasta = clinic_id (cumpre policy tenant do bucket)
  const attachmentId = crypto.randomUUID()
  const fileName = safeFileName(file.name)
  const path = `${ctx.clinic_id}/medical-records/${patientId}/${attachmentId}/${fileName}`

  // 1) Upload físico (service_role · bucket privado · zero URL pública)
  const service = createServiceRoleClient()
  const buffer = await file.arrayBuffer()
  const { error: uploadErr } = await service.storage
    .from('media')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })
  if (uploadErr) {
    log.warn(
      {
        action: 'crm.media_vault.upload',
        clinic_id: ctx.clinic_id,
        patient_id: patientId,
        attachment_id: attachmentId,
        error: uploadErr.message,
      },
      'media_vault.upload.failed',
    )
    return fail('upload_failed', { detail: uploadErr.message })
  }

  // 2) Insert metadata (RLS no DB enforça clinic_id + role)
  const r = await repos.medicalRecordAttachments.createMetadata({
    clinicId: ctx.clinic_id,
    patientId,
    appointmentId,
    uploadedBy: ctx.user_id ?? null,
    bucket: 'media',
    storagePath: path,
    fileName,
    mimeType: file.type,
    sizeBytes: file.size,
    category: categoryParsed.data,
    description,
    visibility: visibilityParsed.data,
  })
  if (!r.ok || !r.id) {
    // Cleanup orphan upload · não bloqueia caso falhe (Storage RLS pode rejeitar)
    await service.storage.from('media').remove([path]).catch(() => {})
    log.warn(
      {
        action: 'crm.media_vault.upload',
        clinic_id: ctx.clinic_id,
        patient_id: patientId,
        error: r.error,
      },
      'media_vault.metadata.failed',
    )
    return fail(r.error || 'metadata_failed')
  }

  log.info(
    {
      action: 'crm.media_vault.upload',
      clinic_id: ctx.clinic_id,
      patient_id: patientId,
      attachment_id: r.id,
      mime: file.type,
      bytes: file.size,
    },
    'media_vault.upload.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ id: r.id })
}

// ── softDeleteMedicalRecordAttachmentAction ────────────────────────────────

const SoftDeleteSchema = z.object({
  attachmentId: z.string().uuid(),
  patientId: z.string().uuid(),
})

export async function softDeleteMedicalRecordAttachmentAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = SoftDeleteSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, WRITE_ROLES)
  if (forbidden) return forbidden

  // Defense-in-depth · row precisa pertencer à mesma clínica/paciente
  const row = await repos.medicalRecordAttachments
    .getInternalById(parsed.data.attachmentId)
    .catch(() => null)
  if (!row || row.clinicId !== ctx.clinic_id || row.patientId !== parsed.data.patientId) {
    return fail('attachment_not_found')
  }
  if (row.deletedAt) {
    return ok({ id: row.id }) // já deletado · idempotente
  }

  const r = await repos.medicalRecordAttachments.softDelete(row.id)
  if (!r.ok) {
    log.warn(
      {
        action: 'crm.media_vault.soft_delete',
        clinic_id: ctx.clinic_id,
        attachment_id: row.id,
        error: r.error,
      },
      'media_vault.soft_delete.failed',
    )
    return fail(r.error || 'soft_delete_failed')
  }

  log.info(
    {
      action: 'crm.media_vault.soft_delete',
      clinic_id: ctx.clinic_id,
      patient_id: parsed.data.patientId,
      attachment_id: row.id,
    },
    'media_vault.soft_delete.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ id: row.id })
}
