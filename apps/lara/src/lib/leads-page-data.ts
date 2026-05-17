/**
 * Leads page data helper · compartilhado entre `/leads` (authed shell)
 * e `/crm/leads` (CRM shell) · R3_CRM_3A.
 *
 * Antes: `/leads` tinha toda a lógica inline. Pra reusar no shell CRM
 * sem duplicar, extraído pra cá. Filtros, paginação e permissões ficam
 * idênticos · só o wrapper visual muda em cada rota.
 *
 * Sem mutação · só leitura · server-only (usa loadServerReposContext).
 */

import type {
  Funnel,
  LeadDTO,
  LeadPhase,
  LeadSourceType,
  LeadTemperature,
  ListLeadsFilter,
} from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { can } from '@/lib/permissions'

export const LEADS_PAGE_SIZE = 50

const VALID_FUNNELS: readonly Funnel[] = ['olheiras', 'fullface', 'procedimentos']
// Contrato canonico (Fase 1C · 2026-05-11): 4 phases. `perdido` virou
// lifecycle_status (filtro de "arquivado" depende de coluna separada · TODO Fase 1E).
const VALID_PHASES: readonly LeadPhase[] = ['lead', 'agendado', 'paciente', 'orcamento']
const VALID_TEMPS: readonly LeadTemperature[] = ['cold', 'warm', 'hot']
const VALID_SOURCE_TYPES: readonly LeadSourceType[] = [
  'manual',
  'quiz',
  'import',
  'referral',
  'social',
  'whatsapp',
  'whatsapp_fullface',
  'landing_page',
  'b2b_voucher',
  'vpi_referral',
]

export interface LeadsPageData {
  rows: LeadDTO[]
  total: number
  filter: ListLeadsFilter
  page: number
  canView: boolean
  canEdit: boolean
  canDelete: boolean
}

function pickFunnel(raw: string | undefined): Funnel | undefined {
  return raw && VALID_FUNNELS.includes(raw as Funnel) ? (raw as Funnel) : undefined
}
function pickPhase(raw: string | undefined): LeadPhase | undefined {
  return raw && VALID_PHASES.includes(raw as LeadPhase) ? (raw as LeadPhase) : undefined
}
function pickTemp(raw: string | undefined): LeadTemperature | undefined {
  return raw && VALID_TEMPS.includes(raw as LeadTemperature) ? (raw as LeadTemperature) : undefined
}
function pickSource(raw: string | undefined): LeadSourceType | undefined {
  return raw && VALID_SOURCE_TYPES.includes(raw as LeadSourceType)
    ? (raw as LeadSourceType)
    : undefined
}

export function buildLeadsFilter(
  searchParams: Record<string, string | string[] | undefined>,
): ListLeadsFilter {
  const get = (k: string): string | undefined => {
    const v = searchParams[k]
    return Array.isArray(v) ? v[0] : v
  }
  const filter: ListLeadsFilter = {}
  const search = (get('q') || '').trim()
  if (search) filter.search = search

  const funnel = pickFunnel(get('funnel'))
  if (funnel) filter.funnel = funnel

  const phase = pickPhase(get('phase'))
  if (phase) filter.phase = phase

  const temp = pickTemp(get('temp'))
  if (temp) filter.temperature = temp

  const source = pickSource(get('source'))
  if (source) filter.sourceType = source

  // "Sem resposta ha X dias" · campo livre 1-90
  const noRespDays = Number(get('no_resp_days') || 0)
  if (noRespDays > 0 && noRespDays <= 90) {
    const cutoff = new Date(Date.now() - noRespDays * 86400000).toISOString()
    filter.noResponseSinceIso = cutoff
  }

  // Status (Fase 1E · 2026-05-11): perda agora vive em `lifecycle_status`,
  // não em `phase`. `status=archived` filtra `lifecycleStatus='perdido'` ·
  // demais views excluem perdidos por default pra não poluir a operação.
  // Param `?status=all` desliga todos os filtros derivados.
  const status = get('status') || 'active'
  if (status === 'active') {
    filter.excludePhases = ['paciente', 'orcamento']
    filter.excludeLifecycleStatuses = ['perdido', 'arquivado']
  } else if (status === 'patient') {
    filter.phases = ['paciente']
    filter.excludeLifecycleStatuses = ['perdido', 'arquivado']
  } else if (status === 'archived') {
    filter.lifecycleStatus = 'perdido'
  }
  return filter
}

export async function loadLeadsPageData(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<LeadsPageData> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const role = ctx.role ?? null

    const canView = can(role, 'patients:view')
    const canEdit = can(role, 'patients:edit')
    const canDelete = can(role, 'patients:delete')

    if (!canView) {
      return {
        rows: [],
        total: 0,
        filter: {},
        page: 1,
        canView: false,
        canEdit: false,
        canDelete: false,
      }
    }

    const pageRaw = Number(
      Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page,
    )
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
    const offset = (page - 1) * LEADS_PAGE_SIZE

    const filter = buildLeadsFilter(searchParams)
    const { rows, total } = await repos.leads.list(ctx.clinic_id, filter, {
      limit: LEADS_PAGE_SIZE,
      offset,
    })

    return { rows, total, filter, page, canView, canEdit, canDelete }
  } catch (e) {
    console.error('[leads-page-data] loadLeadsPageData failed:', (e as Error).message, (e as Error).stack)
    return {
      rows: [],
      total: 0,
      filter: {},
      page: 1,
      canView: false,
      canEdit: false,
      canDelete: false,
    }
  }
}
