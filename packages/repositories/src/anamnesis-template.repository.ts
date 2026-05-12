/**
 * AnamnesisTemplateRepository · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER.
 *
 * Read-only e mutações top-level sobre `public.anamnesis_templates`
 * (mig pré-existente · estrutura enterprise · RLS + 5 policies).
 *
 * Escopo intencionalmente conservador:
 *   - CRUD top-level do TEMPLATE (name, description, category, flags)
 *   - LISTAGEM de seções + perguntas para preview admin
 *   - SEM tocar em `anamnesis_responses` / `appointment_anamneses`
 *   - SEM tocar em hard gate clínico (`appointment_clinical_gate_status`,
 *     `appointment_finalize`, `appointment_anamnesis_*`)
 *   - SEM tocar nas RPCs de reorder de fields/sessions/options · admin avançado
 *     vive em fase futura
 *
 * Segurança:
 *   - RLS multi-tenant já configurada · authenticated lê templates da clínica
 *   - admin/owner/clinical_admin podem INSERT/UPDATE via policies pré-existentes
 *   - service_role bypass apenas onde explícito (esta repo NÃO usa)
 *
 * Sem provider externo · sem WhatsApp · sem cron · sem deploy.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AnamnesisTemplateCategory =
  | 'general'
  | 'facial'
  | 'body'
  | 'capillary'
  | 'epilation'
  | 'custom'

export type AnamnesisFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'date'

export interface AnamnesisTemplateDTO {
  id: string
  clinicId: string
  name: string
  description: string | null
  category: AnamnesisTemplateCategory
  isActive: boolean
  isDefault: boolean
  isPreAppointmentForm: boolean
  hasGeneralSession: boolean
  version: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AnamnesisTemplateSessionDTO {
  id: string
  templateId: string
  title: string
  description: string | null
  orderIndex: number
  isActive: boolean
}

export interface AnamnesisFieldOptionDTO {
  id: string
  fieldId: string
  label: string
  value: string
  orderIndex: number
  isActive: boolean
}

export interface AnamnesisFieldDTO {
  id: string
  templateId: string | null
  sessionId: string
  fieldKey: string
  label: string
  description: string | null
  helpText: string | null
  fieldType: AnamnesisFieldType
  placeholder: string | null
  isRequired: boolean
  isActive: boolean
  isVisible: boolean
  orderIndex: number
}

export interface AnamnesisTemplateWithStructureDTO extends AnamnesisTemplateDTO {
  sessions: ReadonlyArray<
    AnamnesisTemplateSessionDTO & {
      fields: ReadonlyArray<
        AnamnesisFieldDTO & { options: ReadonlyArray<AnamnesisFieldOptionDTO> }
      >
    }
  >
}

/**
 * Snapshot read-only do registro clínico de anamnese de um appointment.
 * Mapeia 1:1 `appointment_anamneses` (fonte clínica · não a "structure" de
 * `anamnesis_templates`). Hard gate clínico continua intacto · esta DTO
 * só serve a `/crm/pacientes/[id]` em modo leitura.
 */
