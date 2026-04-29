/**
 * /crm/pacientes/novo · cadastro avulso de paciente.
 *
 * Modelo excludente forte (ADR-001): cria LEAD via lead_create RPC com
 * dados clinicos pre-preenchidos. Promocao real pra paciente acontece
 * via lead_to_paciente RPC quando compareceu.
 *
 * Espelha legacy clinic-dashboard "Novo Paciente" modal wizard 3-step.
 * Optei por page (nao modal) · mais robusto pra mobile e direta-link.
 */

import { PageHeader } from '@clinicai/ui'
import { NewPatientForm } from './_form'

export const dynamic = 'force-dynamic'

export default function NewPatientPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo paciente"
        description="Cadastro completo · cria LEAD que vira paciente quando compareceu na clínica"
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Pacientes', href: '/crm/pacientes' },
          { label: 'Novo' },
        ]}
      />
      <NewPatientForm />
    </div>
  )
}
