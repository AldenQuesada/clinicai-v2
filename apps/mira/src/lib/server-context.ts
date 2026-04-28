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
import { createServerClient, requireClinicContext, type ClinicContext } from '@clinicai/supabase'
import { makeMiraRepos, type MiraRepos } from './repos'

interface MiraServerContextResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
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
  // Cast pra any · evita mismatch generics entre @supabase/ssr (3) e
  // @supabase/supabase-js@2.103+ (4-5) ao passar pros repos `<any>`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  return { supabase: sb, ctx, repos: makeMiraRepos(sb) }
}
