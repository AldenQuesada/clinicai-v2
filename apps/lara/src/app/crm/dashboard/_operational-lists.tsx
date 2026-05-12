/**
 * OperationalLists · server component · 4 cards laterais com listas operacionais:
 *   - Próximos appointments (10)
 *   - Leads sem agendamento (10)
 *   - Recovery atrasados (10)
 *   - Orçamentos recentes (10)
 *
 * Read-only · links navegacionais · sem botões de envio.
 */

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import type { CrmDashboardOperationalLists } from '@clinicai/repositories'

interface Props {
  lists: CrmDashboardOperationalLists
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  aguardando_confirmacao: 'Aguard. confirmação',
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
}

const SOURCE_LABEL: Record<string, string> = {
  lead_lost: 'Lead perdido',
  appointment_cancelled: 'Cancelado',
  appointment_no_show: 'No-show',
  orcamento_frio: 'Orç. frio',
}

const ORCAMENTO_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  aprovado: 'Aprovado',
  fechado: 'Fechado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
}

export function OperationalLists({ lists }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Próximos agendamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {lists.upcomingAppointments.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">
              Nenhum agendamento futuro no período.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]/40">
              {lists.upcomingAppointments.map((a) => (
                <li key={a.id} className="py-2 text-xs">
                  <Link href={`/crm/agenda/${a.id}`} className="block hover:underline">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{a.subjectName ?? 'Sem nome'}</span>
                      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                        {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {a.scheduledDate} · {a.startTime.slice(0, 5)}
                      {a.professionalName ? ` · ${a.professionalName}` : ''}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads sem agendamento (phase=lead)</CardTitle>
        </CardHeader>
        <CardContent>
          {lists.leadsWithoutAppointment.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">
              Todos leads ativos têm agendamento.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]/40">
              {lists.leadsWithoutAppointment.map((l) => (
                <li key={l.id} className="py-2 text-xs">
                  <Link href={`/crm/leads/${l.id}`} className="block hover:underline">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{l.name}</span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {l.phone ?? '—'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      Atualizado {new Date(l.updatedAt).toLocaleDateString('pt-BR')}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recuperação atrasada</CardTitle>
        </CardHeader>
        <CardContent>
          {lists.recoveryOverdue.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">
              Nenhum item de recuperação com prazo vencido.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]/40">
              {lists.recoveryOverdue.map((r, i) => (
                <li key={r.workflowId ?? `${i}`} className="py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{r.displayName ?? 'Sem nome'}</span>
                    <span className="text-[10px] uppercase tracking-widest text-[var(--destructive)] font-semibold">
                      Atrasado
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {SOURCE_LABEL[r.sourceType] ?? r.sourceType} · {r.stage} · {r.priority}
                    {r.nextActionAt ? ` · ${new Date(r.nextActionAt).toLocaleString('pt-BR')}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 text-right">
            <Link
              href="/crm/recuperacao?overdue=1"
              className="text-[10px] uppercase tracking-widest text-[var(--primary)] hover:underline"
            >
              Ver todos →
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orçamentos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {lists.recentOrcamentos.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">
              Nenhum orçamento recente.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]/40">
              {lists.recentOrcamentos.map((o) => (
                <li key={o.id} className="py-2 text-xs">
                  <Link href={`/crm/orcamentos/${o.id}`} className="block hover:underline">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        {o.total != null ? BRL.format(o.total) : '—'}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                        {ORCAMENTO_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
