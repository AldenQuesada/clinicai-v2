/**
 * Mira · re-export Supabase clients do package compartilhado.
 *
 * Webhook entry usa createServiceRoleClient (Mira processa msgs externas ·
 * sem JWT do user). UI admin (P1) usa createServerClient com cookies.
 */

export {
  createBrowserClient,
  createServiceRoleClient as createServerClient,
  createServerClient as createCookieServerClient,
} from '@clinicai/supabase'
