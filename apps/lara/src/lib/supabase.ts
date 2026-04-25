/**
 * Lara · re-export Supabase clients do package compartilhado.
 *
 * Mantém compatibilidade com imports legacy do Ivan (`@/lib/supabase`).
 * Logic real vive em @clinicai/supabase · use ela direto em código novo.
 *
 * IMPORTANTE: o `createServerClient()` aqui é o LEGACY do Ivan (service role
 * direto sem cookie). Pra RSC autenticado, use `createServerClient` de
 * `@clinicai/supabase/server` passando cookies.
 */

export { createBrowserClient, createServiceRoleClient as createServerClient } from '@clinicai/supabase'
