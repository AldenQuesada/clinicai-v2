/**
 * loadServerContext · helper canônico pra Server Components / Server Actions.
 *
 * Substitui o boilerplate repetido em 4+ pages (dashboard, configuracoes, prompts, templates):
 *
 *   const cookieStore = await cookies()
 *   const supabase = createServerClient({ getAll: ..., setAll: ... })
 *   const ctx = await requireClinicContext(supabase)
 *
 * Por:
 *
 *   const { supabase, ctx } = await loadServerContext()
 *
 * Mantém DRY (regra GOLD-STANDARD pré-commit), reduz superfície de erro
 * (esquecer de await cookies(), esquecer de chamar requireClinicContext, etc).
 *
 * Variantes:
 *   loadServerContext()         · auth obrigatória · throw se sem clinic_id
 *   loadOptionalServerContext() · auth opcional · retorna ctx=null se anônimo
 */

import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from './server'
import {
  requireClinicContext,
  resolveClinicContext,
  type ClinicContext,
} from './tenant'
import type { Database } from './types'

interface ServerContextResult {
  supabase: SupabaseClient<Database>
  ctx: ClinicContext
}

interface OptionalServerContextResult {
  supabase: SupabaseClient<Database>
  ctx: ClinicContext | null
}

function makeSupabase(): Promise<SupabaseClient<Database>> {
  return cookies().then((cookieStore) =>
    createServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set(name, value, options as any)
        })
      },
    }),
  )
}

/**
 * Carrega Supabase client autenticado + clinic context.
 * Throw se user não logado ou sem clinic membership · use em pages protegidas.
 */
export async function loadServerContext(): Promise<ServerContextResult> {
  const supabase = await makeSupabase()
  const ctx = await requireClinicContext(supabase)
  return { supabase, ctx }
}

/**
 * Carrega Supabase client + clinic context opcional.
 * Retorna ctx=null se user anônimo · use em pages que renderizam público + privado.
 */
export async function loadOptionalServerContext(): Promise<OptionalServerContextResult> {
  const supabase = await makeSupabase()
  const ctx = await resolveClinicContext(supabase)
  return { supabase, ctx }
}
