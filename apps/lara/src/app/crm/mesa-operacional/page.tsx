/**
 * /crm/mesa-operacional · BLOCO 3.2B · Mesa Operacional V2.
 *
 * Visão unificada para a secretária acompanhar a operação do CRM em 7
 * buckets canônicos (lead · agendado · paciente · orcamento ·
 * paciente_orcamento · perdido · arquivado).
 *
 * Server component · força dynamic · lê searchParams (busca, bucket,
 * temperature, source, professionalId) · chama
 * `repos.crmOperational.getMesa(...)` que consome `crm_operational_view` +
 * enrichment via SELECTs read-only.
 *
 * MVP read-only · zero mutation neste bloco · ações são links de navegação.
 * Bucket `arquivado` aparece read-only (RPCs `lead_archive`/`lead_unarchive`
 * ainda não existem · vide doc 13 §11).
 */

import { PageHeader, Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import {
  type MesaBucket,
  MESA_BUCKETS,
} from '@clinicai/repositories'
import { MesaFilters } from './_components/mesa-filters'
import { MesaKpiRow } from './_components/mesa-kpi-row'
import { MesaBoard } from './_components/mesa-board'

export const dynamic = 'force-dynamic'

interface PageSearch {
  q?: string
  bucket?: string
  temperature?: 'hot' | 'warm' | 'cold' | 'all'
  source?: string
  professionalId?: string
}

function parseBucket(raw: string | undefined): MesaBucket | 'all' {
  if (!raw || raw === 'all') return 'all'
  return (MESA_BUCKETS as readonly string[]).includes(raw)
    ? (raw as MesaBucket)
    : 'all'
}

export default async function MesaOperacionalPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  const search = (sp.q ?? '').trim()
  const bucket = parseBucket(sp.bucket)
  const temperature = sp.temperature ?? 'all'
  const source = sp.source ?? ''
  const professionalId = sp.professionalId ?? ''

  const result = await repos.crmOperational.getMesa(ctx.clinic_id, {
    search: search || null,
    bucket,
    temperature: temperature === 'all' ? null : temperature,
    source: source || null,
    professionalId: professionalId || null,
    limitPerBucket: bucket === 'all' ? 12 : 50,
  })

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <PageHeader
          title="Mesa Operacional"
          description="Visão unificada de leads, agenda, pacientes, orçamentos e recuperação."
          breadcrumb={[{ label: 'CRM', href: '/crm' }, { label: 'Mesa Operacional' }]}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Erro ao carregar mesa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted-foreground)]">
              Motivo:{' '}
              <code className="rounded bg-[var(--muted)] px-1">{result.error}</code>
              {result.detail ? (
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

  const lastUpdatedLabel = formatLastUpdated(result.lastUpdated)

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <PageHeader
        title="Mesa Operacional"
        description="Visão unificada de leads, agenda, pacientes, orçamentos e recuperação."
        breadcrumb={[{ label: 'CRM', href: '/crm' }, { label: 'Mesa Operacional' }]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {result.grandTotal} {result.grandTotal === 1 ? 'lead' : 'leads'} no
          recorte · atualizado {lastUpdatedLabel}
        </p>
        {result.fallbackWarning ? (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ Enriquecimento parcial:{' '}
            <code className="rounded bg-[var(--muted)] px-1 text-[10px]">
              {result.fallbackWarning}
            </code>
          </p>
        ) : null}
      </div>

      <MesaFilters
        currentQuery={search}
        currentBucket={bucket}
        currentTemperature={temperature}
        currentSource={source}
        currentProfessionalId={professionalId}
      />

      <MesaKpiRow buckets={result.buckets} activeBucket={bucket} />

      <MesaBoard
        buckets={result.buckets}
        activeBucket={bucket}
        grandTotal={result.grandTotal}
      />

      <p className="text-[10px] text-[var(--muted-foreground)]">
        ℹ️ Mesa Operacional consome <code>crm_operational_view</code> · 1 card
        por lead · 7 buckets derivados (lead · agendado · paciente · orcamento
        · paciente_orcamento · perdido · arquivado). Bucket{' '}
        <strong>arquivado</strong> é read-only no MVP · ações de
        arquivar/desarquivar chegam após criação das RPCs <code>lead_archive</code>{' '}
        / <code>lead_unarchive</code>.
      </p>
    </div>
  )
}

function formatLastUpdated(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return 'agora'
  }
}
