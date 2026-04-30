/**
 * Helpers TS pra checar horario comercial da clinica e enfileirar dispatches
 * adiados pra proxima janela (mig 800-88).
 *
 * Sao 2 frentes:
 *   - `b2b-comm-dispatch` (edge SQL): guard ja vive dentro de `_b2b_invoke_edge`
 *     que enfileira em b2b_pending_dispatches automaticamente.
 *   - `dispatchAdminText` (TS direto pro Evolution): chama estes helpers no
 *     proprio handler · skip ou defer conforme flag.
 *
 * Default safe (operating_hours NULL): seg-sex 8h-21h, sab 8h-18h, dom fechado
 * (ver SQL `_b2b_is_within_business_hours`). TZ America/Sao_Paulo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pergunta a DB se a clinica esta dentro do horario comercial AGORA.
 * Fail-safe: erro na RPC retorna FALSE (assume fora · adia mensagem · evita
 * mandar de madrugada por causa de glitch).
 */
export async function isWithinBusinessHours(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('_b2b_is_within_business_hours', {
      p_clinic_id: clinicId,
    })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

/**
 * Calcula proximo timestamp em que a clinica entra no horario comercial.
 * Default fallback: now()+12h (caso RPC falhe).
 */
export async function nextWindowStart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
  after: Date = new Date(),
): Promise<Date> {
  try {
    const { data, error } = await supabase.rpc('_b2b_next_window_start', {
      p_clinic_id: clinicId,
      p_after: after.toISOString(),
    })
    if (error || !data) return new Date(after.getTime() + 12 * 60 * 60 * 1000)
    return new Date(data as string)
  } catch {
    return new Date(after.getTime() + 12 * 60 * 60 * 1000)
  }
}

/**
 * Enfileira um dispatch admin pra proxima janela comercial. Reusa a tabela
 * `b2b_pending_dispatches` (mig 800-88) com `edge_path='admin-direct-dispatch'`
 * pra distinguir do fluxo via edge B2B. Worker
 * `b2b-pending-dispatches-worker` NAO drena este edge_path (so b2b-comm-dispatch
 * + outras edges HTTP) · um cron handler `mira-admin-quiet-drain` proprio
 * pode ser adicionado se Alden quiser entrega garantida. Por padrao, agora,
 * a fila vira AUDIT TRAIL: admin pode listar via UI o que foi adiado.
 *
 * Retorna pending_id (uuid) ou null em caso de erro.
 */
export async function enqueueAdminDispatchForLater(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  args: {
    clinicId: string
    eventKey: string
    text: string
    category?: string
    msgKey?: string
  },
): Promise<{ pendingId: string | null; scheduledFor: Date | null }> {
  try {
    const sched = await nextWindowStart(supabase, args.clinicId, new Date())
    const { data, error } = await supabase
      .from('b2b_pending_dispatches')
      .insert({
        clinic_id: args.clinicId,
        edge_path: 'admin-direct-dispatch',
        payload: {
          event_key: args.eventKey,
          text: args.text,
          category: args.category ?? null,
          msg_key: args.msgKey ?? null,
          recipient_role: 'admin',
        },
        scheduled_for: sched.toISOString(),
        reason: 'quiet_hours',
        source_event_key: args.eventKey,
      })
      .select('id')
      .single()
    if (error || !data) return { pendingId: null, scheduledFor: null }
    return { pendingId: data.id as string, scheduledFor: sched }
  } catch {
    return { pendingId: null, scheduledFor: null }
  }
}
