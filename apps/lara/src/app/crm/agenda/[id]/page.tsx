/**
 * /crm/agenda/[id] · detalhe do appointment + acoes (state machine).
 *
 * Card com info completa + dropdown de change status + botao "Marcar
 * chegada" (RPC attend) + botao "Finalizar consulta" (wizard 3 outcomes).
 *
 * Soft-delete admin only (mesmo padrao Pacientes).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  AppointmentStatusBadge,
  Button,
} from '@clinicai/ui'
import { ArrowLeft, Pencil } from 'lucide-react'
import {
  APPOINTMENT_STATE_MACHINE,
  APPOINTMENT_STATUS_LABELS,
  isTerminalStatus,
} from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { AppointmentActions } from './_actions-bar'

export const dynamic = 'force-dynamic'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AppointmentDetailPage({ params }: PageProps) {
  const { id } = await params
  const { ctx, repos } = await loadServerReposContext()
  const appt = await repos.appointments.getById(id)

  if (!appt) notFound()

  // Subject (lead OR patient · modelo excludente)
  const patient = appt.patientId
    ? await repos.patients.getById(appt.patientId).catch(() => null)
    : null
  const lead = appt.leadId
    ? await repos.leads.getById(appt.leadId).catch(() => null)
    : null

  const subjectHref = patient
    ? `/crm/pacientes/${patient.id}`
    : lead
      ? `/crm/leads/${lead.id}`
      : null

  const allowedTransitions = APPOINTMENT_STATE_MACHINE[appt.status] ?? []
  const canAttend =
    !isTerminalStatus(appt.status) &&
    allowedTransitions.length > 0 &&
    !['na_clinica', 'em_consulta', 'em_atendimento', 'finalizado'].includes(
      appt.status,
    )
  const canFinalize = ['na_clinica', 'em_consulta', 'em_atendimento'].includes(
    appt.status,
  )

  // Status candidates pra dropdown · apenas transicoes "leves"
  // (na_clinica + finalizado tem RPC dedicada · attend/finalize)
  const lightTransitions = allowedTransitions.filter(
    (s: string) =>
      s !== appt.status && s !== 'na_clinica' && s !== 'finalizado',
  )

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Agendamento · ${appt.scheduledDate} ${appt.startTime.slice(0, 5)}`}
        description={`${APPOINTMENT_STATUS_LABELS[appt.status]} · ID ${appt.id.slice(0, 8)}…`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Agenda', href: '/crm/agenda' },
          { label: `${appt.scheduledDate} ${appt.startTime.slice(0, 5)}` },
        ]}
        actions={
          <Link href="/crm/agenda">
            <Button size="sm" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Status + acoes */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <AppointmentStatusBadge status={appt.status} />
            <AppointmentActions
              appointmentId={appt.id}
              currentStatus={appt.status}
              hasLead={!!appt.leadId}
              role={ctx.role}
              lightTransitions={lightTransitions}
              canAttend={canAttend}
              canFinalize={canFinalize}
              isTerminal={isTerminalStatus(appt.status)}
            />
          </CardContent>
        </Card>

        {/* Subject */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Subject</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field
              label="Nome"
              value={
                subjectHref ? (
                  <Link
                    href={subjectHref}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {appt.subjectName || '—'}
                  </Link>
                ) : (
                  appt.subjectName || '—'
                )
              }
            />
            <Field label="Telefone" value={appt.subjectPhone ?? '—'} />
            <Field
              label="Tipo"
              value={
                patient
                  ? 'Paciente'
                  : lead
                    ? 'Lead'
                    : appt.status === 'bloqueado'
                      ? 'Block time'
                      : '—'
              }
            />
          </CardContent>
        </Card>

        {/* Tempo + Profissional */}
        <Card>
          <CardHeader>
            <CardTitle>Quando</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Data" value={fmtDate(appt.scheduledDate)} />
            <Field
              label="Horário"
              value={`${appt.startTime.slice(0, 5)} – ${appt.endTime.slice(0, 5)}`}
            />
            <Field label="Profissional" value={appt.professionalName || '—'} />
          </CardContent>
        </Card>

        {/* Procedimento + Financeiro */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Procedimento</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Nome" value={appt.procedureName || '—'} />
            <Field label="Tipo consulta" value={appt.consultType ?? '—'} />
            <Field label="Tipo avaliação" value={appt.evalType ?? '—'} />
            <Field label="Origem" value={appt.origem ?? '—'} />
            <Field label="Valor" value={BRL.format(appt.value)} />
            <Field label="Status pagamento" value={appt.paymentStatus} />
            <Field label="Forma pagamento" value={appt.paymentMethod ?? '—'} />
            <Field
              label="Consentimento img"
              value={appt.consentimentoImg}
            />
          </CardContent>
        </Card>

        {/* Observações */}
        {appt.obs && (
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-[var(--foreground)]">
                {appt.obs}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Eventos · audit */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Field label="Criado em" value={fmtDateTime(appt.createdAt)} />
            <Field label="Atualizado em" value={fmtDateTime(appt.updatedAt)} />
            {appt.chegadaEm && (
              <Field label="Chegada" value={fmtDateTime(appt.chegadaEm)} />
            )}
            {appt.canceladoEm && (
              <>
                <Field
                  label="Cancelado em"
                  value={fmtDateTime(appt.canceladoEm)}
                />
                <Field
                  label="Motivo cancel."
                  value={appt.motivoCancelamento ?? '—'}
                />
              </>
            )}
            {appt.noShowEm && (
              <>
                <Field label="No-show em" value={fmtDateTime(appt.noShowEm)} />
                <Field
                  label="Motivo no-show"
                  value={appt.motivoNoShow ?? '—'}
                />
              </>
            )}
            {appt.recurrenceGroupId && (
              <Field
                label="Recorrência"
                value={`${appt.recurrenceIndex}/${appt.recurrenceTotal} · ${appt.recurrenceIntervalDays}d`}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="text-[var(--foreground)]">{value}</div>
    </div>
  )
}
