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
 *
 * Ordem de resolução:
 *   1. JWT claim `app_metadata.clinic_id` (canonical · custom_access_token_hook)
 *   2. Fallback RPC `_default_clinic_id()` (single-tenant Mirian) · log warn 1x
 *   3. null se nenhum funcionar
 *
 * Multi-tenant futuro: configurar custom_access_token_hook no Supabase Auth →
 * o JWT passa a ter clinic_id por user. Sem isso, qualquer user logado cai no
 * fallback (suficiente pra Mirian single-tenant atual).
 *
 * Cache fallback _default_clinic_id() em modulo · single-tenant nunca muda em
 * runtime · economiza ~200-400ms por request. Em multi-tenant futuro o claim
 * JWT vem antes e este cache nunca e usado.
 */
let _cachedDefaultClinicId: string | null = null
let _warnedAboutFallback = false

export async function resolveClinicContext(
  supabase: SupabaseClient<Database>,
): Promise<ClinicContext | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 1. JWT claim canonical
  const claims = (user.app_metadata ?? {}) as Record<string, unknown>
  const clinicIdClaim = (claims.clinic_id as string | undefined) ?? null
  const role = (claims.app_role as ClinicContext['role']) ?? null

  if (clinicIdClaim) {
    return { clinic_id: clinicIdClaim, user_id: user.id, role }
  }

  // 2. Fallback RPC `_default_clinic_id()` · single-tenant Mirian
  if (_cachedDefaultClinicId) {
    return { clinic_id: _cachedDefaultClinicId, user_id: user.id, role }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.rpc('_default_clinic_id')
  if (!error && data) {
    _cachedDefaultClinicId = String(data)
    if (!_warnedAboutFallback && typeof console !== 'undefined') {
      _warnedAboutFallback = true
      console.warn(
        `[tenant] user ${user.id} sem clinic_id no JWT · fallback _default_clinic_id() = ${data} (cached). ` +
        `Configurar custom_access_token_hook no Supabase pra injetar claim.`,
      )
    }
    return { clinic_id: _cachedDefaultClinicId, user_id: user.id, role }
  }

  // 3. Sem fallback · user logado mas sem membership resolvivel
  return null
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
  const { data, error } = await serviceClient.from('wa_numbers')
    .select('id, clinic_id, is_active')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return { clinic_id: data.clinic_id as string, wa_number_id: data.id as string }
}
