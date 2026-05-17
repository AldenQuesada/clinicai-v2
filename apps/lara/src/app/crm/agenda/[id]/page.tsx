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
  getAppointmentActionFlags,
} from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { AppointmentActions } from './_actions-bar'
import { ClinicalPanel, type ClinicalGateData } from './_clinical-panel'

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
  const actionFlags = getAppointmentActionFlags(appt.status)

  // CRM_PHASE_2AUX.3 · botão "Editar agendamento" só aparece se status
  // editável. Espelho de NOT_EDITABLE_STATUSES da rota /editar.
  const canEditAppointment = !(
    appt.status === 'finalizado' ||
    appt.status === 'cancelado' ||
    appt.status === 'no_show' ||
    appt.status === 'remarcado'
  )

  // CRM_PHASE_2J.1 · "Marcar como perdido" só faz sentido quando há lead
  // comercialmente ativo (lifecycle=ativo) que ainda não virou paciente E o
  // appointment não está em estado terminal clínico.
  const canMarkLeadLost = Boolean(
    lead &&
      lead.lifecycleStatus === 'ativo' &&
      lead.phase !== 'paciente' &&
      !actionFlags.isTerminal,
  )

  // CRM_PHASE_2I · estado clínico (anamnese + consent)
  const clinicalGate = await repos.appointments.getClinicalGateStatus(appt.id)
  const clinicalData: ClinicalGateData = clinicalGate.ok
    ? {
        anamnesis: {
          id: clinicalGate.anamnesis?.id ?? null,
          status: (clinicalGate.anamnesis?.status ?? 'none') as
            | 'none'
            | 'draft'
            | 'complete'
            | 'archived',
          completedAt: clinicalGate.anamnesis?.completedAt ?? null,
        },
        consent: {
          signed: clinicalGate.consent?.signed ?? false,
          rows: clinicalGate.consent?.rows ?? 0,
          legacyConsentimentoImg: clinicalGate.consent?.legacyConsentimentoImg ?? null,
        },
        gateStatus: clinicalGate.gateStatus ?? 'warning',
      }
    : {
        anamnesis: { id: null, status: 'none', completedAt: null },
        consent: { signed: false, rows: 0, legacyConsentimentoImg: null },
        gateStatus: 'warning',
      }

  // Status candidates pra dropdown · apenas transicoes "leves"
  // (na_clinica/em_atendimento/finalizado tem RPC dedicada ·
  // attend/startAttendance/finalize). em_atendimento eh disparado pelo
  // botao "Iniciar atendimento" especifico, nao pelo dropdown.
  const lightTransitions = allowedTransitions.filter(
    (s: string) =>
      s !== appt.status &&
      s !== 'na_clinica' &&
      s !== 'em_atendimento' &&
      s !== 'finalizado',
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
          <div className="flex gap-2">
            {canEditAppointment && (
              <Link href={`/crm/agenda/${appt.id}/editar`}>
                <Button size="sm" variant="outline">
                  <Pencil className="h-4 w-4" />
                  Editar agendamento
                </Button>
              </Link>
            )}
            <Link href="/crm/agenda">
              <Button size="sm" variant="ghost">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </Link>
          </div>
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
              leadId={appt.leadId}
              role={ctx.role}
              lightTransitions={lightTransitions}
              canAttend={actionFlags.canMarkArrived}
              canStartAttendance={actionFlags.canStartAttendance}
              canFinalize={actionFlags.canFinalize}
              isTerminal={actionFlags.isTerminal}
              clinicalGateStatus={clinicalData.gateStatus}
              anamnesisStatus={clinicalData.anamnesis.status}
              consentSigned={clinicalData.consent.signed}
              canMarkLeadLost={canMarkLeadLost}
              currentPaymentStatus={appt.paymentStatus}
            />
          </CardContent>
        </Card>

        {/* CRM_PHASE_2I · Clinical (anamnese + consent intra-consulta) */}
        <ClinicalPanel
          appointmentId={appt.id}
          initialData={clinicalData}
          defaultSignerName={appt.subjectName}
        />

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
            <CardTitle className="flex items-center gap-2">
              <span>Procedimento</span>
              {/* BLOCO 2.4 · badge cortesia · destaque visual pra secretária */}
              {appt.paymentStatus === 'cortesia' && (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Cortesia
                </span>
              )}
            </CardTitle>
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
