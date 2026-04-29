/**
 * /crm/orcamentos/[id]/editar · edicao de items, validade, titulo e notas.
 *
 * Bloqueia edicao se status terminal (approved/lost) · usuario veria 410.
 * Pra status mid-flight (sent/viewed/etc) edicao eh permitida porque eh
 * comum ajustar items apos negociacao.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button, PageHeader } from '@clinicai/ui'
import { ArrowLeft } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { EditarOrcamentoForm } from './_form'

export const dynamic = 'force-dynamic'

export default async function EditarOrcamentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { repos } = await loadServerReposContext()
  const orcamento = await repos.orcamentos.getById(id).catch(() => null)
  if (!orcamento) notFound()

  // Bloqueio terminal · UX leva direto pro detalhe (read-only)
  if (orcamento.status === 'approved' || orcamento.status === 'lost') {
    redirect(`/crm/orcamentos/${id}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editar orçamento"
        description={orcamento.title ?? `#${orcamento.number ?? id.slice(0, 8)}`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Orçamentos', href: '/crm/orcamentos' },
          { label: orcamento.title ?? id.slice(0, 8), href: `/crm/orcamentos/${id}` },
          { label: 'Editar' },
        ]}
        actions={
          <Link href={`/crm/orcamentos/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      <EditarOrcamentoForm orcamento={orcamento} />
    </div>
  )
}
