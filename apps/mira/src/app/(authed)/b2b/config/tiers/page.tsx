/**
 * /b2b/config/tiers · DEPRECATED 2026-04-26.
 * Fundido com Funnel em /b2b/config/regras (2 blocos lado a lado).
 *
 * TiersClient + actions.ts mantidos · regras/page.tsx importa o client
 * component direto (zero duplicacao de codigo).
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ConfigTiersPage() {
  redirect('/b2b/config/regras')
}
