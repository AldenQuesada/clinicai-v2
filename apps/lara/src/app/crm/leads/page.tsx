/**
 * /crm/leads · redirect → /leads.
 *
 * Histórico: o sub-nav do CRM (CrmSidebarNav) linkou `/crm/leads` por meses,
 * mas a rota nunca existiu — a lista canônica de leads vive em
 * `/(authed)/leads` (path real `/leads`). Resultado: clique no menu = 404.
 *
 * R1 (audit 2026-05-17) corrigiu o link no CrmSidebarNav direto pra `/leads`.
 * Este redirect cobre o flanco: links externos, bookmarks, histórico do
 * browser ou qualquer referência antiga a `/crm/leads` cai em `/leads` em
 * vez de 404.
 *
 * Server Component · `redirect()` server-side · zero JS no client.
 */

import { redirect } from 'next/navigation'

export default function CrmLeadsRedirectPage() {
  redirect('/leads')
}
