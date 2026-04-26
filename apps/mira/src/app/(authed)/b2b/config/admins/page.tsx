/**
 * /b2b/config/admins · DEPRECATED 2026-04-26.
 * Fundido com Profissionais em /configuracoes?tab=pessoas (2 blocos).
 *
 * AdminsClient + actions.ts mantidos · PessoasTab importa o client component
 * direto (zero duplicacao de codigo).
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ConfigAdminsPage() {
  redirect('/configuracoes?tab=pessoas')
}
