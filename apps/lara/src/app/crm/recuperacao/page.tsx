/**
 * /crm/recuperacao · fila de recuperação comercial (CRM_PHASE_2RC).
 *
 * Lista unificada de 4 fontes:
 *   - leads perdidos (perdidos table · is_recoverable=true)
 *   - appointments cancelado (lookback 60d)
 *   - appointments no_show (lookback 60d)
 *   - orçamentos draft frios (>14d)
 *
 * Ações disponíveis:
 *   - Reativar lead perdido → lead_recover RPC
 *   - Descartar permanente → recovery_perdido_mark_discarded
 *   - Adicionar nota → recovery_perdido_add_note
 *   - Para appointment_cancelled/no_show: navegar p/ /crm/agenda/[id]/editar
 *   - Para orcamento_frio: navegar p/ /crm/orcamentos/[id]
 *
 * ZERO envio WhatsApp · ZERO automação · UI pura sobre VIEW.
 */

import { PageHeader, Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { RecoveryList } from './_recovery-list'
import type {
  RecoverySourceType,
  RecoveryStatus,
  RecoveryPriority,
} from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

interface PageSearch {
  source?: RecoverySourceType | 'all'
  status?: RecoveryStatus | 'all'
  priority?: RecoveryPriority | 'all'
}

export default async function RecuperacaoPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  const filter = {
    sourceType: sp.source ?? 'all',
    status: sp.status ?? 'aberto',
    priority: sp.priority ?? 'all',
    limit: 100,
  } as const

  const [{ items }, counts] = await Promise.all([
    repos.commercialRecovery.listQueue(filter),
    repos.commercialRecovery.getCounts(),
  ])

  const allowedRole =
    ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'receptionist'

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Recuperação comercial"
        description="Leads perdidos, appointments cancelados/no-show e orçamentos frios em uma fila unificada"
        breadcrumb={[{ label: 'CRM', href: '/crm' }, { label: 'Recuperação' }]}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCard label="Total aberto" value={counts.byStatus.aberto} />
        <KpiCard label="Alta prioridade" value={counts.byPriority.alta} tone="alert" />
        <KpiCard label="Recuperados" value={counts.byStatus.recuperado} tone="ok" />
        <KpiCard label="Descartados" value={counts.byStatus.descartado} tone="muted" />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Fila ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <RecoveryList
            items={items}
            counts={counts}
            currentFilter={{
              source: filter.sourceType,
              status: filter.status,
              priority: filter.priority,
            }}
            canAct={allowedRole}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'alert' | 'muted'
}) {
  const color =
    tone === 'alert'
      ? 'text-[var(--destructive)]'
      : tone === 'ok'
        ? 'text-[var(--primary)]'
        : tone === 'muted'
          ? 'text-[var(--muted-foreground)]'
          : 'text-[var(--foreground)]'
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
          {label}
        </span>
        <span className={`text-2xl font-semibold ${color}`}>{value}</span>
      </CardContent>
    </Card>
  )
}
