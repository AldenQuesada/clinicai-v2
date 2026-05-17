/**
 * /crm/kanban · BLOCO 3.1 · Kanban Leads visual com drag-drop.
 *
 * Pipeline `evolution` · 3 stages canônicos:
 *   1. novo
 *   2. em_conversa
 *   3. em_negociacao
 *
 * Dados via RPC `sdr_get_kanban_evolution` (mig V1 20260509000000) que
 * une `pipelines` + `pipeline_stages` + `lead_pipeline_positions` + `leads`
 * scoped por clinic_id via _sdr_clinic_id() JWT.
 *
 * Drag-drop via @dnd-kit/core (já validado na agenda · CRM_PHASE_2AUX.2) ·
 * persiste via RPC `sdr_move_lead` em `_actions.ts`.
 *
 * Estado atual do banco (Bloco 3 audit): `lead_pipeline_positions=0` rows ·
 * UI mostra empty state com call-to-action quando coluna está vazia. Primeira
 * movimentação cria posição via UPSERT na RPC.
 *
 * Fora do escopo BLOCO 3.1 (próximos blocos): pipeline `seven_days`, bulk
 * actions, mesa operacional, dashboard KPIs (já existe em /crm/dashboard).
 *
 * Sem WhatsApp · sem provider · zero side-effects fora da RPC `sdr_move_lead`.
 */

import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { LeadsKanban } from './_components/leads-kanban'

export const dynamic = 'force-dynamic'

interface PageSearch {
  q?: string
  temperature?: 'hot' | 'warm' | 'cold' | 'all'
}

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  // Filtros · UI vai re-renderizar via URL searchParams (padrão V2)
  const query = (sp.q ?? '').trim().toLowerCase()
  const temperatureFilter =
    sp.temperature && sp.temperature !== 'all' ? sp.temperature : null

  // BLOCO 3.1A · passa clinic_id pro fallback SELECT escopar corretamente
  // (RPC interna usa _sdr_clinic_id() JWT · fallback usa eq('clinic_id', ...))
  const result = await repos.leads.getKanbanEvolution(ctx.clinic_id, null)

  if (!result.ok) {
    return (
      <div className="space-y-4 p-6">
        <PageHeader
          title="Kanban de Leads"
          description="Pipeline evolution · drag-drop entre estágios."
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Erro ao carregar kanban</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted-foreground)]">
              Motivo: <code className="rounded bg-[var(--muted)] px-1">{result.error}</code>
              {'detail' in result && result.detail ? (
                <>
                  {' · '}
                  <span className="text-xs">{result.detail}</span>
                </>
              ) : null}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Aplica filtros client-side leve (server filtra via RPC só por phase)
  const filteredStages = result.stages.map((stage) => {
    const filteredLeads = stage.leads.filter((l) => {
      if (temperatureFilter && l.temperature !== temperatureFilter) return false
      if (query) {
        const haystack = `${l.name ?? ''} ${l.phone ?? ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
    return { ...stage, leads: filteredLeads }
  })

  const totalLeads = filteredStages.reduce((acc, s) => acc + s.leads.length, 0)

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Kanban de Leads"
        description="Pipeline evolution · arraste os cards entre estágios pra mover leads."
      />

      {/* BLOCO 3.5B · Toggle Evolução / 7 Dias */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
          Pipeline:
        </span>
        <span
          aria-current="page"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-3 py-1.5 font-medium text-[var(--primary)]"
        >
          Evolução
        </span>
        <Link
          href="/crm/kanban/seven-days"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40"
        >
          <ArrowLeftRight className="h-3 w-3" />
          7 Dias
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Visão geral · evolution</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {totalLeads === 0 ? (
                <>
                  Nenhum lead encontrado{query || temperatureFilter ? ' com os filtros aplicados' : ''}.
                </>
              ) : (
                <>
                  {totalLeads} lead{totalLeads === 1 ? '' : 's'} distribuído
                  {totalLeads === 1 ? '' : 's'} no pipeline
                </>
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <LeadsKanban
            stages={filteredStages}
            currentQuery={query}
            currentTemperature={sp.temperature ?? 'all'}
          />
        </CardContent>
      </Card>

      <p className="text-[10px] text-[var(--muted-foreground)]">
        ℹ️ Leads ativos sem posição salva aparecem automaticamente em{' '}
        <strong>Novo</strong> com badge <em>Sem posição</em>. Ao arrastar um
        card, a posição passa a ser persistida no pipeline (RPC{' '}
        <code>sdr_move_lead</code>).
        {result.fallbackWarning && (
          <>
            {' · '}
            <span className="text-amber-600 dark:text-amber-400">
              Aviso de fallback: <code>{result.fallbackWarning}</code>
            </span>
          </>
        )}
      </p>
    </div>
  )
}
