/**
 * createEvolutionServiceForMiraChannel · estrito · sem fallback.
 *
 * Resolve canal por `function_key` via `mira_channels` e instancia
 * EvolutionService usando credenciais do `wa_numbers` ATIVO. Caller que
 * recebe `null` DEVE abortar o envio (skip + log) · NUNCA usa fallback
 * pra `mira-mirian`.
 *
 * Diferença vs `resolveMiraInstance` (mira-instance.ts) + `getEvolutionService`:
 *   - `resolveMiraInstance` cai no fallback hardcoded `EVOLUTION_INSTANCE_MIRA`
 *     (default `mira-mirian` · chip 7673). Esse fallback é o que faz a Mira
 *     responder pelo número pessoal mesmo com `wa_numbers.is_active=false`.
 *   - Este helper NÃO tem fallback · é fail-closed.
 *
 * Critérios pra retornar EvolutionService válido (todos obrigatórios):
 *   1. `mira_channels` row do par (clinic_id, function_key) com `is_active=true`
 *   2. Linkage pra `wa_numbers` (não-NULL `wa_number_id`)
 *   3. `wa_numbers.is_active = true`
 *   4. `wa_numbers.instance_id`, `api_url`, `api_key` todos preenchidos
 *
 * Falha em qualquer critério → `null` + log estruturado `mira.send.no_active_channel`
 * com `reason` discreta (mira_channel_not_found · wa_number_inactive · etc).
 *
 * Audit 2026-05-05: criado pra fix Mira respondendo do 7673 inactive
 * (wa_number `8f33e269-...` · `mira-mirian` · is_active=false). UI
 * `/configuracoes` aba Canais é source-of-truth · este helper força os
 * callers a obedecerem. Migrar todos os `getEvolutionService('mira').sendText`
 * pra cá; `getEvolutionService` permanece como factory baixo nível pra
 * downloadMedia (inbound · usa env-based instance) e Mih (recipient_voucher
 * Lara persona enquanto Fase B não migra).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { EvolutionService } from '@clinicai/whatsapp'
import { createLogger } from '@clinicai/logger'
import { createServerClient } from '@/lib/supabase'

const log = createLogger({ app: 'mira' })

/**
 * Razão estruturada quando o helper retorna `null`. Útil pra alertas/dashboards.
 */
type NoChannelReason =
  | 'mira_channel_not_found'
  | 'wa_number_unlinked'
  | 'wa_number_inactive'
  | 'wa_number_missing_credentials'
  | 'query_failed'
  | 'exception'

/**
 * Constrói EvolutionService usando o canal ativo configurado em `mira_channels`
 * pra `function_key`. Retorna `null` se config inválida · caller observa null
 * e aborta · NUNCA cair em chip default.
 *
 * @param supabaseOrNull cliente opcional · cria server client se omitido
 * @param clinicId       UUID da clínica
 * @param functionKey    ex: 'partner_response', 'mira_admin_outbound', 'partner_onboarding'
 */
export async function createEvolutionServiceForMiraChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseOrNull: SupabaseClient<any> | null,
  clinicId: string,
  functionKey: string,
): Promise<EvolutionService | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (supabaseOrNull ?? createServerClient()) as SupabaseClient<any>

  let reason: NoChannelReason | null = null
  let waNumberId: string | null = null

  try {
    // Single query · mira_channels (active) JOIN wa_numbers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('mira_channels')
      .select(`
        function_key,
        is_active,
        wa_number_id,
        wa_numbers (
          id,
          instance_id,
          api_url,
          api_key,
          is_active,
          label
        )
      `)
      .eq('clinic_id', clinicId)
      .eq('function_key', functionKey)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      reason = 'query_failed'
    } else if (!data) {
      reason = 'mira_channel_not_found'
    } else {
      const waRow = Array.isArray(data.wa_numbers) ? data.wa_numbers[0] : data.wa_numbers
      if (!waRow) {
        reason = 'wa_number_unlinked'
      } else {
        waNumberId = waRow.id ? String(waRow.id) : null
        if (waRow.is_active === false) {
          reason = 'wa_number_inactive'
        } else if (!waRow.instance_id || !waRow.api_url || !waRow.api_key) {
          reason = 'wa_number_missing_credentials'
        } else {
          // ✓ tudo válido · constrói EvolutionService
          return new EvolutionService({
            apiUrl: String(waRow.api_url),
            apiKey: String(waRow.api_key),
            instance: String(waRow.instance_id),
          })
        }
      }
    }
  } catch (err) {
    log.warn(
      {
        clinicId,
        functionKey,
        reason: 'exception',
        err: (err as Error)?.message?.slice(0, 120),
      },
      'mira.send.no_active_channel',
    )
    return null
  }

  log.warn(
    {
      clinicId,
      functionKey,
      reason,
      ...(waNumberId ? { waNumberId } : {}),
    },
    'mira.send.no_active_channel',
  )
  return null
}

