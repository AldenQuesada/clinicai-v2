'use client'

/**
 * /crm/recuperacao · 3 buckets do scheduler (Lote 3 · Agente F).
 *
 * Visualização leve · cards "Vencidos", "Hoje", "Próximos 7 dias".
 * Cada linha mostra paciente + próxima ação + botão para abrir o modal
 * "Definir próxima ação" (reusa NextActionDialog do _recovery-list).
 *
 * Empty state real por bucket · loading state via Suspense no page.tsx.
 *
 * ZERO envio WhatsApp · ZERO chamada provider · ZERO cron · só persistência
 * via setRecoveryNextActionAction (RPC commercial_recovery_workflow_set_next_action).
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type {
  RecoveryNextActionType,
  RecoverySourceType,
  RecoveryWorkflowItemDTO,
} from '@clinicai/repositories'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@clinicai/ui'
import { NextActionDialog } from './_recovery-list'

const SOURCE_LABEL: Record<RecoverySourceType, string> = {
  lead_lost: 'Lead perdido',
  appointment_cancelled: 'Cancelado',
  appointment_no_show: 'No-show',
  orcamento_frio: 'Orçamento frio',
}

const NEXT_ACTION_LABEL: Record<RecoveryNextActionType, string> = {
  ligar: 'Ligar',
  enviar_whatsapp_quando_liberado: 'WhatsApp (quando liberado)',
  agendar_retorno: 'Agendar retorno',
  revisar_orcamento: 'Revisar orçamento',
  marcar_descartado: 'Marcar descartado',
  reativar_lead: 'Reativar lead',
  observar: 'Apenas observar',
}

interface Props {
  overdue: RecoveryWorkflowItemDTO[]
  today: RecoveryWorkflowItemDTO[]
  upcoming: RecoveryWorkflowItemDTO[]
  overdueError?: string
  todayError?: string
  upcomingError?: string
  canAct: boolean
}

export function RecoveryBuckets({
  overdue,
  today,
  upcoming,
  overdueError,
  todayError,
  upcomingError,
  canAct,
}: Props) {
  return (
    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
      <BucketCard
        title="Vencidos"
        tone="alert"
        count={overdue.length}
        error={overdueError}
        items={overdue}
        emptyMsg="Sem ações pendentes vencidas."
        canAct={canAct}
      />
      <BucketCard
        title="Hoje"
        tone="warn"
        count={today.length}
        error={todayError}
        items={today}
        emptyMsg="Nada agendado para hoje."
        canAct={canAct}
      />
      <BucketCard
        title="Próximos 7 dias"
        tone="ok"
        count={upcoming.length}
        error={upcomingError}
        items={upcoming}
        emptyMsg="Sem ações na próxima semana."
        canAct={canAct}
      />
    </div>
  )
}

function BucketCard({
  title,
  tone,
  count,
  error,
  items,
  emptyMsg,
  canAct,
}: {
  title: string
  tone: 'alert' | 'warn' | 'ok'
  count: number
  error?: string
  items: RecoveryWorkflowItemDTO[]
  emptyMsg: string
  canAct: boolean
}) {
  const accent =
    tone === 'alert'
      ? 'text-[var(--destructive)]'
      : tone === 'warn'
        ? 'text-amber-700'
        : 'text-[var(--primary)]'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-baseline justify-between text-sm">
          <span>{title}</span>
          <span className={`text-lg font-semibold ${accent}`}>{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <p className="rounded-md border border-[var(--destructive)] bg-[var(--destructive)]/10 px-2 py-1.5 text-[11px] text-[var(--destructive)]">
            Falha ao carregar: {error}
          </p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[var(--muted-foreground)]">
            {emptyMsg}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.slice(0, 10).map((it) => (
              <BucketRow key={`${it.sourceType}_${it.itemId}`} item={it} canAct={canAct} />
            ))}
            {items.length > 10 && (
              <li className="pt-2 text-center text-[11px] text-[var(--muted-foreground)]">
                +{items.length - 10} restantes — veja a fila completa abaixo
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function BucketRow({ item, canAct }: { item: RecoveryWorkflowItemDTO; canAct: boolean }) {
  const router = useRouter()
  const [openNext, setOpenNext] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const nextWhen = item.nextActionAt
    ? new Date(item.nextActionAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const overdue = item.nextActionOverdue

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{item.displayName ?? 'Sem nome'}</p>
          <p className="truncate text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            {SOURCE_LABEL[item.sourceType]}
            {item.phoneLast4 ? ` · tel ${item.phoneLast4}` : ''}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-1">
          {item.leadId && (
            <Link href={`/crm/leads/${item.leadId}`}>
              <Button size="sm" variant="ghost">Abrir</Button>
            </Link>
          )}
          {canAct && item.workflowId && (
            <Button size="sm" variant="outline" onClick={() => setOpenNext(true)}>
              Definir
            </Button>
          )}
        </div>
      </div>
      {nextWhen && (
        <p className={`text-[11px] ${overdue ? 'font-semibold text-[var(--destructive)]' : 'text-[var(--muted-foreground)]'}`}>
          {overdue ? '⏰ ATRASADO · ' : '⏱ '}
          {nextWhen}
          {item.nextActionType ? ` · ${NEXT_ACTION_LABEL[item.nextActionType]}` : ''}
        </p>
      )}
      {error && <p className="text-[11px] text-[var(--destructive)]">Erro: {error}</p>}

      {openNext && item.workflowId && (
        <NextActionDialog
          workflowId={item.workflowId}
          currentType={item.nextActionType}
          currentAt={item.nextActionAt}
          onClose={() => setOpenNext(false)}
          pending={pending}
          startTransition={startTransition}
          setError={(s) => {
            setError(s)
            if (!s) router.refresh()
          }}
        />
      )}
    </li>
  )
}
