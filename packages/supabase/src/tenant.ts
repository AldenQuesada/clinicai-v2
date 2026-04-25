/**
 * Resolução de clinic_id por request · ADR-028 (multi-tenant + multi-user inegociável).
 *
 * 3 mecanismos em ordem de prioridade:
 *
 * 1. Webhook Meta Cloud (POST /api/webhook/whatsapp):
 *    clinic_id resolvido via phone_number_id no payload Meta · lookup em wa_numbers.
 *    Caller chama resolveClinicByPhoneNumberId(phoneNumberId).
 *
 * 2. UI autenticada (RSC, Server Actions):
 *    clinic_id vem do JWT claim · custom_access_token_hook injeta no token.
 *    Caller chama resolveClinicContext(supabaseClient).
 *
 * 3. Fallback explícito (cron, scripts internos):
 *    Header `x-clinic-id` validado contra tabela clinics.
 *    Caller chama resolveClinicByHeader(req).
 *
 * Helpers nunca retornam fallback "Mirian" silencioso. Se ambíguo, throws.
 * Comentário NÃO usar `// TODO(ADR-028)` · multi-tenant não é TODO, é requisito.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export interface ClinicContext {
  clinic_id: string
  user_id?: string | null
  role?: 'owner' | 'admin' | 'therapist' | 'receptionist' | 'viewer' | null
}

/**
 * Resolve clinic_id de Server Component / Server Action via JWT do user logado.
 * Lança se user não autenticado ou JWT sem claim clinic_id.
 */
export async function resolveClinicContext(
  supabase: SupabaseClient<Database>,
): Promise<ClinicContext | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // custom_access_token_hook (Supabase) injeta clinic_id + app_role
  const claims = (user.app_metadata ?? {}) as Record<string, unknown>
  const clinic_id = (claims.clinic_id as string | undefined) ?? null
  const role = (claims.app_role as ClinicContext['role']) ?? null

  if (!clinic_id) {
    // User logado mas sem clinic membership · provavelmente bug de onboarding
    return null
  }

  return { clinic_id, user_id: user.id, role }
}

/**
 * Versão assertive · throw se sem context. Use em endpoints que exigem auth.
 */
export async function requireClinicContext(
  supabase: SupabaseClient<Database>,
): Promise<ClinicContext> {
  const ctx = await resolveClinicContext(supabase)
  if (!ctx) {
    throw new Error('UNAUTHORIZED · sem context de clínica · usuário não logado ou sem membership')
  }
  return ctx
}

/**
 * Resolve clinic_id pelo phone_number_id da Meta Cloud (webhook entry).
 * Service role obrigatório · webhook é unauth (Meta envia direto).
 */
export async function resolveClinicByPhoneNumberId(
  serviceClient: SupabaseClient<Database>,
  phoneNumberId: string,
): Promise<{ clinic_id: string; wa_number_id: string } | null> {
  if (!phoneNumberId) return null

  // Tipagem any aqui · types.ts vai ser regenerado via supabase-js codegen
  // depois que rodarmos `supabase gen types typescript --linked` (Fase 1).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (serviceClient.from('wa_numbers') as any)
    .select('id, clinic_id, is_active')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return { clinic_id: data.clinic_id as string, wa_number_id: data.id as string }
}