/**
 * Verifica se a instância Evolution que recebeu o webhook é a configurada
 * em `mira_channels` pra `function_key` (tipicamente `partner_voucher_req`).
 *
 * Audit C2 ajustado (2026-05-05): UI controla ENTRADA também · não só saída.
 * Se Alden trocar `partner_voucher_req` no ChannelsTab pra outro chip, o
 * antigo (ex: 7673) deve parar de acionar Mira mesmo se Evolution continuar
 * entregando webhook lá.
 *
 * Retorna `true` SE TODOS:
 *   - mira_channels row (clinic_id, function_key, is_active=true) existe
 *   - wa_numbers vinculado existe + is_active=true
 *   - wa_numbers.instance_id === incomingInstance (case-sensitive)
 *
 * Caso contrário retorna `false` + log estruturado · caller deve skip silent.
 *
 * Sem fallback · sem env var · zero "default mira-mirian".
 */
export async function isIncomingMiraChannelAllowed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseOrNull: SupabaseClient<any> | null,
  clinicId: string,
  functionKey: string,
  incomingInstance: string,
): Promise<boolean> {
  if (!incomingInstance) {
    log.warn(
      { clinicId, functionKey, reason: 'incoming_instance_empty' },
      'mira.inbound.skipped_unconfigured_channel',
    )
    return false
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (supabaseOrNull ?? createServerClient()) as SupabaseClient<any>

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('mira_channels')
      .select(`
        function_key,
        is_active,
        wa_number_id,
        wa_numbers (
          id,
          instance_id,
          is_active
        )
      `)
      .eq('clinic_id', clinicId)
      .eq('function_key', functionKey)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      log.warn(
        { clinicId, functionKey, incomingInstance, reason: 'query_failed', err: error.message?.slice(0, 120) },
        'mira.inbound.skipped_unconfigured_channel',
      )
      return false
    }
    if (!data) {
      log.info(
        { clinicId, functionKey, incomingInstance, reason: 'mira_channel_not_found' },
        'mira.inbound.skipped_unconfigured_channel',
      )
      return false
    }

    const waRow = Array.isArray(data.wa_numbers) ? data.wa_numbers[0] : data.wa_numbers
    if (!waRow) {
      log.info(
        { clinicId, functionKey, incomingInstance, reason: 'wa_number_unlinked' },
        'mira.inbound.skipped_unconfigured_channel',
      )
      return false
    }
    if (waRow.is_active === false) {
      log.info(
        {
          clinicId,
          functionKey,
          incomingInstance,
          waNumberId: waRow.id ? String(waRow.id) : null,
          reason: 'wa_number_inactive',
        },
        'mira.inbound.skipped_unconfigured_channel',
      )
      return false
    }
    if (!waRow.instance_id) {
      log.info(
        {
          clinicId,
          functionKey,
          incomingInstance,
          waNumberId: waRow.id ? String(waRow.id) : null,
          reason: 'wa_number_no_instance_id',
        },
        'mira.inbound.skipped_unconfigured_channel',
      )
      return false
    }
    if (String(waRow.instance_id) !== incomingInstance) {
      log.info(
        {
          clinicId,
          functionKey,
          incomingInstance,
          configuredInstance: String(waRow.instance_id),
          waNumberId: waRow.id ? String(waRow.id) : null,
          reason: 'instance_mismatch',
        },
        'mira.inbound.skipped_unconfigured_channel',
      )
      return false
    }

    return true
  } catch (err) {
    log.warn(
      {
        clinicId,
        functionKey,
        incomingInstance,
        reason: 'exception',
        err: (err as Error)?.message?.slice(0, 120),
      },
      'mira.inbound.skipped_unconfigured_channel',
    )
    return false
  }
}
