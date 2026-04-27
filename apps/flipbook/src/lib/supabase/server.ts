/**
 * Wrapper · createServerClient com cookie store do Next App Router.
 * Uso em RSC e Route Handlers.
 */
import { cookies } from 'next/headers'
import { createServerClient as createSSR } from '@clinicai/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function createServerClient(): Promise<SupabaseClient> {
  const store = await cookies()
  return createSSR({
    getAll: () => store.getAll(),
    setAll: (toSet) => {
      try {
        toSet.forEach(({ name, value, options }) => {
          store.set(name, value, options)
        })
      } catch {
        // chamado em RSC sem permissão de mutação · ignora silenciosamente
      }
    },
  })
}
