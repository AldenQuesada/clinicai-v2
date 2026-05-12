/**
 * Helper para resolver o wa_number_id do canal Secretaria (Mih · 2986).
 *
 * Contexto (Patch 2D · isolation 2986 · 2026-05-11):
 *   A tela /secretaria deve listar APENAS conversas do canal oficial da
 *   secretaria (phone 5544991622986 · label "Secretaria B&H" · instance Mih).
 *   Antes deste patch, listByStatus filtrava so por inbox_role='secretaria' ·
 *   misturando Mih + Mira + Mira Marci + Canal auxiliar (4 wa_numbers ativos
 *   compartilham esse role).
 *
 * Resolução canonica: phone normalizado === '5544991622986'.
 * Fallback: label === 'Secretaria B&H' (caso phone seja alterado no futuro
 * sem updates no app).
 *
 * Retorna `null` quando o canal nao existe / esta inativo · caller decide o
 * que fazer (atualmente: cair no fallback inbox_role-only · mas isso volta
 * ao comportamento antigo · log de warning).
 *
 * NAO cacheia em memoria · cada request resolve 1 SELECT (1 row · ~ms via
 * primary index em wa_numbers.phone). Trade-off: simplicidade > performance.
 * Se virar gargalo, mover pro loadServerContext (1x por request).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Phone canonico (E.164 BR sem +) do canal Secretaria Mih. */
export const SECRETARIA_CANONICAL_PHONE = '5544991622986'

/** Label esperado em wa_numbers · fallback se phone mudar. */
export const SECRETARIA_CANONICAL_LABEL = 'Secretaria B&H'

/**
 * Resolve o wa_number_id do canal Secretaria (Mih) para a clinic do JWT.
 *
 * @returns wa_number_id (uuid) ou `null` se nao encontrado.
 */
export async function resolveSecretariaWaNumberId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
): Promise<string | null> {
  // Tentativa 1: phone canonico.
  const byPhone = await supabase
    .from('wa_numbers')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('phone', SECRETARIA_CANONICAL_PHONE)
    .eq('is_active', true)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phoneId = (byPhone.data as any)?.id
  if (phoneId) return String(phoneId)

  // Fallback: label exato (defesa contra renumber futuro).
  const byLabel = await supabase
    .from('wa_numbers')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('label', SECRETARIA_CANONICAL_LABEL)
    .eq('is_active', true)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelId = (byLabel.data as any)?.id
  return labelId ? String(labelId) : null
}
