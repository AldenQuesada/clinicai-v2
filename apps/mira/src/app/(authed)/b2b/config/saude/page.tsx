/**
 * /b2b/config/saude · DEPRECATED 2026-04-26.
 *
 * Saude do sistema foi absorvida na Visao geral (/configuracoes?tab=overview)
 * como aside direita. Pedido Alden: unificar saude operacional + KPIs internos
 * num lugar so com TimeRangePicker.
 *
 * Redirect permanente · mantem URLs antigas funcionando sem 404.
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ConfigSaudePage() {
  redirect('/configuracoes?tab=overview')
}
