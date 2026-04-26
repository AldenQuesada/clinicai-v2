/**
 * Tab Profissionais · CRUD completo (mirror clinic-dashboard mira-config.ui.js).
 *
 * Server Component carrega lista atual + catalogo de profissionais ativos
 * (dropdown do modal Cadastrar) · ProfessionalsClient cuida dos modais e
 * server actions.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { ProfessionalsClient } from './ProfessionalsClient'

export async function ProfessionalsTab() {
  const { ctx, repos } = await loadMiraServerContext()
  const [numbers, professionals, quotasToday] = await Promise.all([
    repos.waNumbers.listProfessionalPrivate(ctx.clinic_id).catch(() => []),
    repos.professionalProfiles.listActiveWithPhone().catch(() => []),
    repos.waNumbers.queriesByProfessionalToday().catch(() => ({})),
  ])

  return (
    <ProfessionalsClient
      initialNumbers={numbers}
      professionals={professionals}
      quotasToday={quotasToday}
    />
  )
}
