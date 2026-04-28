/**
 * Wrapper · createServerClient com cookie store do Next App Router.
 * Uso em RSC e Route Handlers.
 */
import { cookies } from 'next/headers'
import { createServerClient as createSSR } from '@clinicai/supabase/server'

// Camada 3 (2026-04-28): inferimos retorno em vez de declarar
// `SupabaseClient` nominal · evita mismatch de generics quando
// @clinicai/supabase passa Database tipado (3 vs 4 generics).
export async function createServerClient() {
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
