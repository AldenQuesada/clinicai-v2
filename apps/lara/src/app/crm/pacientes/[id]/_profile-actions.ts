'use server'

/**
 * Server Actions · CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE.
 *
 * Gerencia patient_profiles_extended (mig 180):
 *   - savePatientProfileAction (upsert display/preferred name + animation style)
 *   - uploadPatientProfilePhotoAction (recebe FormData · upload via service_role
 *     no bucket privado `media` com prefixo `patient-profiles/{clinic}/{patient}/`)
 *   - removePatientProfilePhotoAction (limpa path · welcome off automático)
 *   - grantReceptionPhotoConsentAction (consent=granted + at + recorded_by)
 *   - revokeReceptionPhotoConsentAction (consent=revoked + welcome off)
 *   - setReceptionWelcomeEnabledAction (toggle · enforce pré-reqs)
 *
 * Role gate: owner/admin/receptionist (TS + RLS dupla camada).
 * ZERO envio · ZERO provider · ZERO wa_outbox.
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

const RECEPTION_ROLES = ['owner', 'admin', 'receptionist'] as const

const ANIMATION_STYLE = z.enum(['premium_soft', 'premium_glow', 'premium_clean'])

// ── savePatientProfileAction ────────────────────────────────────────────────

const SaveProfileSchema = z.object({
  patientId: z.string().uuid(),
  displayName: z.string().trim().max(120).nullable().optional(),
  preferredName: z.string().trim().max(80).nullable().optional(),
  animationStyle: ANIMATION_STYLE.optional(),
})

export async function savePatientProfileAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = SaveProfileSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECEPTION_ROLES)
  if (forbidden) return forbidden

  const r = await repos.patientProfile.upsert(ctx.clinic_id, parsed.data.patientId, {
    displayName: parsed.data.displayName,
    preferredName: parsed.data.preferredName,
    receptionAnimationStyle: parsed.data.animationStyle,
  })
  if (!r.ok || !r.id) {
    log.warn({ action: 'crm.patient_profile.save', error: r.error }, 'patient_profile.save.failed')
    return fail(r.error || 'save_failed')
  }
  log.info(
    { action: 'crm.patient_profile.save', clinic_id: ctx.clinic_id, patient_id: parsed.data.patientId },
    'patient_profile.save.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ id: r.id })
}

// ── uploadPatientProfilePhotoAction ─────────────────────────────────────────
// Recebe FormData com 'patientId' + 'file'. Upload via service_role no bucket
// privado `media`. Path: `patient-profiles/{clinic_id}/{patient_id}/profile-{ts}.{ext}`.
// Server-side · não expõe service role para cliente.

const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB

export async function uploadPatientProfilePhotoAction(
  formData: FormData,
): Promise<Result<{ path: string }>> {
  const patientId = formData.get('patientId')
  const file = formData.get('file')

  if (typeof patientId !== 'string' || !patientId) {
    return fail('invalid_patient_id')
  }
  if (!(file instanceof File)) {
    return fail('no_file')
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return fail('file_too_large', { maxMb: 5 })
  }
  if (!ALLOWED_PHOTO_MIME.has(file.type)) {
    return fail('invalid_mime', { allowed: ['jpeg', 'jpg', 'png', 'webp'] })
  }

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECEPTION_ROLES)
  if (forbidden) return forbidden

  // Patient must belong to this clinic
  const patient = await repos.patients.getById(patientId).catch(() => null)
  if (!patient || patient.clinicId !== ctx.clinic_id) {
    return fail('patient_not_found')
  }

  // Build path
  const ext = (() => {
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') return 'jpg'
    if (file.type === 'image/png') return 'png'
    if (file.type === 'image/webp') return 'webp'
    return 'bin'
  })()
  const ts = Date.now()
  const path = `patient-profiles/${ctx.clinic_id}/${patientId}/profile-${ts}.${ext}`

  // Upload via service_role (bucket é privado · zero URL pública gerada aqui)
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
      { action: 'crm.patient_profile.upload_photo', error: uploadErr.message },
      'photo.upload.failed',
    )
    return fail('upload_failed', { detail: uploadErr.message })
  }

  // Record path in patient_profiles_extended
  const setResult = await repos.patientProfile.setProfilePhotoPath(
    ctx.clinic_id,
    patientId,
    path,
    ctx.user_id ?? null,
  )
  if (!setResult.ok) {
    // Cleanup orphan upload
    await service.storage.from('media').remove([path]).catch(() => {})
    return fail(setResult.error || 'db_update_failed')
  }

  log.info(
    {
      action: 'crm.patient_profile.upload_photo',
      clinic_id: ctx.clinic_id,
      patient_id: patientId,
      path,
    },
    'photo.upload.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ path })
}

// ── removePatientProfilePhotoAction ─────────────────────────────────────────

const RemovePhotoSchema = z.object({ patientId: z.string().uuid() })

export async function removePatientProfilePhotoAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = RemovePhotoSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECEPTION_ROLES)
  if (forbidden) return forbidden

  // Read current path para limpar storage também
  const profile = await repos.patientProfile.getByPatientId(parsed.data.patientId)
  const currentPath = profile?.profilePhotoPath ?? null

  const r = await repos.patientProfile.removeProfilePhoto(parsed.data.patientId)
  if (!r.ok) return fail(r.error || 'remove_failed')

  if (currentPath) {
    const service = createServiceRoleClient()
    await service.storage.from('media').remove([currentPath]).catch(() => {})
  }

  log.info(
    { action: 'crm.patient_profile.remove_photo', patient_id: parsed.data.patientId },
    'photo.remove.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ id: parsed.data.patientId })
}

// ── grantReceptionPhotoConsentAction ────────────────────────────────────────

const GrantConsentSchema = z.object({
  patientId: z.string().uuid(),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function grantReceptionPhotoConsentAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = GrantConsentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECEPTION_ROLES)
  if (forbidden) return forbidden

  const r = await repos.patientProfile.grantConsent(ctx.clinic_id, parsed.data.patientId, {
    note: parsed.data.note ?? null,
    recordedBy: ctx.user_id ?? null,
  })
  if (!r.ok) return fail(r.error || 'grant_failed')

  log.info(
    {
      action: 'crm.patient_profile.grant_consent',
      clinic_id: ctx.clinic_id,
      patient_id: parsed.data.patientId,
    },
    'consent.grant.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ id: parsed.data.patientId })
}

// ── revokeReceptionPhotoConsentAction ───────────────────────────────────────

const RevokeConsentSchema = z.object({ patientId: z.string().uuid() })

export async function revokeReceptionPhotoConsentAction(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = RevokeConsentSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECEPTION_ROLES)
  if (forbidden) return forbidden

  const r = await repos.patientProfile.revokeConsent(parsed.data.patientId)
  if (!r.ok) return fail(r.error || 'revoke_failed')

  log.info(
    {
      action: 'crm.patient_profile.revoke_consent',
      clinic_id: ctx.clinic_id,
      patient_id: parsed.data.patientId,
    },
    'consent.revoke.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ id: parsed.data.patientId })
}

// ── setReceptionWelcomeEnabledAction ────────────────────────────────────────

const SetWelcomeSchema = z.object({
  patientId: z.string().uuid(),
  enabled: z.boolean(),
})

export async function setReceptionWelcomeEnabledAction(
  input: unknown,
): Promise<Result<{ id: string; enabled: boolean }>> {
  const parsed = SetWelcomeSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { ctx, repos } = await loadServerReposContext()
  const forbidden = requireRole(ctx.role, RECEPTION_ROLES)
  if (forbidden) return forbidden

  const r = await repos.patientProfile.setReceptionWelcomeEnabled(
    parsed.data.patientId,
    parsed.data.enabled,
  )
  if (!r.ok) return fail(r.error || 'set_welcome_failed')

  log.info(
    {
      action: 'crm.patient_profile.set_welcome',
      clinic_id: ctx.clinic_id,
      patient_id: parsed.data.patientId,
      enabled: parsed.data.enabled,
    },
    'welcome.set.ok',
  )
  updateTag(CRM_TAGS.patients)
  return ok({ id: parsed.data.patientId, enabled: parsed.data.enabled })
}
