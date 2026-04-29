/**
 * Service-role client · bypassa RLS. Use APENAS em server actions, route handlers
 * e edge functions. NUNCA exporte ou importe em código que pode rodar no browser.
 *
 * RLS das tabelas commerce (purchases, subscriptions, access_grants) é projetada
 * pra negar mutations de anon/authenticated por design — só service client escreve.
 */
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service env not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}
