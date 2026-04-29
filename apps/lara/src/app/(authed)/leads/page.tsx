/**
 * /leads · Server Component · port 1:1 do clinic-dashboard "Leads".
 *
 * Filtros lidos via searchParams (URL e a fonte unica de verdade pra:
 * shareable links, refresh sem perder estado, browser back/forward).
 *
 * KPIs no topo (Server Component aninhado · paraleliza counts).
 * Tabela + paginacao (limit=50 default · igual clinic-dashboard).
 *
 * Permissions: `patients:view` redireciona pra /dashboard se faltar.
 */

import { redirect } from 'next/navigation'
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
import { KpiCards } from './KpiCards'
import { LeadsClient } from './LeadsClient'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const VALID_FUNNELS: readonly Funnel[] = ['olheiras', 'fullface', 'procedimentos']
const VALID_PHASES: readonly LeadPhase[] = [
  'lead',
  'agendado',
  'reagendado',
  'compareceu',
  'paciente',
  'orcamento',
  'perdido',
]
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

interface PageData {
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

function buildFilter(searchParams: Record<string, string | string[] | undefined>): ListLeadsFilter {
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

  // Status: por default exclui leads que ja viraram paciente/orcamento/perdido
  // (igual o clinic-dashboard, view "leads ativos"). Param `?status=all` desliga.
  const status = get('status') || 'active'
  if (status === 'active') {
    filter.excludePhases = ['paciente', 'orcamento', 'perdido']
  } else if (status === 'archived') {
    filter.phases = ['perdido']
  } else if (status === 'patient') {
    filter.phases = ['paciente']
  }
  return filter
}

async function loadData(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<PageData> {
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
    const offset = (page - 1) * PAGE_SIZE

    const filter = buildFilter(searchParams)
    const { rows, total } = await repos.leads.list(ctx.clinic_id, filter, {
      limit: PAGE_SIZE,
      offset,
    })

    return { rows, total, filter, page, canView, canEdit, canDelete }
  } catch (e) {
    console.error('[/leads] loadData failed:', (e as Error).message, (e as Error).stack)
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

export default async function LeadsPage({
  searchParams,
}: {
  // Next 16 · searchParams agora e Promise<...>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const data = await loadData(sp)

  if (!data.canView) {
    redirect('/dashboard')
  }

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div style={{ marginBottom: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            Painel · Lara
          </p>
          <h1
            className="font-display"
            style={{ fontSize: 36, lineHeight: 1.05, color: 'var(--b2b-ivory)' }}
          >
            Lista de <em>leads</em>
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--b2b-text-dim)',
              fontStyle: 'italic',
              marginTop: 6,
            }}
          >
            Pessoas em contato · {data.total} {data.total === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        {/* KPI cards (server, paralelo) */}
        <KpiCards />

        {/* Tabela + filtros (client) */}
        <LeadsClient
          rows={data.rows}
          total={data.total}
          page={data.page}
          pageSize={PAGE_SIZE}
          initialFilter={{
            search: data.filter.search ?? '',
            funnel: data.filter.funnel ?? '',
            phase: data.filter.phase ?? '',
            temperature: data.filter.temperature ?? '',
            sourceType: data.filter.sourceType ?? '',
            status:
              (Array.isArray(sp.status) ? sp.status[0] : (sp.status as string)) || 'active',
            noResponseDays: Number(
              Array.isArray(sp.no_resp_days)
                ? sp.no_resp_days[0]
                : sp.no_resp_days || 0,
            ),
          }}
          canEdit={data.canEdit}
          canDelete={data.canDelete}
        />
      </div>
    </main>
  )
}