export interface PatientAnamnesisRecordDTO {
  id: string
  patientId: string | null
  appointmentId: string | null
  status: string | null
  chiefComplaint: string | null
  hasContent: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ListAnamnesisTemplatesFilter {
  search?: string | null
  status?: 'active' | 'inactive' | 'all'
  category?: AnamnesisTemplateCategory | 'all' | null
  limit?: number
  offset?: number
}

export interface AnamnesisTemplateCountsDTO {
  total: number
  active: number
  inactive: number
  totalFields: number
  /** Mapa category → contagem (apenas categorias com pelo menos 1 template). */
  byCategory: Readonly<Record<AnamnesisTemplateCategory, number>>
}

export interface CreateAnamnesisTemplateInput {
  name: string
  description?: string | null
  category?: AnamnesisTemplateCategory
  isPreAppointmentForm?: boolean
  hasGeneralSession?: boolean
}

export interface UpdateAnamnesisTemplateInput {
  name?: string
  description?: string | null
  category?: AnamnesisTemplateCategory
  isPreAppointmentForm?: boolean
  isDefault?: boolean
  hasGeneralSession?: boolean
}

type RawTemplate = {
  id: string
  clinic_id: string
  name: string
  description: string | null
  category: string
  is_active: boolean
  is_default: boolean
  is_pre_appointment_form: boolean
  has_general_session: boolean
  version: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

type RawSession = {
  id: string
  template_id: string | null
  title: string
  description: string | null
  order_index: number
  is_active: boolean
}

type RawField = {
  id: string
  template_id: string | null
  session_id: string
  field_key: string
  label: string
  description: string | null
  help_text: string | null
  field_type: string
  placeholder: string | null
  is_required: boolean
  is_active: boolean
  is_visible: boolean
  order_index: number
}

type RawOption = {
  id: string
  field_id: string
  label: string
  value: string
  order_index: number
  is_active: boolean
}

const TEMPLATE_COLUMNS =
  'id, clinic_id, name, description, category, is_active, is_default, ' +
  'is_pre_appointment_form, has_general_session, version, created_by, ' +
  'updated_by, created_at, updated_at'

const SESSION_COLUMNS =
  'id, template_id, title, description, order_index, is_active'

const FIELD_COLUMNS =
  'id, template_id, session_id, field_key, label, description, help_text, ' +
  'field_type, placeholder, is_required, is_active, is_visible, order_index'

const OPTION_COLUMNS = 'id, field_id, label, value, order_index, is_active'

function mapTemplate(r: RawTemplate): AnamnesisTemplateDTO {
  return {
    id: r.id,
    clinicId: r.clinic_id,
    name: r.name,
    description: r.description,
    category: r.category as AnamnesisTemplateCategory,
    isActive: r.is_active,
    isDefault: r.is_default,
    isPreAppointmentForm: r.is_pre_appointment_form,
    hasGeneralSession: r.has_general_session,
    version: r.version,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapSession(r: RawSession): AnamnesisTemplateSessionDTO {
  return {
    id: r.id,
    templateId: r.template_id ?? '',
    title: r.title,
    description: r.description,
    orderIndex: r.order_index,
    isActive: r.is_active,
  }
}

function mapField(r: RawField): AnamnesisFieldDTO {
  return {
    id: r.id,
    templateId: r.template_id,
    sessionId: r.session_id,
    fieldKey: r.field_key,
    label: r.label,
    description: r.description,
    helpText: r.help_text,
    fieldType: r.field_type as AnamnesisFieldType,
    placeholder: r.placeholder,
    isRequired: r.is_required,
    isActive: r.is_active,
    isVisible: r.is_visible,
    orderIndex: r.order_index,
  }
}

function mapOption(r: RawOption): AnamnesisFieldOptionDTO {
  return {
    id: r.id,
    fieldId: r.field_id,
    label: r.label,
    value: r.value,
    orderIndex: r.order_index,
    isActive: r.is_active,
  }
}

export class AnamnesisTemplateRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async list(
    filter: ListAnamnesisTemplatesFilter = {},
  ): Promise<AnamnesisTemplateDTO[]> {
    let q = this.supabase
      .from('anamnesis_templates')
      .select(TEMPLATE_COLUMNS)
      .is('deleted_at', null)

    if (filter.status === 'active') q = q.eq('is_active', true)
    else if (filter.status === 'inactive') q = q.eq('is_active', false)

    if (filter.category && filter.category !== 'all') {
      q = q.eq('category', filter.category)
    }

    if (filter.search) {
      const term = String(filter.search).replace(/[%,]/g, ' ').trim()
      if (term) q = q.ilike('name', `%${term}%`)
    }

    q = q.order('name', { ascending: true })

    if (filter.limit) {
      q = q.range(filter.offset ?? 0, (filter.offset ?? 0) + filter.limit - 1)
    }

    const { data, error } = await q
    if (error || !data) return []
    return (data as unknown as RawTemplate[]).map(mapTemplate)
  }

  async getById(id: string): Promise<AnamnesisTemplateDTO | null> {
    const { data } = await this.supabase
      .from('anamnesis_templates')
      .select(TEMPLATE_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!data) return null
    return mapTemplate(data as unknown as RawTemplate)
  }

  /**
   * Template + sessions + fields + options · usado pelo preview admin.
   * Sessions/fields/options já vêm sem soft-deleted (deleted_at IS NULL).
   */
  async getByIdWithStructure(
    id: string,
  ): Promise<AnamnesisTemplateWithStructureDTO | null> {
    const template = await this.getById(id)
    if (!template) return null

    const [{ data: sessionRows }, { data: fieldRows }] = await Promise.all([
      this.supabase
        .from('anamnesis_template_sessions')
        .select(SESSION_COLUMNS)
        .eq('template_id', id)
        .is('deleted_at', null)
        .order('order_index', { ascending: true }),
      this.supabase
        .from('anamnesis_fields')
        .select(FIELD_COLUMNS)
        .eq('template_id', id)
        .is('deleted_at', null)
        .order('order_index', { ascending: true }),
    ])

    const sessions = ((sessionRows ?? []) as unknown as RawSession[]).map(mapSession)
    const fields = ((fieldRows ?? []) as unknown as RawField[]).map(mapField)

    // Options só para campos select/multiselect
    const choiceFieldIds = fields
      .filter((f) => f.fieldType === 'select' || f.fieldType === 'multiselect')
      .map((f) => f.id)
    let options: AnamnesisFieldOptionDTO[] = []
    if (choiceFieldIds.length > 0) {
      const { data: optionRows } = await this.supabase
        .from('anamnesis_field_options')
        .select(OPTION_COLUMNS)
        .in('field_id', choiceFieldIds)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
      options = ((optionRows ?? []) as unknown as RawOption[]).map(mapOption)
    }
    const optionsByField = new Map<string, AnamnesisFieldOptionDTO[]>()
    for (const o of options) {
      const list = optionsByField.get(o.fieldId) ?? []
      list.push(o)
      optionsByField.set(o.fieldId, list)
    }

    const fieldsBySession = new Map<
      string,
      Array<AnamnesisFieldDTO & { options: AnamnesisFieldOptionDTO[] }>
    >()
    for (const f of fields) {
      const list = fieldsBySession.get(f.sessionId) ?? []
      list.push({ ...f, options: optionsByField.get(f.id) ?? [] })
      fieldsBySession.set(f.sessionId, list)
    }

    const fullSessions = sessions.map((s) => ({
      ...s,
      fields: fieldsBySession.get(s.id) ?? [],
    }))

    return { ...template, sessions: fullSessions }
  }

  async getCounts(): Promise<AnamnesisTemplateCountsDTO> {
    const { data: templates } = await this.supabase
      .from('anamnesis_templates')
      .select('is_active, category')
      .is('deleted_at', null)
    const { count: totalFields } = await this.supabase
      .from('anamnesis_fields')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('is_active', true)

    const counts: AnamnesisTemplateCountsDTO = {
      total: 0,
      active: 0,
      inactive: 0,
      totalFields: totalFields ?? 0,
      byCategory: {
        general: 0,
        facial: 0,
        body: 0,
        capillary: 0,
        epilation: 0,
        custom: 0,
      },
    }
    if (!templates) return counts
    const rows = templates as Array<{ is_active: boolean; category: string }>
    counts.total = rows.length
    for (const r of rows) {
      if (r.is_active) counts.active++
      else counts.inactive++
      const c = r.category as AnamnesisTemplateCategory
      if (c in counts.byCategory) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(counts.byCategory as any)[c]++
      }
    }
    return counts
  }

  /**
   * Cria template top-level · NÃO cria sessions/fields (admin avançado fase
   * futura). RLS exige clinic_id JWT + role admin/owner.
   */
  async create(
    clinicId: string,
    input: CreateAnamnesisTemplateInput,
    actorId: string | null = null,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!input.name || input.name.trim().length < 2) {
      return { ok: false, error: 'name_required' }
    }
    const payload: Record<string, unknown> = {
      clinic_id: clinicId,
      name: input.name.trim(),
      description: input.description ?? null,
      category: input.category ?? 'general',
      is_pre_appointment_form: input.isPreAppointmentForm ?? false,
      has_general_session: input.hasGeneralSession ?? true,
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    }
    const { data, error } = await this.supabase
      .from('anamnesis_templates')
      .insert(payload)
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }
    return { ok: true, id: (data as { id: string }).id }
  }

