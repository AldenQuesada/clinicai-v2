/**
 * /estudio/padroes · DEPRECATED 2026-04-26.
 * Fundido com Rotinas em /configuracoes?tab=automacao (2 blocos lado a lado).
 *
 * actions.ts (getVoucherDefaults + saveVoucherDefaultsAction) mantido ·
 * AutomacaoTab importa direto (zero duplicacao de codigo).
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function PadroesPage() {
  redirect('/configuracoes?tab=automacao')
}
