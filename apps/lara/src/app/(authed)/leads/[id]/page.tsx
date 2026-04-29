/**
 * /leads/[id] · detalhes do lead · Server Component.
 *
 * Carrega lead + tabs (info/conversa/historico/tags/acoes) em paralelo.
 * Permission gate: `patients:view` redireciona pra /dashboard se faltar.
 *
 * Dados pre-carregados:
 *   - lead (LeadRepository.getById)
 *   - phase_history (PhaseHistoryRepository.listByLead) · timeline
 *   - orcamentos (OrcamentoRepository.listBySubject) · em aberto
 *   - appointments associados (AppointmentRepository com filter por leadId)
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import type {
  AppointmentDTO,
  LeadDTO,
  OrcamentoDTO,
  PhaseHistoryDTO,
} from '@clinicai/repositories'
import { loadServerReposContext } from '@/lib/repos'
import { can } from '@/lib/permissions'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
import { LeadDetailClient } from './LeadDetailClient'

export const dynamic = 'force-dynamic'

interface PageData {
  lead: LeadDTO | null
  history: PhaseHistoryDTO[]
  orcamentos: OrcamentoDTO[]
  appointments: AppointmentDTO[]
  canEdit: boolean
  canDelete: boolean
}

async function loadData(id: string): Promise<PageData> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const role = ctx.role ?? null

    if (!can(role, 'patients:view')) {
      return {
        lead: null,
        history: [],
        orcamentos: [],
        appointments: [],
        canEdit: false,
        canDelete: false,
      }
    }

    const lead = await repos.leads.getById(id, { includeDeleted: true })
    if (!lead || lead.clinicId !== ctx.clinic_id) {
      return {
        lead: null,
        history: [],
        orcamentos: [],
        appointments: [],
        canEdit: false,
        canDelete: false,
      }
    }

    // Carregamentos paralelos · cada catch isolado pra UI nao quebrar
    // se uma das listas falhar.
    const [history, orcamentos, appointments] = await Promise.all([
      repos.phaseHistory.listByLead(id, { limit: 100 }).catch((e) => {
        console.warn('[/leads/[id]] phase_history failed:', (e as Error).message)
        return [] as PhaseHistoryDTO[]
      }),
      repos.orcamentos
        .listBySubject(ctx.clinic_id, { leadId: id }, { limit: 50 })
        .catch((e) => {
          console.warn('[/leads/[id]] orcamentos failed:', (e as Error).message)
          return [] as OrcamentoDTO[]
        }),
      // Appointment repo nao tem listByLead direto, vamos pegar listBySubject
      // se existir, senao vazio · ja existe e segue padrao igual
      (async () => {
        try {
          const apptRepo = repos.appointments as unknown as {
            listBySubject?: (
              cid: string,
              s: { leadId?: string | null; patientId?: string | null },
              opts?: { limit?: number },
            ) => Promise<AppointmentDTO[]>
          }
          if (typeof apptRepo.listBySubject === 'function') {
            return await apptRepo.listBySubject(ctx.clinic_id, { leadId: id }, { limit: 50 })
          }
          return [] as AppointmentDTO[]
        } catch (e) {
          console.warn('[/leads/[id]] appointments failed:', (e as Error).message)
          return [] as AppointmentDTO[]
        }
      })(),
    ])

    return {
      lead,
      history,
      orcamentos,
      appointments,
      canEdit: can(role, 'patients:edit'),
      canDelete: can(role, 'patients:delete'),
    }
  } catch (e) {
    console.error('[/leads/[id]] loadData failed:', (e as Error).message)
    return {
      lead: null,
      history: [],
      orcamentos: [],
      appointments: [],
      canEdit: false,
      canDelete: false,
    }
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await loadData(id)

  if (!data.lead && !data.canEdit && !data.canDelete) {
    // Sem permissao OU lead nao existe na clinic.
    // Distinguir requer outra query · simplificamos usando redirect.
    const { ctx } = await loadServerReposContext().catch(() => ({ ctx: null as { role?: string } | null }))
    if (!ctx?.role || !can(ctx.role, 'patients:view')) {
      redirect('/dashboard')
    }
    notFound()
  }
  if (!data.lead) notFound()

  const leadName = data.lead.name?.trim() || 'sem nome'
  const phoneTxt = data.lead.phone || ''
  const emailTxt = data.lead.email || ''
  const ledeBits = [phoneTxt, emailTxt].filter(Boolean).join(' · ')

  return (
    <PageContainer variant="narrow">
      <PageHero
        kicker="Lead · detalhes"
        title={<><em>{leadName}</em></>}
        lede={ledeBits || undefined}
        actions={
          <>
            <Link
              href="/leads"
              className="b2b-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={14} />
              Voltar
            </Link>
            <Link
              href={`/conversas?lead=${data.lead.id}`}
              className="b2b-btn b2b-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <MessageSquare size={14} />
              Abrir conversa
            </Link>
          </>
        }
      />

      <LeadDetailClient
        lead={data.lead}
        history={data.history}
        orcamentos={data.orcamentos}
        appointments={data.appointments}
        canEdit={data.canEdit}
        canDelete={data.canDelete}
      />
    </PageContainer>
  )
}
