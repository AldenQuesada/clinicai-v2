/**
 * /api/debug/diag · diagnostic endpoint pra debugar Server Components crash.
 *
 * Roda cada step do flow autenticado isolado em try/catch e retorna JSON com
 * qual step quebrou + mensagem real de erro. Em prod, Server Components
 * suprimem o erro real · este endpoint expoe via JSON pra debug temporario.
 *
 * Auth: precisa do header `x-cron-secret` (mesmo do MIRA_CRON_SECRET) pra
 * evitar exposicao publica de internals.
 *
 * REMOVER APOS DEBUG (P2 cleanup).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, requireClinicContext } from '@clinicai/supabase'
import { makeMiraRepos } from '@/lib/repos'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const secret = req.headers.get('x-cron-secret') || url.searchParams.get('secret') || ''
  const expected = process.env.MIRA_CRON_SECRET || ''
  if (!expected || !timingSafeEq(secret, expected)) {
    return NextResponse.json({ error: 'unauthorized', hint: 'pass ?secret=... or x-cron-secret header' }, { status: 401 })
  }

  const steps: Array<{ step: string; ok: boolean; result?: unknown; error?: string }> = []

  async function run<T>(step: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      const result = await fn()
      steps.push({ step, ok: true, result: typeof result === 'object' ? '<object>' : result })
      return result
    } catch (e) {
      steps.push({
        step,
        ok: false,
        error: (e as Error)?.message || String(e),
      })
      return null
    }
  }

  // 1. cookies + supabase client
  const cookieStore = await run('cookies()', async () => await cookies())
  if (!cookieStore) return NextResponse.json({ steps }, { status: 500 })

  const supabase = await run('createServerClient', async () => createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cookieStore.set(name, value, options as any)
      })
    },
  }))
  if (!supabase) return NextResponse.json({ steps }, { status: 500 })

  // 2. auth.getUser
  const userRes = await run('auth.getUser', async () => await supabase.auth.getUser())
  const user = userRes?.data?.user
  steps.push({
    step: 'user.exists',
    ok: !!user,
    result: user ? { id: user.id, email: user.email, app_metadata: user.app_metadata } : null,
  })

  // 3. requireClinicContext
  const ctx = await run('requireClinicContext', async () => await requireClinicContext(supabase))
  if (!ctx) return NextResponse.json({ steps }, { status: 200 })

  steps.push({
    step: 'ctx.values',
    ok: true,
    result: { clinic_id: ctx.clinic_id, user_id: ctx.user_id, role: ctx.role },
  })

  // 4. makeMiraRepos
  const repos = await run('makeMiraRepos', async () => makeMiraRepos(supabase))
  if (!repos) return NextResponse.json({ steps }, { status: 200 })

  // 5. test cada query do dashboard isolada
  await run('budget.getTodayCost', () => repos.budget.getTodayCost(ctx.clinic_id))
  await run('budget.getRecentCost', () => repos.budget.getRecentCost(ctx.clinic_id, 7))
  await run('b2bPartnerships.count(active)', () => repos.b2bPartnerships.count(ctx.clinic_id, { status: 'active' }))
  await run('b2bPartnerships.count(paused)', () => repos.b2bPartnerships.count(ctx.clinic_id, { status: 'paused' }))
  await run('b2bPartnerships.count(dna_check)', () => repos.b2bPartnerships.count(ctx.clinic_id, { status: 'dna_check' }))

  const today = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
  const sevenDays = new Date(Date.now() - 7 * 86400000).toISOString()
  const thirtyDays = new Date(Date.now() - 30 * 86400000).toISOString()

  await run('b2bVouchers.countByPeriod(today)', () => repos.b2bVouchers.countByPeriod(ctx.clinic_id, today))
  await run('b2bVouchers.countByPeriod(7d)', () => repos.b2bVouchers.countByPeriod(ctx.clinic_id, sevenDays))
  await run('b2bVouchers.countByPeriod(30d redeemed)', () =>
    repos.b2bVouchers.countByPeriod(ctx.clinic_id, thirtyDays, { status: ['redeemed', 'opened'] }))
  await run('b2bVouchers.countByPeriod(30d total)', () => repos.b2bVouchers.countByPeriod(ctx.clinic_id, thirtyDays))
  await run('b2bPartnerships.topPerformers30d', () => repos.b2bPartnerships.topPerformers30d(ctx.clinic_id, 5))
  await run('b2bTemplates.listAll', () => repos.b2bTemplates.listAll(ctx.clinic_id))
  await run('profiles.getById', () => user ? repos.profiles.getById(user.id) : Promise.resolve(null))

  return NextResponse.json({
    summary: {
      total: steps.length,
      ok: steps.filter((s) => s.ok).length,
      failed: steps.filter((s) => !s.ok).length,
      first_failure: steps.find((s) => !s.ok)?.step,
    },
    steps,
  })
}
