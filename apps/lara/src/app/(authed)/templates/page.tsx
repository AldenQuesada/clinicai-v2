/**
 * Templates de resposta · Server Component.
 *
 * Port 1:1 do clinic-dashboard agenda-mensagens.js (timeline visual + 8 tipos
 * + day scheduling + active toggle + variables + iPhone preview).
 *
 * ADR-012 · TemplateRepository.listAll · render delegado pra TemplatesClient.
 * Multi-tenant ADR-028 · clinic_id resolvido via JWT.
 */

import { loadServerReposContext } from '@/lib/repos'
import type { TemplateDTO } from '@clinicai/repositories'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
import { TemplatesClient } from './TemplatesClient'

export const dynamic = 'force-dynamic'

async function loadTemplates(): Promise<{ templates: TemplateDTO[]; canManage: boolean }> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const dtos = await repos.templates.listAll(ctx.clinic_id)
    const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
    return { templates: dtos, canManage }
  } catch (e) {
    console.error('[/templates] loadTemplates failed:', (e as Error).message, (e as Error).stack)
    return { templates: [], canManage: false }
  }
}

export default async function TemplatesPage() {
  const { templates, canManage } = await loadTemplates()

  return (
    <PageContainer variant="wide">
      <PageHero
        kicker="Painel · Lara"
        title={
          <>
            Templates de <em>resposta</em>
          </>
        }
        lede="Mensagens prontas com agendamento relativo, variáveis dinâmicas e preview WhatsApp · espelho 1:1 do clinic-dashboard."
      />
      <TemplatesClient templates={templates} canManage={canManage} />
    </PageContainer>
  )
}