  async update(
    id: string,
    input: UpdateAnamnesisTemplateInput,
    actorId: string | null = null,
  ): Promise<{ ok: boolean; error?: string }> {
    const payload: Record<string, unknown> = {}
    if (input.name !== undefined) {
      if (!input.name || input.name.trim().length < 2) {
        return { ok: false, error: 'name_invalid' }
      }
      payload.name = input.name.trim()
    }
    if (input.description !== undefined) payload.description = input.description
    if (input.category !== undefined) payload.category = input.category
    if (input.isPreAppointmentForm !== undefined) {
      payload.is_pre_appointment_form = input.isPreAppointmentForm
    }
    if (input.isDefault !== undefined) payload.is_default = input.isDefault
    if (input.hasGeneralSession !== undefined) {
      payload.has_general_session = input.hasGeneralSession
    }
    if (Object.keys(payload).length === 0) return { ok: false, error: 'empty_update' }
    payload.updated_at = new Date().toISOString()
    payload.updated_by = actorId

    const { error } = await this.supabase
      .from('anamnesis_templates')
      .update(payload)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  async setActive(
    id: string,
    active: boolean,
    actorId: string | null = null,
  ): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('anamnesis_templates')
      .update({
        is_active: active,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  /**
   * Lista snapshots clínicos de anamnese (`appointment_anamneses`) do
   * paciente · read-only · sem alterar status/hard gate. Os campos clínicos
   * sensíveis (medical_history, medications, ...) NÃO retornam aqui · só
   * metadados e um flag `hasContent` para a UI mostrar "preenchida" ou não.
   *
   * UI clínica detalhada (mostrar respostas) vive em fase futura com
   * contrato de role-gate explícito.
   */
  async listClinicalRecordsForPatient(
    patientId: string,
    opts: { limit?: number } = {},
  ): Promise<PatientAnamnesisRecordDTO[]> {
    const limit = Math.min(opts.limit ?? 50, 200)
    const { data, error } = await this.supabase
      .from('appointment_anamneses')
      .select(
        'id, patient_id, appointment_id, status, chief_complaint, ' +
          'medical_history, medications, allergies, completed_at, created_at, updated_at',
      )
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return (
      data as unknown as Array<{
        id: string
        patient_id: string | null
        appointment_id: string | null
        status: string | null
        chief_complaint: string | null
        medical_history: string | null
        medications: string | null
        allergies: string | null
        completed_at: string | null
        created_at: string
        updated_at: string
      }>
    ).map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      appointmentId: r.appointment_id,
      status: r.status,
      chiefComplaint: r.chief_complaint,
      hasContent: Boolean(
        r.chief_complaint || r.medical_history || r.medications || r.allergies,
      ),
      completedAt: r.completed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }
}
