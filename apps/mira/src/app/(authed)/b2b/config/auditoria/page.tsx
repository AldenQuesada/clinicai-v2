/**
 * /b2b/config/auditoria · DEPRECATED 2026-04-26.
 * Auditoria fundida com Logs em /configuracoes?tab=logs (2 blocos).
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ConfigAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>
}) {
  const sp = await searchParams
  const qs = sp.action ? `&audit_action=${encodeURIComponent(sp.action)}` : ''
  redirect(`/configuracoes?tab=logs${qs}`)
}
