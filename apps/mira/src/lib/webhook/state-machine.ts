/**
 * State machine helpers · TTL constants + transition utilities.
 *
 * TTLs (DECISAO ALDEN):
 *   voucher_confirm = 30min (com reminder pre-expiry 5min)
 *   __processed__:* = 2h (dedup wa_message_id)
 *   cp_*            = 15min (cadastro parceria 7-turno)
 *   default         = 15min
 *
 * State keys convencionados:
 *   voucher_confirm        · aguardando SIM/NAO da parceira pra emitir voucher
 *   __processed__:<msgId>  · dedup
 *   cp_step                · cadastro parceria multi-turno (step 1..7)
 *   admin_reject_reason    · multi-turno · pediu motivo da rejeicao
 *
 * Auto-clear logic (DECISAO ALDEN): quando admin manda comando global em meio
 * a state residual, clear automatico antes de classificar nova intent.
 */

import type { MiraStateRepository } from '@clinicai/repositories'

export const TTL_VOUCHER_CONFIRM_MIN = 30
export const TTL_PROCESSED_MIN = 120
export const TTL_CP_WIZARD_MIN = 15
export const TTL_DEFAULT_MIN = 15

export const STATE_KEY = {
  VOUCHER_CONFIRM: 'voucher_confirm',
  PROCESSED_PREFIX: '__processed__:',
  CP_STEP: 'cp_step',
  ADMIN_REJECT_REASON: 'admin_reject_reason',
} as const

export interface VoucherConfirmState {
  partnership_id: string
  recipient_name: string
  recipient_phone: string
  recipient_first_name: string
  combo: string
  expires_at: string
  reminder_sent?: boolean
}

export interface CpStepState {
  step: number  // 1..7
  data: Partial<{
    name: string
    category: string
    instagram: string
    contact_name: string
    contact_phone: string
    address: string
    notes: string
  }>
}

/**
 * Comando global do admin · forca clear de state residual antes de classificar
 * nova intent. Logic 1:1 do clinic-dashboard b2b-mira-inbound#looksLikeGlobalAdminCommand.
 */
export function isGlobalAdminCommand(text: string): boolean {
  const t = String(text || '').trim().toLowerCase()
  return (
    /^(ajuda|help|menu|comandos|\/ajuda|\/help)\b/.test(t) ||
    /(tenho|minha|meu|quero)\s+(agenda|horario)/.test(t) ||
    /(quem|quais).*(pagou|paga|pag\w+)/.test(t) ||
    /(faturei|faturamento|receita|comissao|comiss[aã]o)/.test(t) ||
    /^(marca|marcar|agenda|agendar|cancela|cancelar|reagenda|reagendar|desmarca|desmarcar|remarca|remarcar)\s+\S/.test(t) ||
    /^quem\s+(e|é|eh)\s+\S/.test(t) ||
    /(quanto.*deve|saldo\s+do|saldo\s+da)/.test(t) ||
    /(proximo|próximo)\s+(paciente|consulta)/.test(t)
  )
}

/**
 * Dedup helper · checa se messageId ja foi processado e marca de uma vez.
 * Atomic via mira_state_set ON CONFLICT (idempotente).
 */
export async function dedupCheckAndMark(
  miraState: MiraStateRepository,
  phone: string,
  messageId: string,
): Promise<{ alreadyProcessed: boolean }> {
  if (!messageId) return { alreadyProcessed: false }

  const key = `${STATE_KEY.PROCESSED_PREFIX}${messageId.slice(0, 80)}`
  const existing = await miraState.get(phone, key)
  if (existing) return { alreadyProcessed: true }

  await miraState.set(phone, key, { wa_message_id: messageId, at: new Date().toISOString() }, TTL_PROCESSED_MIN)
  return { alreadyProcessed: false }
}

/**
 * Cria state voucher_confirm · 30min TTL, reminder_sent=false.
 * Reminder cron usa esse state.
 */
export async function setVoucherConfirmState(
  miraState: MiraStateRepository,
  phone: string,
  state: Omit<VoucherConfirmState, 'expires_at' | 'reminder_sent'>,
): Promise<{ ok: boolean; expiresAt?: string }> {
  const expiresAt = new Date(Date.now() + TTL_VOUCHER_CONFIRM_MIN * 60 * 1000).toISOString()
  const result = await miraState.set(
    phone,
    STATE_KEY.VOUCHER_CONFIRM,
    {
      ...state,
      expires_at: expiresAt,
      reminder_sent: false,
    },
    TTL_VOUCHER_CONFIRM_MIN,
  )
  return { ok: result.ok, expiresAt: result.expiresAt }
}

export async function clearVoucherConfirmState(
  miraState: MiraStateRepository,
  phone: string,
): Promise<void> {
  await miraState.clear(phone, STATE_KEY.VOUCHER_CONFIRM)
}
