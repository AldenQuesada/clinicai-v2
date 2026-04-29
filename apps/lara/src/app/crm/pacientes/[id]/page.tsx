/**
 * /crm/pacientes/[id] · detalhe read-only de 1 paciente.
 *
 * Cards: identidade, contato, endereço, agregados financeiros, source/origem.
 *
 * Histórico de appointments + orcamentos + phase_history → deferidos pra
 * Camadas 8/9 (modulo Agenda + Orcamento) que vao expor essas listas.
 *
 * Edit via link pra /editar · Soft-delete via SoftDeleteButton (admin only).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  PageHeader,
  Button,
} from '@clinicai/ui'
import { Pencil, Phone, Mail, CalendarClock } from 'lucide-react'
import { sexLabel, formatPhoneBR } from '@clinicai/utils'
import { loadServerReposContext } from '@/lib/repos'
import { SoftDeleteButton } from '../_components/soft-delete-button'
import type { AppointmentDTO, AppointmentStatus } from '@clinicai/repositories'

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

interface AppointmentStats {
  total: number
  finalizado: number
  cancelado: number
  noShow: number
  outros: number
  last: AppointmentDTO | null
  next: AppointmentDTO | null
}

/**
 * Resume os appointments do paciente em counts + last/next. Usado pelo card
 * stub "Histórico de atendimentos" (Camada 7.5). Lista detalhada vem na
 * Camada 8 (modulo Agenda).
 *
 * `last`: appointment com status finalizado mais recente (ou qualquer mais
 *   recente se nao houver finalizado).
 * `next`: proximo agendamento futuro com status nao-cancelado/no_show.
 */
function summarizeAppointments(rows: AppointmentDTO[]): AppointmentStats {
  let finalizado = 0
  let cancelado = 0
  let noShow = 0
  let outros = 0
  let last: AppointmentDTO | null = null
  let next: AppointmentDTO | null = null

  // ISO date YYYY-MM-DD do hoje · scheduledDate vem como YYYY-MM-DD.
  const todayIso = new Date().toISOString().slice(0, 10)

  // Tipos de status que excluem do "next"
  const dropNextStatuses: AppointmentStatus[] = [
    'cancelado',
    'no_show',
    'finalizado',
    'remarcado',
  ]

  for (const a of rows) {
    if (a.status === 'finalizado') finalizado++
    else if (a.status === 'cancelado') cancelado++
    else if (a.status === 'no_show') noShow++
    else outros++

    // Last: scheduledDate mais recente entre os "passados ou de hoje".
    // Comparacao lexicografica funciona em ISO date.
    if (a.scheduledDate <= todayIso) {
      if (!last || a.scheduledDate > last.scheduledDate) last = a
    }

    // Next: scheduledDate futura · status que ainda valem como "agenda".
    if (
      a.scheduledDate > todayIso &&
      !dropNextStatuses.includes(a.status)
    ) {
      if (!next || a.scheduledDate < next.scheduledDate) next = a
    }
  }

  return {
    total: rows.length,
    finalizado,
    cancelado,
    noShow,
    outros,
    last,
    next,
  }
}

