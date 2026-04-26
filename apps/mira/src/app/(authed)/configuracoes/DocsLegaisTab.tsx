/**
 * Tab Documentos legais · CRUD de templates reutilizaveis.
 *
 * Lista templates ativos + arquivados separadamente · botao "Novo template"
 * abre modal luxury com:
 *   - Nome + slug (slug auto-gerado se vazio)
 *   - Tipo (uso_imagem | procedimento | anestesia | lgpd | contrato | custom)
 *   - Variaveis (chips · lista de {{chaves}} permitidas no merge)
 *   - Conteudo (textarea grande · Markdown/HTML simples)
 *   - Preview lado a lado (rendered com sample data)
 *
 * Restrito a owner/admin (assertCanManage no action).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { DocsLegaisClient } from './DocsLegaisClient'

export async function DocsLegaisTab() {
  const { repos } = await loadMiraServerContext()
  const all = await repos.legalDocTemplates.list().catch(() => [])

  return (
    <DocsLegaisClient
      templates={all.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        docType: t.docType,
        content: t.content,
        variables: t.variables,
        version: t.version,
        isActive: t.isActive,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))}
    />
  )
}
