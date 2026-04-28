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
import { createServerClient } from './server'
import {
  requireClinicContext,
  resolveClinicContext,
  type ClinicContext,
} from './tenant'

// Camada 3 (2026-04-28): tipo derivado de createServerClient (3 generics
// do @supabase/ssr) em vez de SupabaseClient<Database> nominal (4 generics
// do @supabase/supabase-js@2.103+) · evita mismatch.
type SupabaseServerClient = ReturnType<typeof createServerClient>

interface ServerContextResult {
  supabase: SupabaseServerClient
  ctx: ClinicContext
}

interface OptionalServerContextResult {
  supabase: SupabaseServerClient
  ctx: ClinicContext | null
}

function makeSupabase(): Promise<SupabaseServerClient> {
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
