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
  PatientStatusBadge,
  Button,
} from '@clinicai/ui'
import { Pencil, Phone, Mail } from 'lucide-react'
import { sexLabel, formatPhoneBR } from '@clinicai/utils'
import { loadServerReposContext } from '@/lib/repos'
import { SoftDeleteButton } from '../_components/soft-delete-button'

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

export default async function PatientDetailPage({ params }: PageProps) {
  const { id } = await params
  const { ctx, repos } = await loadServerReposContext()
  const patient = await repos.patients.getById(id)

  if (!patient) notFound()

  const address = (patient.addressJson ?? null) as Record<string, string> | null
  const sourceMeta = patient.sourceLeadMeta ?? {}

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
        Histórico de appointments + orçamentos + timeline phase deferidos pras
        Camadas 8 (Agenda) + 9 (Orçamento) + 10 (timeline integrada).
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
