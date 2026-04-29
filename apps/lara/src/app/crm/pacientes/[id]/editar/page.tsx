/**
 * /crm/pacientes/[id]/editar · form de edicao do paciente.
 *
 * RSC busca paciente · client form chama updatePatientAction (Camada 5).
 * Campos editaveis: name, phone, email, cpf, rg, birthDate, sex,
 * addressJson, status, assignedTo, notes.
 *
 * Agregados financeiros (totalRevenue, totalProcedures, first/lastProcedureAt)
 * NAO sao editaveis aqui · sao denormalizados via appointment_finalize RPC
 * (ou helper addPatientRevenueAction internamente).
 */

import { notFound } from 'next/navigation'
import { PageHeader } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { EditPatientForm } from './_form'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditPatientPage({ params }: PageProps) {
  const { id } = await params
  const { repos } = await loadServerReposContext()
  const patient = await repos.patients.getById(id)

  if (!patient) notFound()

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Editar ${patient.name}`}
        description="Campos editáveis · agregados financeiros são atualizados via finalize de consulta"
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Pacientes', href: '/crm/pacientes' },
          { label: patient.name, href: `/crm/pacientes/${patient.id}` },
          { label: 'Editar' },
        ]}
      />
      <EditPatientForm patient={patient} />
    </div>
  )
}
