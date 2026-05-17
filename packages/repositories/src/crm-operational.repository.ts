/**
 * CrmOperationalRepository · BLOCO 3.2B · Mesa Operacional.
 *
 * Read-only · consome `public.crm_operational_view` (mig 150 retroapply ·
 * doc 14 ADR single-table operational CRM) + enriquecimento via SELECTs em
 * leads/appointments/orcamentos. 1 row por lead_id · 7 buckets canônicos:
 *
 *   lead · agendado · paciente · orcamento · paciente_orcamento · perdido ·
 *   arquivado
 *
 * Padrão Result discriminated union (mesmo padrão do `getKanbanEvolution`).
 *
 * ZERO mutação · ZERO RPC · ZERO provider externo · ZERO wa_outbox.
 *
 * View atual (mig 150) tem 17 colunas + `mesa_operacional` derivado via CASE.
 * Não inclui temperature/source/professional/procedure/total — enrichment
 * via SELECTs em tabelas base cobre. Se enrichment falhar, retorna
 * `fallbackWarning` e cards básicos da view (mesmo padrão Kanban 3.1A).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type MesaBucket =
  | 'lead'
  | 'agendado'
  | 'paciente'
  | 'orcamento'
  | 'paciente_orcamento'
  | 'perdido'
  | 'arquivado'

export const MESA_BUCKETS: readonly MesaBucket[] = [
  'lead',
  'agendado',
  'paciente',
  'orcamento',
  'paciente_orcamento',
  'perdido',
  'arquivado',
] as const

export const MESA_BUCKET_LABELS: Record<MesaBucket, string> = {
  lead: 'Leads',
  agendado: 'Agendados',
  paciente: 'Pacientes',
  orcamento: 'Orçamentos',
  paciente_orcamento: 'Paciente + Orçamento',
  perdido: 'Perdidos',
  arquivado: 'Arquivados',
}

export interface GetMesaParams {
  search?: string | null
  bucket?: MesaBucket | 'all' | null
  professionalId?: string | null
  temperature?: 'hot' | 'warm' | 'cold' | 'all' | null
  source?: string | null
  limitPerBucket?: number
}

export interface MesaCard {
  leadId: string
  patientId: string | null
  name: string | null
  phone: string | null
  email: string | null
  bucket: MesaBucket
  leadPhase: string | null
  lifecycleStatus: string | null
  lostFromPhase: string | null
  appointmentId: string | null
  appointmentStatus: string | null
  scheduledDate: string | null
  startTime: string | null
  endTime: string | null
  professionalId: string | null
  professionalName: string | null
  procedureName: string | null
  budgetId: string | null
  budgetStatus: string | null
  budgetTotal: number | null
  temperature: string | null
  source: string | null
  sourceType: string | null
  updatedAt: string | null
  hasActiveBudget: boolean
  isNoShow: boolean
}

export interface MesaBucketResult {
  bucket: MesaBucket
  label: string
  total: number
  cards: MesaCard[]
}

export type GetMesaResult =
  | {
      ok: true
      buckets: MesaBucketResult[]
      grandTotal: number
      lastUpdated: string
      fallbackWarning?: string
    }
  | {
      ok: false
      error: string
      detail?: string
    }

const DEFAULT_LIMIT_PER_BUCKET = 50
const VIEW_FETCH_HARD_CAP = 1000

export class CrmOperationalRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Carrega Mesa Operacional (view + enrichment).
   *
   * Estratégia:
   *  1. SELECT em `crm_operational_view` filtrado por clinic_id + bucket +
   *     search (nome OU telefone via PostgREST `.or` ilike).
   *  2. Coleta lead_ids / appointment_ids / budget_ids.
   *  3. 3 SELECTs read-only em paralelo:
   *     - leads (temperature, source, source_type, updated_at, assigned_to)
   *     - appointments (professional_id, professional_name, procedure_name)
   *     - orcamentos (total, status)
   *  4. Build cards enriched · aplica post-filters de temperature/source/
   *     professionalId (que só existem após enrichment).
   *  5. Group por bucket · sort (updated_at DESC fallback scheduledDate ASC
   *     fallback name ASC) · limit por bucket.
   *
   * Erro fatal apenas no SELECT principal da view. Erros de enrichment viram
   * `fallbackWarning` e cards perdem só os campos enriched (não derrubam tela).
   */
  async getMesa(
    clinicId: string,
    params: GetMesaParams = {},
  ): Promise<GetMesaResult> {
    const limit = params.limitPerBucket ?? DEFAULT_LIMIT_PER_BUCKET

    // 1. SELECT principal · view
    let viewQ = this.supabase
      .from('crm_operational_view')
      .select('*')
      .eq('clinic_id', clinicId)
      .limit(VIEW_FETCH_HARD_CAP)

    if (params.bucket && params.bucket !== 'all') {
      viewQ = viewQ.eq('mesa_operacional', params.bucket)
    }

    if (params.search) {
      const term = params.search.trim()
      if (term) {
        // Sanitização: remove % e , que quebram o .or() do PostgREST
        const escaped = term.replace(/%/g, '').replace(/,/g, ' ')
        viewQ = viewQ.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
      }
    }

    const { data: viewRows, error: viewErr } = await viewQ
    if (viewErr) {
      return {
        ok: false,
        error: 'view_query_failed',
        detail: viewErr.message,
      }
    }

    const rows = (viewRows ?? []) as Array<{
      clinic_id: string | null
      lead_id: string | null
      patient_id: string | null
      name: string | null
      phone: string | null
      email: string | null
      lead_phase: string | null
      lifecycle_status: string | null
      lost_from_phase: string | null
      appointment_id: string | null
      appointment_status: string | null
      scheduled_date: string | null
      start_time: string | null
      end_time: string | null
      budget_id: string | null
      budget_status: string | null
      mesa_operacional: string | null
      is_no_show: boolean | null
      has_active_budget: boolean | null
    }>

    // Defensivo: ignorar rows sem lead_id (PK efetiva da view)
    const validRows = rows.filter((r) => r.lead_id != null)

    if (validRows.length === 0) {
      return {
        ok: true,
        buckets: emptyBuckets(),
        grandTotal: 0,
        lastUpdated: new Date().toISOString(),
      }
    }

    const leadIds = validRows.map((r) => r.lead_id as string)
    const apptIds = Array.from(
      new Set(
        validRows
          .map((r) => r.appointment_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const budgetIds = Array.from(
      new Set(
        validRows
          .map((r) => r.budget_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )

    // 2. Enrichment paralelo · 3 SELECTs read-only
    let fallbackWarning: string | undefined
    const [leadsResp, apptsResp, orcsResp] = await Promise.all([
      this.supabase
        .from('leads')
        .select('id, temperature, source, source_type, updated_at, assigned_to')
        .eq('clinic_id', clinicId)
        .in('id', leadIds),
      apptIds.length === 0
        ? Promise.resolve({
            data: [] as Array<{
              id: string
              professional_id: string | null
              professional_name: string | null
              procedure_name: string | null
            }>,
            error: null,
          })
        : this.supabase
            .from('appointments')
            .select('id, professional_id, professional_name, procedure_name')
            .eq('clinic_id', clinicId)
            .in('id', apptIds),
      budgetIds.length === 0
        ? Promise.resolve({
            data: [] as Array<{
              id: string
              total: number | string | null
              status: string | null
            }>,
            error: null,
          })
        : this.supabase
            .from('orcamentos')
            .select('id, total, status')
            .eq('clinic_id', clinicId)
            .in('id', budgetIds),
    ])

    if (leadsResp.error) {
      fallbackWarning = `leads_enrichment_failed: ${leadsResp.error.message}`
    }
    if (apptsResp.error) {
      fallbackWarning =
        (fallbackWarning ? `${fallbackWarning} · ` : '') +
        `appointments_enrichment_failed: ${apptsResp.error.message}`
    }
    if (orcsResp.error) {
      fallbackWarning =
        (fallbackWarning ? `${fallbackWarning} · ` : '') +
        `orcamentos_enrichment_failed: ${orcsResp.error.message}`
    }

    // Maps de enrichment (lookup O(1))
    const leadById = new Map<
      string,
      {
        temperature: string | null
        source: string | null
        sourceType: string | null
        updatedAt: string | null
        assignedTo: string | null
      }
    >()
    for (const row of (leadsResp.data ?? []) as Array<{
      id: string
      temperature: string | null
      source: string | null
      source_type: string | null
      updated_at: string | null
      assigned_to: string | null
    }>) {
      leadById.set(row.id, {
        temperature: row.temperature,
        source: row.source,
        sourceType: row.source_type,
        updatedAt: row.updated_at,
        assignedTo: row.assigned_to,
      })
    }

    const apptById = new Map<
      string,
      {
        professionalId: string | null
        professionalName: string | null
        procedureName: string | null
      }
    >()
    for (const row of (apptsResp.data ?? []) as Array<{
      id: string
      professional_id: string | null
      professional_name: string | null
      procedure_name: string | null
    }>) {
      apptById.set(row.id, {
        professionalId: row.professional_id,
        professionalName: row.professional_name,
        procedureName: row.procedure_name,
      })
    }

    const orcById = new Map<
      string,
      {
        total: number | null
        status: string | null
      }
    >()
    for (const row of (orcsResp.data ?? []) as Array<{
      id: string
      total: number | string | null
      status: string | null
    }>) {
      orcById.set(row.id, {
        total: row.total == null ? null : Number(row.total),
        status: row.status,
      })
    }

    // 3. Build cards + post-filters (temperature/source/professional só
    //    disponíveis após enrichment)
    const tempFilter =
      params.temperature && params.temperature !== 'all' ? params.temperature : null
    const sourceFilter = params.source ?? null
    const profFilter = params.professionalId ?? null

    const allCards: MesaCard[] = []
    for (const r of validRows) {
      const enriched = leadById.get(r.lead_id as string)
      const appt = r.appointment_id ? apptById.get(r.appointment_id) : null
      const orc = r.budget_id ? orcById.get(r.budget_id) : null

      if (tempFilter && enriched?.temperature !== tempFilter) continue
      if (sourceFilter && enriched?.source !== sourceFilter) continue
      if (profFilter && appt?.professionalId !== profFilter) continue

      const bucket = (r.mesa_operacional ?? 'lead') as MesaBucket
      allCards.push({
        leadId: r.lead_id as string,
        patientId: r.patient_id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        bucket,
        leadPhase: r.lead_phase,
        lifecycleStatus: r.lifecycle_status,
        lostFromPhase: r.lost_from_phase,
        appointmentId: r.appointment_id,
        appointmentStatus: r.appointment_status,
        scheduledDate: r.scheduled_date,
        startTime: r.start_time,
        endTime: r.end_time,
        professionalId: appt?.professionalId ?? null,
        professionalName: appt?.professionalName ?? null,
        procedureName: appt?.procedureName ?? null,
        budgetId: r.budget_id,
        budgetStatus: r.budget_status,
        budgetTotal: orc?.total ?? null,
        temperature: enriched?.temperature ?? null,
        source: enriched?.source ?? null,
        sourceType: enriched?.sourceType ?? null,
        updatedAt: enriched?.updatedAt ?? null,
        hasActiveBudget: Boolean(r.has_active_budget),
        isNoShow: Boolean(r.is_no_show),
      })
    }

    // 4. Group + sort + limit por bucket
    const byBucket: Record<MesaBucket, MesaCard[]> = {
      lead: [],
      agendado: [],
      paciente: [],
      orcamento: [],
      paciente_orcamento: [],
      perdido: [],
      arquivado: [],
    }
    for (const c of allCards) {
      if (byBucket[c.bucket]) byBucket[c.bucket].push(c)
    }

    const buckets: MesaBucketResult[] = MESA_BUCKETS.map((b) => {
      const cards = byBucket[b]
      cards.sort(compareCards)
      return {
        bucket: b,
        label: MESA_BUCKET_LABELS[b],
        total: cards.length,
        cards: cards.slice(0, limit),
      }
    })

    return {
      ok: true,
      buckets,
      grandTotal: allCards.length,
      lastUpdated: new Date().toISOString(),
      fallbackWarning,
    }
  }
}

// updatedAt DESC > scheduledDate+startTime ASC > nome ASC.
// Coloca os com mais sinal operacional primeiro.
function compareCards(a: MesaCard, b: MesaCard): number {
  if (a.updatedAt && b.updatedAt) {
    if (a.updatedAt > b.updatedAt) return -1
    if (a.updatedAt < b.updatedAt) return 1
  } else if (a.updatedAt) {
    return -1
  } else if (b.updatedAt) {
    return 1
  }
  if (a.scheduledDate && b.scheduledDate) {
    const keyA = `${a.scheduledDate} ${a.startTime ?? ''}`
    const keyB = `${b.scheduledDate} ${b.startTime ?? ''}`
    const cmp = keyA.localeCompare(keyB)
    if (cmp !== 0) return cmp
  }
  return (a.name ?? '').localeCompare(b.name ?? '')
}

function emptyBuckets(): MesaBucketResult[] {
  return MESA_BUCKETS.map((b) => ({
    bucket: b,
    label: MESA_BUCKET_LABELS[b],
    total: 0,
    cards: [],
  }))
}
