/**
 * PatientProfileRepository · CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE.
 *
 * Acesso a `public.patient_profiles_extended` (mig 180) · 1:1 com `patients`.
 * Gerencia preferências de exibição, foto oficial (path no bucket privado
 * `media`), e consentimento LGPD-friendly para uso na recepção/TV.
 *
 * Segurança:
 *   - RLS scopes por clinic_id (JWT)
 *   - Mutações exigem app_role ∈ {owner,admin,receptionist} via RLS
 *   - profile_photo_path é APENAS path · NUNCA URL pública
 *   - getReceptionDisplayProfile só retorna foto quando:
 *     reception_welcome_enabled=true AND consent=granted AND photo NOT NULL
 *
 * Sem provider externo · sem WhatsApp · sem busca externa de foto.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ReceptionConsentStatus = 'none' | 'granted' | 'revoked'
export type ReceptionAnimationStyle = 'premium_soft' | 'premium_glow' | 'premium_clean'

export interface PatientProfileExtendedDTO {
  id: string
  clinicId: string
  patientId: string
  displayName: string | null
  preferredName: string | null
  profilePhotoPath: string | null
  profilePhotoUploadedBy: string | null
  profilePhotoUploadedAt: string | null
  receptionWelcomeEnabled: boolean
  receptionPhotoConsentStatus: ReceptionConsentStatus
  receptionPhotoConsentAt: string | null
  receptionPhotoConsentRecordedBy: string | null
  receptionPhotoConsentRevokedAt: string | null
  receptionPhotoConsentNote: string | null
  receptionAnimationStyle: ReceptionAnimationStyle
  createdAt: string
  updatedAt: string
}

export interface UpsertPatientProfileInput {
  displayName?: string | null
  preferredName?: string | null
  receptionAnimationStyle?: ReceptionAnimationStyle
}

export interface GrantConsentInput {
  note?: string | null
  recordedBy?: string | null
}

export interface ReceptionDisplayProfile {
  patientId: string
  displayName: string | null
  preferredName: string | null
  profilePhotoPath: string
  animationStyle: ReceptionAnimationStyle
}

interface RawRow {
  id: string
  clinic_id: string
  patient_id: string
  display_name: string | null
  preferred_name: string | null
  profile_photo_path: string | null
  profile_photo_uploaded_by: string | null
  profile_photo_uploaded_at: string | null
  reception_welcome_enabled: boolean
  reception_photo_consent_status: string
  reception_photo_consent_at: string | null
  reception_photo_consent_recorded_by: string | null
  reception_photo_consent_revoked_at: string | null
  reception_photo_consent_note: string | null
  reception_animation_style: string
  created_at: string
  updated_at: string
}

function mapRow(r: RawRow): PatientProfileExtendedDTO {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    patientId: r.patient_id,
    displayName: r.display_name,
    preferredName: r.preferred_name,
    profilePhotoPath: r.profile_photo_path,
    profilePhotoUploadedBy: r.profile_photo_uploaded_by,
    profilePhotoUploadedAt: r.profile_photo_uploaded_at,
    receptionWelcomeEnabled: r.reception_welcome_enabled,
    receptionPhotoConsentStatus: r.reception_photo_consent_status as ReceptionConsentStatus,
    receptionPhotoConsentAt: r.reception_photo_consent_at,
    receptionPhotoConsentRecordedBy: r.reception_photo_consent_recorded_by,
    receptionPhotoConsentRevokedAt: r.reception_photo_consent_revoked_at,
    receptionPhotoConsentNote: r.reception_photo_consent_note,
    receptionAnimationStyle: r.reception_animation_style as ReceptionAnimationStyle,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const COLUMNS =
  'id, clinic_id, patient_id, display_name, preferred_name, ' +
  'profile_photo_path, profile_photo_uploaded_by, profile_photo_uploaded_at, ' +
  'reception_welcome_enabled, reception_photo_consent_status, ' +
  'reception_photo_consent_at, reception_photo_consent_recorded_by, ' +
  'reception_photo_consent_revoked_at, reception_photo_consent_note, ' +
  'reception_animation_style, created_at, updated_at'

export class PatientProfileRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async getByPatientId(patientId: string): Promise<PatientProfileExtendedDTO | null> {
    const { data } = await this.supabase
      .from('patient_profiles_extended')
      .select(COLUMNS)
      .eq('patient_id', patientId)
      .maybeSingle()
    if (!data) return null
    return mapRow(data as unknown as RawRow)
  }

  /**
   * Upsert básico · cria se não existe, atualiza campos cosméticos se existe.
   * NÃO mexe em foto/consent · use métodos dedicados.
   */
  async upsert(
    clinicId: string,
    patientId: string,
    input: UpsertPatientProfileInput,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const existing = await this.getByPatientId(patientId)
    if (existing) {
      const payload: Record<string, unknown> = {}
      if (input.displayName !== undefined) payload.display_name = input.displayName
      if (input.preferredName !== undefined) payload.preferred_name = input.preferredName
      if (input.receptionAnimationStyle !== undefined) {
        payload.reception_animation_style = input.receptionAnimationStyle
      }
      if (Object.keys(payload).length === 0) return { ok: true, id: existing.id }
      const { error } = await this.supabase
        .from('patient_profiles_extended')
        .update(payload)
        .eq('id', existing.id)
      if (error) return { ok: false, error: error.message }
      return { ok: true, id: existing.id }
    }

    const { data, error } = await this.supabase
      .from('patient_profiles_extended')
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        display_name: input.displayName ?? null,
        preferred_name: input.preferredName ?? null,
        reception_animation_style: input.receptionAnimationStyle ?? 'premium_soft',
      })
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }
    return { ok: true, id: (data as { id: string }).id }
  }

  /**
   * Salva storage path da foto · NÃO faz upload (caller faz via supabase storage)
   * NÃO salva URL pública. Path canônico: `patient-profiles/{clinic_id}/{patient_id}/<file>`.
   */
  async setProfilePhotoPath(
    clinicId: string,
    patientId: string,
    storagePath: string,
    uploadedBy: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!storagePath || !storagePath.startsWith('patient-profiles/')) {
      return { ok: false, error: 'invalid_storage_path' }
    }
    await this.upsert(clinicId, patientId, {})
    const { error } = await this.supabase
      .from('patient_profiles_extended')
      .update({
        profile_photo_path: storagePath,
        profile_photo_uploaded_by: uploadedBy,
        profile_photo_uploaded_at: new Date().toISOString(),
      })
      .eq('patient_id', patientId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Remove path da foto. Disabilita welcome automaticamente (CHECK constraint
   * exige photo NOT NULL pra welcome=true · então UPDATE precisa setar
   * welcome=false explicitamente pra evitar violation).
   */
  async removeProfilePhoto(patientId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('patient_profiles_extended')
      .update({
        profile_photo_path: null,
        profile_photo_uploaded_by: null,
        profile_photo_uploaded_at: null,
        reception_welcome_enabled: false,
      })
      .eq('patient_id', patientId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  async grantConsent(
    clinicId: string,
    patientId: string,
    input: GrantConsentInput,
  ): Promise<{ ok: boolean; error?: string }> {
    await this.upsert(clinicId, patientId, {})
    const { error } = await this.supabase
      .from('patient_profiles_extended')
      .update({
        reception_photo_consent_status: 'granted',
        reception_photo_consent_at: new Date().toISOString(),
        reception_photo_consent_recorded_by: input.recordedBy ?? null,
        reception_photo_consent_revoked_at: null,
        reception_photo_consent_note: input.note ?? null,
      })
      .eq('patient_id', patientId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Revoga consentimento · desliga welcome (CHECK constraint).
   */
  async revokeConsent(patientId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('patient_profiles_extended')
      .update({
        reception_photo_consent_status: 'revoked',
        reception_photo_consent_revoked_at: new Date().toISOString(),
        reception_welcome_enabled: false,
      })
      .eq('patient_id', patientId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Set welcome flag. DB CHECK constraint enforça:
   *   welcome=true → consent=granted AND photo NOT NULL
   * Se condições não atendidas, retorna `prerequisites_not_met`.
   */
  async setReceptionWelcomeEnabled(
    patientId: string,
    enabled: boolean,
  ): Promise<{ ok: boolean; error?: string }> {
    if (enabled) {
      // Defense-in-depth · valida pré-reqs antes de mandar pro DB
      const profile = await this.getByPatientId(patientId)
      if (!profile) return { ok: false, error: 'profile_not_found' }
      if (profile.receptionPhotoConsentStatus !== 'granted') {
        return { ok: false, error: 'consent_not_granted' }
      }
      if (!profile.profilePhotoPath) {
        return { ok: false, error: 'photo_missing' }
      }
    }
    const { error } = await this.supabase
      .from('patient_profiles_extended')
      .update({ reception_welcome_enabled: enabled })
      .eq('patient_id', patientId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Reception display profile · só retorna foto quando:
   *   welcome=true AND consent=granted AND photo NOT NULL.
   * Senão, null (painel-TV usa avatar com iniciais).
   *
   * IMPORTANTE: retorna PATH no storage · caller deve gerar signed URL
   * server-side (Supabase Storage `createSignedUrl`). NUNCA expor path
   * diretamente para o cliente · usar via Server Component que assina.
   */
  async getReceptionDisplayProfile(patientId: string): Promise<ReceptionDisplayProfile | null> {
    const { data } = await this.supabase
      .from('patient_profiles_extended')
      .select('patient_id, display_name, preferred_name, profile_photo_path, reception_animation_style')
      .eq('patient_id', patientId)
      .eq('reception_welcome_enabled', true)
      .eq('reception_photo_consent_status', 'granted')
      .not('profile_photo_path', 'is', null)
      .maybeSingle()

    if (!data) return null
    const r = data as {
      patient_id: string
      display_name: string | null
      preferred_name: string | null
      profile_photo_path: string
      reception_animation_style: string
    }
    return {
      patientId: r.patient_id,
      displayName: r.display_name,
      preferredName: r.preferred_name,
      profilePhotoPath: r.profile_photo_path,
      animationStyle: r.reception_animation_style as ReceptionAnimationStyle,
    }
  }
}
