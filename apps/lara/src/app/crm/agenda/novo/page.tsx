/**
 * /crm/agenda/novo · novo agendamento.
 *
 * Pre-fill via URL params:
 *   - ?date=YYYY-MM-DD&time=HH:MM (vem do calendario quando user clica num slot)
 *   - ?patientId=UUID (continua suportado · paciente existente)
 *   - ?leadId=UUID (CRM_PHASE_2AUX.2 · agendar diretamente para lead ativo)
 *
 * Wizard rich em 4 passos (paciente/lead → tempo+profissional → detalhes → revisão).
 * Profissional é FK first-class (CRM_PHASE_2AUX.2) · carregado de
 * `professional_profiles` com agenda_enabled=true.
 *
 * Diferido pra 8b: Multi-procedimento · Multi-pagamento (parcelas) · Smart-pick.
 */

import { PageHeader } from '@clinicai/ui'
import { loadServerReposContext } from '@/lib/repos'
import { NewAppointmentForm } from './_form'

export const dynamic = 'force-dynamic'

interface PageSearch {
  date?: string
  time?: string
  patientId?: string
  leadId?: string
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

  // CRM_PHASE_2AUX.2 · Pre-load profissionais com agenda habilitada
  const professionals = await repos.professionalProfiles
    .listActiveForAgenda(ctx.clinic_id)
    .catch(() => [])

  // CRM_PHASE_2AUX.2 · Pre-load leads ativos (phase ∈ lead/agendado · lifecycle=ativo)
  // limitado a 50 mais recentes pra evitar dropdown gigante.
  const leadsList = await repos.leads
    .list(
      ctx.clinic_id,
      { phases: ['lead', 'agendado'], lifecycleStatus: 'ativo' },
      { limit: 50 },
    )
    .catch(() => ({ rows: [], total: 0 }))
  const leads = leadsList.rows ?? []

  // CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · catálogo ativo (B1 · snapshot legado)
  const procedures = await repos.procedureAdmin
    .list({ status: 'active' })
    .catch(() => [])

  // Pre-fill patient OU lead (XOR)
  const preFilledPatient = sp.patientId
    ? patients.find((p) => p.id === sp.patientId) ?? null
    : null
  const preFilledLead = sp.leadId
    ? leads.find((l) => l.id === sp.leadId) ?? null
    : null

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo agendamento"
        description="Lead ativo OU paciente existente · profissional FK · conflito automático"
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
        leads={leads.map((l) => ({
          id: l.id,
          name: l.name ?? 'Sem nome',
          phone: l.phone ?? '',
        }))}
        professionals={professionals.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          specialty: p.specialty,
          color: p.color,
        }))}
        procedures={procedures.map((p) => ({
          id: p.id,
          nome: p.nome,
          categoria: p.categoria,
          preco: p.preco,
          precoPromo: p.precoPromo,
          duracaoMin: p.duracaoMin,
        }))}
        prefillDate={sp.date ?? null}
        prefillTime={sp.time ?? null}
        prefillPatient={
          preFilledPatient
            ? { id: preFilledPatient.id, name: preFilledPatient.name, phone: preFilledPatient.phone }
            : null
        }
        prefillLead={
          preFilledLead
            ? { id: preFilledLead.id, name: preFilledLead.name ?? 'Sem nome', phone: preFilledLead.phone ?? '' }
            : null
        }
      />
    </div>
  )
}
