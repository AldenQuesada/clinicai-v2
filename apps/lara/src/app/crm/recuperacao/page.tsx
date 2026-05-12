/**
 * /crm/recuperacao · fila de recuperação comercial · CRM_PHASE_2RC + 2RC.1.
 *
 * Consome commercial_recovery_workflow_view (queue + workflow LEFT JOIN · mig 174).
 * Suporta filtros por origem / estágio / prioridade / status + toggle "atrasados".
 *
 * Ações disponíveis:
 *   - Iniciar workflow (cria workflow_item · idempotente)
 *   - Mudar estágio (kanban-lite · 8 stages)
 *   - Mudar prioridade (4 níveis)
 *   - Set próxima ação (tipo + datetime + responsável opcional)
 *   - Adicionar nota (audit trail)
 *   - Marcar recuperado · descartar
 *   - Sugestão de abordagem (DRY-RUN · NUNCA dispara WhatsApp)
 *   - Reativar lead perdido (lead_recover RPC · 2RC)
 *
 * ZERO envio WhatsApp · ZERO chamada provider · ZERO row em wa_outbox.
 */

import { PageHeader, Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { RecoveryList } from './_recovery-list'
import type {
  RecoveryNextActionType,
  RecoveryPriority,
  RecoverySourceType,
  RecoveryStage,
  RecoveryStatus,
} from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

interface PageSearch {
  source?: RecoverySourceType | 'all'
  stage?: RecoveryStage | 'all'
  priority?: RecoveryPriority | 'all'
  status?: RecoveryStatus | 'all'
  overdue?: string
}

export default async function RecuperacaoPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  const overdueOnly = sp.overdue === '1' || sp.overdue === 'true'

  const filter = {
    sourceType: sp.source ?? 'all',
    stage: sp.stage ?? 'all',
    priority: sp.priority ?? 'all',
    status: sp.status ?? 'aberto',
    overdueOnly,
    limit: 100,
  } as const

  const [{ items }, counts] = await Promise.all([
    repos.commercialRecovery.listWorkflowQueue(filter),
    repos.commercialRecovery.getWorkflowCounts(ctx.user_id ?? null),
  ])

  const allowedRole =
    ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'receptionist'

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Recuperação comercial"
        description="Leads perdidos, appointments cancelados/no-show e orçamentos frios · workflow interno"
        breadcrumb={[{ label: 'CRM', href: '/crm' }, { label: 'Recuperação' }]}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Total" value={counts.total} />
        <KpiCard label="Urgente + Alta" value={counts.byPriority.urgente + counts.byPriority.alta} tone="alert" />
        <KpiCard label="Atrasados" value={counts.overdue} tone={counts.overdue > 0 ? 'alert' : 'muted'} />
        <KpiCard label="Recuperados" value={counts.byStage.recuperado} tone="ok" />
        <KpiCard label="Atribuídos a mim" value={counts.assignedToMe} />
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
              stage: filter.stage,
              priority: filter.priority,
              status: filter.status,
              overdueOnly: filter.overdueOnly,
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
