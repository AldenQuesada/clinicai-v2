/**
 * Detector de promessa de retorno · KPI Retorno do dashboard Secretaria.
 *
 * Single source of truth pra:
 *   - retornoCount no /secretaria (count de KPI)
 *   - filtro tab "Retorno" no ConversationList
 *   - critério (B) do KPI agregado Urgente (retorno crítico ≥ 7min)
 *
 * Regra (Alden 2026-05-05):
 *
 *   Uma conversa está aguardando retorno quando:
 *     1. A última mensagem humana outbound contém promessa de retorno;
 *     2. Não houve nova mensagem humana depois (last_human_reply_at é, por
 *        definição, a mais recente);
 *     3. O paciente NÃO respondeu por cima (senão é Aguardando, não Retorno).
 *
 *   Frases que disparam (case-insensitive · checa substring):
 *     - "um instante"
 *     - "um minutinho"
 *     - "vou verificar"
 *     - "vou consultar"
 *     - "vou ver"
 *     - "vou confirmar"
 *     - "já te retorno" / "ja te retorno" / "te retorno"
 *     - "vou falar com a Dra" / "vou falar com a doutora"
 *     - "vou passar para a Dra" / "vou passar para a doutora"
 *
 *   Crítico (subset · usado em KPI Urgente):
 *     promessa pendente E (now - last_human_reply_at) ≥ 7 minutos.
 */

/** Regex de detecção · case-insensitive · cobre acentuação "j[áa]". */
export const PROMISE_RE =
  /(um instante|um minutinho|vou verificar|vou consultar|vou ver|vou confirmar|j[áa] te retorno|te retorno|vou falar com a (?:dra|doutora)|vou passar para a (?:dra|doutora))/i

/** Minutos decorridos desde um ISO timestamp · Infinity se inválido/null. */
export function minutesSince(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return Infinity
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return Infinity
  return Math.max(0, Math.floor((now.getTime() - ts) / 60_000))
}

/** Subset mínimo da Conversation que isReturnPending consome · permite que
    o helper rode sobre DTO da repository ou da hook (snake_case unificado). */
export interface ReturnPromiseSource {
  last_human_reply_text?: string | null
  last_human_reply_at?: string | null
  last_lead_msg?: string | null
}

/**
 * True quando a conversa está com promessa de retorno pendente.
 *
 * NOTA: NÃO checa `assigned_to` aqui · a exclusão de Dra acontece no caller
 * (retornoCount filtra `!isAssignedToDoctor` antes de chamar isReturnPending).
 * Mantém a função pura/composable.
 */
export function isReturnPending(conv: ReturnPromiseSource): boolean {
  if (!conv.last_human_reply_text || !conv.last_human_reply_at) return false
  if (!PROMISE_RE.test(conv.last_human_reply_text)) return false

  // Paciente respondeu por cima depois da promessa · sai de Retorno · cai no
  // bucket Aguardando (paciente é o último a falar agora).
  if (conv.last_lead_msg) {
    const patientTs = new Date(conv.last_lead_msg).getTime()
    const humanTs = new Date(conv.last_human_reply_at).getTime()
    if (Number.isFinite(patientTs) && Number.isFinite(humanTs) && patientTs > humanTs) {
      return false
    }
  }
  return true
}

/**
 * True quando há promessa pendente E ≥ 7min desde a última msg humana.
 * Threshold cravado por Alden (alinhado com escala SLA · 7min é onset
 * "vermelho" do badge ⏱).
 */
export function isReturnCritical(conv: ReturnPromiseSource, now: Date = new Date()): boolean {
  if (!isReturnPending(conv)) return false
  return minutesSince(conv.last_human_reply_at ?? null, now) >= 7
}
