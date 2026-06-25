/**
 * GET /api/secretaria/recovery/findings · Recovery Radar · Prompt 5 (read-only).
 *
 * Lista findings do Recovery Radar via RPC `lara_recovery_findings_list`
 * (SECURITY DEFINER · filtra clinic_id = app_clinic_id() internamente). Chamada
 * com o supabase user-scoped (JWT) do loadServerReposContext → tenant correto.
 *
 * Query: ?status=open&priority=P0&limit=50  (priority opcional · status default open)
 *
 * NÃO grava nada. NÃO chama IA. NÃO envia WhatsApp.
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUS = ['open', 'accepted', 'dismissed', 'sent', 'recovered', 'lost', 'snoozed']
const ALLOWED_PRIORITY = ['P0', 'P1', 'P2', 'P3']

export async function GET(request: NextRequest) {
  try {
    const { supabase, ctx } = await loadServerReposContext()
    if (!ctx?.clinic_id) {
      return NextResponse.json({ error: 'no_tenant' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const priorityParam = searchParams.get('priority')
    const status = statusParam && ALLOWED_STATUS.includes(statusParam) ? statusParam : 'open'
    const priority = priorityParam && ALLOWED_PRIORITY.includes(priorityParam) ? priorityParam : null
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200)

    // RPC nova ainda não está nos types gerados → cast pragmático (precedente budget.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('lara_recovery_findings_list', {
      p_status: status,
      p_priority: priority,
      p_limit: limit,
    })

    if (error) {
      console.error('[API] recovery/findings rpc error:', error.message)
      return NextResponse.json({ error: 'recovery_findings_failed' }, { status: 500 })
    }

    return NextResponse.json({ status, priority, items: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[API] recovery/findings error:', message)
    return NextResponse.json({ error: 'recovery_findings_failed' }, { status: 500 })
  }
}
