/**
 * Mira · helper pra Server Components / Server Actions.
 *
 * Mirror Lara/loadServerReposContext mas com MiraRepos completos (incluindo
 * b2b_*, mira_state, wa_pro_audit). UI admin sempre passa por aqui:
 *
 *   const { ctx, repos } = await loadMiraServerContext()
 *   const partnerships = await repos.b2bPartnerships.list(ctx.clinic_id, ...)
 *
 * Auth obrigatoria · throw se sem ctx (middleware ja garantiu user logado).
 */

import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient, requireClinicContext, type ClinicContext, type Database } from '@clinicai/supabase'
import { makeMiraRepos, type MiraRepos } from './repos'

interface MiraServerContextResult {
  supabase: SupabaseClient<Database>
  ctx: ClinicContext
  repos: MiraRepos
}

export async function loadMiraServerContext(): Promise<MiraServerContextResult> {
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cookieStore.set(name, value, options as any)
      })
    },
  })
  const ctx = await requireClinicContext(supabase)
  return { supabase, ctx, repos: makeMiraRepos(supabase) }
}
