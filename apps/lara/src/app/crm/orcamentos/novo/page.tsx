/**
 * /crm/orcamentos/novo · cria orcamento a partir de um lead.
 *
 * Querystring obrigatoria: ?leadId=<uuid>. Sem leadId, redireciona pra
 * /crm/leads com instrucao. Pra MVP nao incluimos lead picker inline ·
 * fluxo natural eh "Criar orcamento" no detalhe do lead.
 *
 * Pra orcamento de paciente existente: nao suportado v1 (modelo excludente
 * forte ADR-001 · paciente nasce de RPC, orcamento idem). Camada 10
 * vai abrir RPC patient_to_orcamento dedicada.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button, EmptyState, PageHeader } from '@clinicai/ui'
import { ArrowLeft } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { NovoOrcamentoForm } from './_form'

export const dynamic = 'force-dynamic'

interface PageSearch {
  leadId?: string
}

function defaultValidUntil(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export default async function NovoOrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<PageSearch>
}) {
  const sp = await searchParams
  const leadId = (sp.leadId ?? '').trim()

  if (!leadId) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Novo orçamento"
          breadcrumb={[
            { label: 'CRM', href: '/crm' },
            { label: 'Orçamentos', href: '/crm/orcamentos' },
            { label: 'Novo' },
          ]}
          actions={
            <Link href="/crm/orcamentos">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </Link>
          }
        />
        <EmptyState
          variant="generic"
          title="Selecione um lead pra criar orçamento"
          message='Vá em "Leads", abra o lead que receberá o orçamento e clique em "Criar orçamento".'
          action={{
            label: 'Ir para Leads',
            href: '/crm/leads',
          }}
        />
      </div>
    )
  }

  if (!/^[0-9a-f-]{36}$/i.test(leadId)) {
    redirect('/crm/orcamentos/novo')
  }

  const { repos } = await loadServerReposContext()
  const lead = await repos.leads.getById(leadId).catch(() => null)
  if (!lead) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo orçamento"
        description={`Para ${lead.name ?? 'lead sem nome'}`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Orçamentos', href: '/crm/orcamentos' },
          { label: 'Novo' },
        ]}
        actions={
          <Link href="/crm/orcamentos">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      <NovoOrcamentoForm
        leadId={lead.id}
        leadName={lead.name}
        leadPhone={lead.phone}
        defaultValidUntil={defaultValidUntil()}
      />
    </div>
  )
}
