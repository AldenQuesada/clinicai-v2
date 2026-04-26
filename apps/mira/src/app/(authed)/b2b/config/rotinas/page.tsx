/**
 * /b2b/config/rotinas · DEPRECATED 2026-04-26.
 * Fundido com Padroes em /configuracoes?tab=automacao (2 blocos lado a lado).
 *
 * RotinasClient + actions.ts mantidos · AutomacaoTab importa o client
 * component direto (zero duplicacao de codigo).
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function RotinasPage() {
  redirect('/configuracoes?tab=automacao')
}
