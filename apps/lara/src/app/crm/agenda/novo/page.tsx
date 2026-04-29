/**
 * /crm/agenda/novo · novo agendamento.
 *
 * Pre-fill via URL params: ?date=YYYY-MM-DD&time=HH:MM (vem do calendario
 * quando user clica num slot).
 *
 * Camada 8a: form basico cobrindo CORE legacy (paciente search, prof,
 * data/horario, procedimento, valor, status, origem). Diferido pra 8b:
 *   - Recurrence wizard
 *   - Multi-procedimento
 *   - Multi-pagamento (parcelas)
 *   - Smart-pick de slots disponiveis
 */

import { PageHeader } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { NewAppointmentForm } from './_form'

export const dynamic = 'force-dynamic'

interface PageSearch {
  date?: string
  time?: string
  patientId?: string
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const { ctx, repos } = await loadServerReposContext()

  // Pre-load patients ativos (limit 100 · search server-side se passar)
  const patients = await repos.patients
    .list(ctx.clinic_id, { status: 'active', limit: 100, sort: 'name', sortDir: 'asc' })
    .catch(() => [])

  // Pre-fill patient se vier por URL
  const preFilled = sp.patientId
    ? patients.find((p) => p.id === sp.patientId) ?? null
    : null

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo agendamento"
        description="Lead ativo OU paciente existente · validações de conflito automáticas"
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Agenda', href: '/crm/agenda' },
          { label: 'Novo' },
        ]}
      />
      <NewAppointmentForm
        patients={patients.map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
        }))}
        prefillDate={sp.date ?? null}
        prefillTime={sp.time ?? null}
        prefillPatient={
          preFilled
            ? { id: preFilled.id, name: preFilled.name, phone: preFilled.phone }
            : null
        }
      />
    </div>
  )
}
