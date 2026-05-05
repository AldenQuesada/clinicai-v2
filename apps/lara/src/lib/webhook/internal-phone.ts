/**
 * isInternalWaNumber · guard universal contra colisão entre números operacionais
 * da clínica (linhas em public.wa_numbers) e leads/conversas externas.
 *
 * Audit 2026-05-05: o guard antigo inline em 3 webhooks (Evolution, Cloud,
 * simulate-inbound) filtrava `WHERE is_active=true` · números internos
 * INATIVOS (ex: Mira/Alden 5544998787673 com is_active=false) escapavam ·
 * viravam lead/conversa externa · poluíam fila operacional · disparavam
 * auto-greeting indevido.
 *
 * Regra macro: qualquer phone presente em wa_numbers (do clinic_id certo)
 * é considerado interno · INDEPENDENTE de is_active e number_type. Caller
 * decide o que fazer (skip webhook · bloquear create lead · skip campanha).
 *
 * Estratégia de match (refactor 2026-05-05): NÃO usa SQL `LIKE %last8` ·
 * frágil quando wa_numbers.phone está formatado com espaço/hífen/parênteses
 * (last8 não aparece contíguo no LIKE). Em vez disso:
 *   1. Busca TODAS as linhas wa_numbers do clinic_id (tabela é pequena ·
 *      no máximo dezenas de linhas por clínica · custo ~0)
 *   2. Normaliza phone de cada row em JS (`replace(/\D/g, '')`)
 *   3. Gera variantes do phone de entrada via `phoneVariants` (cobre
 *      12c sem 9 vs 13c com 9 BR + DDI 55)
 *   4. Faz match strong (qualquer variante in input ↔ qualquer variante in row)
 *      com fallback weak (last8 == last8) · prioriza strong
 *
 * Uso: helper é chamado em 5 entry points pra defesa em camadas:
 *   1. webhook Evolution    · skip antes de processar
 *   2. webhook Cloud        · skip antes de processar
 *   3. simulate-inbound diag · não cria probe interna
 *   4. lead-conversation    · não cria lead/conv mesmo se webhook engolir guard
 *   5. cold-open + cron reactivate · não dispara campanha pra próprio número
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants } from '@clinicai/utils'

export interface InternalPhoneCheck {
  internal: boolean
  /** wa_numbers.id que casou (ausente quando internal=false) */
  waNumberId?: string
  /** Label canônico (ex: "Mira (onboarding + parceiros B2B)") · útil pra log */
  label?: string | null
  /** 'secretaria' | 'sdr' | 'b2b' · etc */
  inboxRole?: string | null
  /** 'clinic_official' | 'professional_private' · etc */
  numberType?: string | null
  /** Estado da linha · útil pra distinguir interno-ativo vs interno-arquivado */
  isActive?: boolean | null
  /**
   * Curto · pra log triage. Valores possíveis:
   *   'phone_too_short'  · entrada < 8 dígitos
   *   'no_clinic_rows'   · clinic não tem linhas em wa_numbers
   *   'no_match'         · nenhuma linha bateu
   *   'variant_match'    · match strong (variante input ↔ variante row)
   *   'last8_match'      · match weak (fallback last8)
   *   'query_failed'     · DB hiccup · default permissive (internal=false)
   *   'exception'        · throw inesperado · default permissive
   */
  reason?: string
}

/**
 * Retorna `internal: true` quando phone bate com qualquer linha em wa_numbers
 * pertencente à mesma clínica, **sem filtrar is_active**.
 *
 * Default permissive (`internal: false`) em casos defensivos:
 *   - phone curto demais
 *   - DB query falhou (hiccup transitório)
 *   - exception inesperada
 * Justificativa: bloquear inbound legítimo por hiccup de DB é pior que deixar
 * passar 1 inbound interno raro · fluxos downstream já têm guards adicionais
 * (webhook + resolveLead/Conversation em camadas).
 *
 * Não loga phone bruto · log seguro com phone_last4 + length apenas.
 */
export async function isInternalWaNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any, any, any>,
  clinicId: string,
  phone: string,
): Promise<InternalPhoneCheck> {
  const inputDigits = (phone ?? '').replace(/\D/g, '')
  if (inputDigits.length < 8) {
    return { internal: false, reason: 'phone_too_short' }
  }
  const inputLast8 = inputDigits.slice(-8)

  // Variantes BR canônicas (12c sem 9 / 13c com 9 / digits originais).
  // phoneVariants tolera lixo de formatação · normaliza internamente.
  const inputVariants = new Set<string>([inputDigits, ...phoneVariants(phone)])

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('wa_numbers')
      .select('id, label, inbox_role, number_type, is_active, phone')
      .eq('clinic_id', clinicId)

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[isInternalWaNumber] query_failed', {
        clinicId,
        phone_length: inputDigits.length,
        phone_last4: inputDigits.slice(-4),
        err: error.message?.slice(0, 120),
      })
      return { internal: false, reason: 'query_failed' }
    }

    const rows = (data ?? []) as Array<{
      id: string
      label: string | null
      inbox_role: string | null
      number_type: string | null
      is_active: boolean | null
      phone: string
    }>

    if (rows.length === 0) {
      return { internal: false, reason: 'no_clinic_rows' }
    }

    // Match em duas passadas:
    //   strongMatch · qualquer variante input ↔ qualquer variante row
    //   weakMatch   · fallback last8 (mesma cauda 8 dígitos)
    // Prioriza strong · cai em weak só quando nenhum row casou strong.
    let strongMatch: typeof rows[number] | null = null
    let weakMatch: typeof rows[number] | null = null

    for (const row of rows) {
      const rowDigits = (row.phone ?? '').replace(/\D/g, '')
      if (rowDigits.length < 8) continue

      const rowVariants = new Set<string>([
        rowDigits,
        ...phoneVariants(row.phone),
      ])

      // Strong: interseção entre variantes
      let hasStrong = false
      for (const v of inputVariants) {
        if (rowVariants.has(v)) {
          hasStrong = true
          break
        }
      }
      if (hasStrong) {
        strongMatch = row
        break
      }

      // Weak: last8 igual · acumula primeiro encontrado (não para loop ·
      // pode aparecer um strong depois)
      if (!weakMatch && rowDigits.slice(-8) === inputLast8) {
        weakMatch = row
      }
    }

    const match = strongMatch ?? weakMatch
    if (!match) {
      return { internal: false, reason: 'no_match' }
    }

    return {
      internal: true,
      waNumberId: match.id,
      label: match.label,
      inboxRole: match.inbox_role,
      numberType: match.number_type,
      isActive: match.is_active,
      reason: strongMatch ? 'variant_match' : 'last8_match',
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[isInternalWaNumber] exception', {
      clinicId,
      phone_length: inputDigits.length,
      phone_last4: inputDigits.slice(-4),
      err: (err as Error)?.message?.slice(0, 120),
    })
    return { internal: false, reason: 'exception' }
  }
}