export default async function PatientDetailPage({ params }: PageProps) {
  const { id } = await params
  const { ctx, repos } = await loadServerReposContext()
  const patient = await repos.patients.getById(id)

  if (!patient) notFound()

  const address = (patient.addressJson ?? null) as Record<string, string> | null
  const sourceMeta = patient.sourceLeadMeta ?? {}

  // Camada 7.5 · histórico de appointments stub. Limit 100 (mesmo da Camada 8
  // futura). Catch silencioso se RLS/falha temporaria · card mostra "Sem
  // dados" em vez de quebrar a pagina inteira.
  const appointments = await repos.appointments
    .listBySubject(ctx.clinic_id, { patientId: patient.id }, { limit: 100 })
    .catch(() => [] as AppointmentDTO[])

  const apptStats = summarizeAppointments(appointments)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={patient.name}
        description={`ID ${patient.id.slice(0, 8)}… · Status ${patient.status}`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Pacientes', href: '/crm/pacientes' },
          { label: patient.name },
        ]}
        actions={
          <>
            <Link href={`/crm/pacientes/${patient.id}/editar`}>
              <Button size="sm" variant="outline">
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </Link>
            <SoftDeleteButton
              patientId={patient.id}
              patientName={patient.name}
              role={ctx.role}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Identidade */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Identidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Nome completo" value={patient.name} />
            <Field
              label="CPF"
              value={
                patient.cpf
                  ? `${patient.cpf.slice(0, 3)}.${patient.cpf.slice(3, 6)}.${patient.cpf.slice(6, 9)}-${patient.cpf.slice(9)}`
                  : '—'
              }
            />
            <Field label="RG" value={patient.rg ?? '—'} />
            <Field label="Sexo" value={sexLabel(patient.sex)} />
            <Field label="Nascimento" value={fmtDate(patient.birthDate)} />
            <Field label="Notas internas" value={patient.notes ?? '—'} />
          </CardContent>
        </Card>

        {/* Contato */}
        <Card>
          <CardHeader>
            <CardTitle>Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 h-3 w-3 text-[var(--muted-foreground)]" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                  Telefone
                </div>
                <div className="text-[var(--foreground)]">
                  {formatPhoneBR(patient.phone) || patient.phone}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-3 w-3 text-[var(--muted-foreground)]" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                  Email
                </div>
                <div className="break-all text-[var(--foreground)]">
                  {patient.email ?? '—'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agregados financeiros */}
        <Card>
          <CardHeader>
            <CardTitle>Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field
              label="Receita acumulada"
              value={BRL.format(patient.totalRevenue)}
            />
            <Field
              label="Procedimentos"
              value={String(patient.totalProcedures)}
            />
            <Field
              label="Ticket médio"
              value={
                patient.totalProcedures > 0
                  ? BRL.format(patient.totalRevenue / patient.totalProcedures)
                  : '—'
              }
            />
            <Field
              label="Primeiro atendimento"
              value={fmtDate(patient.firstProcedureAt)}
            />
            <Field
              label="Último atendimento"
              value={fmtDate(patient.lastProcedureAt)}
            />
          </CardContent>
        </Card>

        {/* Endereço */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {address ? (
              <div className="space-y-1">
                {address.rua && (
                  <div className="text-[var(--foreground)]">
                    {address.rua}
                    {address.numero ? `, ${address.numero}` : ''}
                    {address.complemento ? ` · ${address.complemento}` : ''}
                  </div>
                )}
                {(address.bairro || address.cidade || address.uf) && (
                  <div className="text-[var(--muted-foreground)]">
                    {[address.bairro, address.cidade, address.uf]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                {address.cep && (
                  <div className="text-xs text-[var(--muted-foreground)]/70">
                    CEP {address.cep}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[var(--muted-foreground)]">Sem endereço cadastrado</p>
            )}
          </CardContent>
        </Card>

        {/* Histórico de atendimentos · stub Camada 7.5 · lista detalhada vem
            na Camada 8 (modulo Agenda). Card mostra agregados reais lendo
            appointments.listBySubject. */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[var(--primary)]" />
                Histórico de atendimentos
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {apptStats.total === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhum atendimento registrado ainda.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2 text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                    Resumo
                  </div>
                  <div className="text-2xl font-display-italic text-[var(--foreground)]">
                    {apptStats.total}
                  </div>
                  <div className="space-y-1 text-xs text-[var(--muted-foreground)]">
                    <div>
                      Finalizados:{' '}
                      <strong className="text-emerald-400">
                        {apptStats.finalizado}
                      </strong>
                    </div>
                    <div>
                      Cancelados:{' '}
                      <strong className="text-rose-400">
                        {apptStats.cancelado}
                      </strong>
                    </div>
                    <div>
                      Não compareceu:{' '}
                      <strong className="text-rose-400">
                        {apptStats.noShow}
                      </strong>
                    </div>
                    {apptStats.outros > 0 && (
                      <div>
                        Em andamento/outros:{' '}
                        <strong className="text-[var(--foreground)]">
                          {apptStats.outros}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                    Último atendimento
                  </div>
                  {apptStats.last ? (
                    <div>
                      <div className="text-[var(--foreground)]">
                        {fmtDate(apptStats.last.scheduledDate)}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {apptStats.last.procedureName || '—'}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]/70">
                        {apptStats.last.status}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Sem atendimentos passados.
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                    Próximo agendamento
                  </div>
                  {apptStats.next ? (
                    <div>
                      <div className="text-[var(--foreground)]">
                        {fmtDate(apptStats.next.scheduledDate)}
                        {apptStats.next.startTime
                          ? ` · ${apptStats.next.startTime.slice(0, 5)}`
                          : ''}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {apptStats.next.procedureName || '—'}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-amber-400">
                        {apptStats.next.status}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Nenhum agendamento futuro.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
              {/* CTA · /crm/agenda nao existe ainda · render disabled pill com
                  tooltip ate Camada 8. */}
              <span
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] opacity-60"
                title="Disponível na Camada 8 · Módulo Agenda"
                aria-disabled="true"
              >
                <CalendarClock className="h-3 w-3" />
                Ver agenda completa
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]/60">
                Lista detalhada chega na Camada 8 (Agenda).
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Origem */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Origem do paciente</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Field
              label="Phase no momento"
              value={(sourceMeta.source as string) ?? '—'}
            />
            <Field
              label="Funnel"
              value={(sourceMeta.funnel as string) ?? '—'}
            />
            <Field
              label="Temperature"
              value={(sourceMeta.temperature as string) ?? '—'}
            />
            <Field
              label="Promovido em"
              value={fmtDateTime(patient.sourceLeadPhaseAt)}
            />
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-[10px] text-[var(--muted-foreground)]/60">
        Lista detalhada de appointments + orçamentos + timeline phase chegam
        nas Camadas 8 (Agenda) + 9 (Orçamento) + 10 (timeline integrada).
      </p>
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
