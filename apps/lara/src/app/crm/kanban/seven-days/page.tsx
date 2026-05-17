/**
 * /crm/kanban/seven-days · BLOCO 3.5B · Kanban 7 Dias (read-only).
 *
 * Pipeline `seven_days` · 8 stages canônicos (sem_data..dia_7_plus).
 * READ-ONLY · sem drag-drop · paridade V1.
 *
 * Avanço temporal automático via cron `sdr_advance_day_buckets()` 00:00 (mig
 * V1 20260514). Esta tela apenas LÊ o estado atual de
 * `lead_pipeline_positions` via RPC `sdr_get_kanban_7dias`. Se positions
 * estiverem vazias (BLOCO 3.1A audit · ainda válido), o repository faz
 * fallback distribuindo leads ativos por idade (`now() - created_at`)
 * replicando a lógica do cron. **Fallback NÃO persiste posições.**
 *
 * Sem WhatsApp · sem provider · zero mutation. Single source of truth para
 * mover leads neste pipeline continua sendo o cron de 00:00.
 */

import Link from 'next/link'
import { ArrowLeftRight, Info } from 'lucide-react'
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { SevenDaysKanban } from './_components/seven-days-kanban'

export const dynamic = 'force-dynamic'

interface PageSearch {
  q?: string
  temperature?: 'hot' | 'warm' | 'cold' | 'all'
  phase?: 'lead' | 'agendado' | 'paciente' | 'orcamento'
}

export default async function SevenDaysKanbanPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  const query = (sp.q ?? '').trim().toLowerCase()
  const temperatureFilter =
    sp.temperature && sp.temperature !== 'all' ? sp.temperature : null
  const phaseFilter = sp.phase ?? null

  const result = await repos.leads.getKanban7Dias(ctx.clinic_id, phaseFilter)

  if (!result.ok) {
    return (
      <div className="space-y-4 p-6">
        <PageHeader
          title="Kanban 7 Dias"
          description="Visão temporal · pipeline read-only com avanço diário automático."
          breadcrumb={[
            { label: 'CRM', href: '/crm' },
            { label: 'Kanban', href: '/crm/kanban' },
            { label: '7 Dias' },
          ]}
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

  // Filtros client-side leve (RPC só filtra por phase)
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
        title="Kanban 7 Dias"
        description="Acompanhamento temporal · onde cada lead está na janela de 7 dias."
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Kanban', href: '/crm/kanban' },
          { label: '7 Dias' },
        ]}
      />

      {/* Toggle Evolution / 7 Dias */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
          Pipeline:
        </span>
        <Link
          href="/crm/kanban"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--color-border-soft)]/40"
        >
          <ArrowLeftRight className="h-3 w-3" />
          Evolução
        </Link>
        <span
          aria-current="page"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-3 py-1.5 font-medium text-[var(--primary)]"
        >
          7 Dias
        </span>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Visão geral · seven_days</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {totalLeads === 0 ? (
                <>
                  Nenhum lead encontrado
                  {query || temperatureFilter ? ' com os filtros aplicados' : ''}.
                </>
              ) : (
                <>
                  {totalLeads} lead{totalLeads === 1 ? '' : 's'} distribuído
                  {totalLeads === 1 ? '' : 's'} nos 8 estágios temporais
                </>
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {/* Banner read-only */}
          <div className="mb-3 flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--color-border-soft)]/30 p-3 text-[11px] text-[var(--muted-foreground)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
            <p>
              <strong className="text-[var(--foreground)]">Pipeline read-only.</strong>{' '}
              Os leads avançam automaticamente todo dia às 00:00 pelo cron{' '}
              <code>sdr_advance_day_buckets</code>. Esta tela apenas exibe o
              estágio temporal atual · não há drag-drop. Para mover leads
              manualmente entre stages comportamentais, use o{' '}
              <Link
                href="/crm/kanban"
                className="text-[var(--primary)] underline hover:no-underline"
              >
                Kanban Evolução
              </Link>
              .
            </p>
          </div>

          <SevenDaysKanban
            stages={filteredStages}
            currentQuery={query}
            currentTemperature={sp.temperature ?? 'all'}
            currentPhase={sp.phase ?? null}
          />
        </CardContent>
      </Card>

      <p className="text-[10px] text-[var(--muted-foreground)]">
        ℹ️ 8 estágios canônicos · de <strong>Dia 0</strong> (recém-criado, &lt; 1h)
        até <strong>Dia 7+</strong> (6+ dias).
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
