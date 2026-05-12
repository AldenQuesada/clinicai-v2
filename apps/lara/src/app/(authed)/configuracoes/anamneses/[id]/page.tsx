/**
 * /configuracoes/anamneses/[id] · preview read-only do template.
 *
 * Carrega o template + sessões + perguntas + opções via repository (queries
 * já enforced via RLS multi-tenant) e renderiza um preview estático parecido
 * com o que paciente/secretaria verá no formulário real.
 *
 * SEM submeter resposta. SEM disparar automação. SEM tocar hard gate clínico.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, Card, CardContent, Button } from '@clinicai/ui'
import { ArrowLeft } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { AnamnesisTemplatePreview } from './_preview'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Geral',
  facial: 'Facial',
  body: 'Corporal',
  capillary: 'Capilar',
  epilation: 'Depilação',
  custom: 'Customizado',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AnamnesisTemplateDetailPage({
  params,
}: PageProps) {
  const { id } = await params
  const { repos } = await loadServerReposContext()

  const template = await repos.anamnesisTemplates
    .getByIdWithStructure(id)
    .catch(() => null)
  if (!template) notFound()

  const totalFields = template.sessions.reduce(
    (acc, s) => acc + s.fields.length,
    0,
  )
  const requiredFields = template.sessions.reduce(
    (acc, s) => acc + s.fields.filter((f) => f.isRequired).length,
    0,
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        title={template.name}
        description={
          template.description ||
          `${CATEGORY_LABELS[template.category] ?? template.category} · ${template.sessions.length} seção(ões) · ${totalFields} pergunta(s)${requiredFields ? ` · ${requiredFields} obrigatória(s)` : ''}`
        }
        breadcrumb={[
          { label: 'Configurações', href: '/configuracoes' },
          { label: 'Anamneses', href: '/configuracoes/anamneses' },
          { label: template.name },
        ]}
        actions={
          <Link href="/configuracoes/anamneses">
            <Button size="sm" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      {/* Metadados */}
      <Card className="mt-4">
        <CardContent className="grid grid-cols-2 gap-4 py-4 text-xs md:grid-cols-4">
          <MetaItem label="Categoria" value={CATEGORY_LABELS[template.category] ?? template.category} />
          <MetaItem label="Status" value={template.isActive ? 'Ativo' : 'Inativo'} />
          <MetaItem label="Versão" value={`v${template.version}`} />
          <MetaItem
            label="Sinalizadores"
            value={
              [
                template.isDefault ? 'Padrão' : null,
                template.isPreAppointmentForm ? 'Pré-consulta' : null,
                template.hasGeneralSession ? 'Geral incluída' : null,
              ]
                .filter(Boolean)
                .join(' · ') || '—'
            }
          />
        </CardContent>
      </Card>

      <p className="mt-4 rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
        Preview somente leitura · nenhuma resposta é gravada. Edição de seções,
        perguntas e opções vive em fase futura (admin avançado · usará RPCs
        canônicas já existentes).
      </p>

      <div className="mt-4">
        <AnamnesisTemplatePreview template={template} />
      </div>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  )
}
