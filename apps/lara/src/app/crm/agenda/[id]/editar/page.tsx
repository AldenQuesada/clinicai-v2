/**
 * /crm/agenda/[id]/editar · CRM_PHASE_2AUX.3 · rota dedicada de edição.
 *
 * Reusa NewAppointmentForm em modo `editing` (prop). Carrega appointment
 * por id via SSR, monta initial values, bloqueia se status terminal
 * (finalizado/cancelado/no_show/remarcado).
 *
 * Submit usa updateAppointmentAction com defesa em profundidade:
 *  - terminal block server-side (action retorna `appointment_terminal`)
 *  - conflict check via checkConflicts antes do UPDATE
 *  - Zod refinements (duração, future date)
 *
 * Zero WhatsApp · zero provider · zero cron.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, Card, Button } from '@clinicai/ui'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { APPOINTMENT_STATUS_LABELS } from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { NewAppointmentForm } from '../../novo/_form'

export const dynamic = 'force-dynamic'

// CRM_PHASE_2AUX.3 · status que bloqueiam edição.
// Espelha TERMINAL_STATUSES_FOR_EDIT da action + acrescenta `remarcado`
// (operacional · após drag-drop o slot original já tem nova reserva).
const NOT_EDITABLE_STATUSES = new Set([
  'finalizado',
  'cancelado',
  'no_show',
  'remarcado',
])

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditAppointmentPage({ params }: PageProps) {
  const { id } = await params
  const { ctx, repos } = await loadServerReposContext()

  const appt = await repos.appointments.getById(id)
  if (!appt) notFound()

  // Status terminal · bloqueia edit (defesa em profundidade · server action
  // também rejeita com `appointment_terminal`)
  if (NOT_EDITABLE_STATUSES.has(appt.status)) {
    const statusLabel =
      APPOINTMENT_STATUS_LABELS[
        appt.status as keyof typeof APPOINTMENT_STATUS_LABELS
      ] ?? appt.status

    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Edição bloqueada"
          description="Este agendamento não pode mais ser editado."
          breadcrumb={[
            { label: 'CRM', href: '/crm' },
            { label: 'Agenda', href: '/crm/agenda' },
            { label: `${appt.scheduledDate} ${appt.startTime.slice(0, 5)}`, href: `/crm/agenda/${appt.id}` },
            { label: 'Editar' },
          ]}
          actions={
            <Link href={`/crm/agenda/${appt.id}`}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao agendamento
              </Button>
            </Link>
          }
        />
        <Card className="p-6">
          <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="space-y-2 text-sm">
              <p>
                <strong>Status atual:</strong> {statusLabel}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Agendamentos finalizados, cancelados, marcados como
                não-compareceu ou remarcados não podem ser editados pelo
                wizard. Para alterações administrativas, contate o admin
                da clínica.
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Histórico clínico e audit trail permanecem intactos no
                detalhe do agendamento.
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Pre-load patients ativos para o select (igual a /novo)
  const patients = await repos.patients
    .list(ctx.clinic_id, {
      status: 'active',
      limit: 100,
      sort: 'name',
      sortDir: 'asc',
    })
    .catch(() => [])

  // Resolve patient do appointment para pre-preencher (mesmo se select estará disabled)
  const currentPatient = appt.patientId
    ? patients.find((p) => p.id === appt.patientId) ??
      (await repos.patients.getById(appt.patientId).catch(() => null))
    : null

  // Garante que o paciente atual aparece na lista do select (mesmo se inativo)
  const patientsForForm = (() => {
    const list = patients.map((p) => ({ id: p.id, name: p.name, phone: p.phone }))
    if (currentPatient && !list.find((p) => p.id === currentPatient.id)) {
      list.unshift({
        id: currentPatient.id,
        name: currentPatient.name,
        phone: currentPatient.phone,
      })
    }
    return list
  })()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editar agendamento"
        description={`Wizard rich · validações operacionais + conflict check · ${APPOINTMENT_STATUS_LABELS[appt.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? appt.status}`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Agenda', href: '/crm/agenda' },
          { label: `${appt.scheduledDate} ${appt.startTime.slice(0, 5)}`, href: `/crm/agenda/${appt.id}` },
          { label: 'Editar' },
        ]}
        actions={
          <Link href={`/crm/agenda/${appt.id}`}>
            <Button size="sm" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao agendamento
            </Button>
          </Link>
        }
      />
      <NewAppointmentForm
        patients={patientsForForm}
        prefillDate={appt.scheduledDate}
        prefillTime={appt.startTime.slice(0, 5)}
        prefillPatient={
          currentPatient
            ? {
                id: currentPatient.id,
                name: currentPatient.name,
                phone: currentPatient.phone,
              }
            : null
        }
        editing={{
          appointmentId: appt.id,
          patientId: appt.patientId,
          professionalName: appt.professionalName ?? '',
          procedureName: appt.procedureName ?? '',
          consultType: appt.consultType ?? null,
          value: appt.value,
          status: appt.status,
          origem: appt.origem ?? null,
          obs: appt.obs ?? null,
        }}
      />
    </div>
  )
}
