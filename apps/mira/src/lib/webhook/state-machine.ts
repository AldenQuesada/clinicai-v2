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
  BULK_VOUCHER_REVIEW: 'bulk_voucher_review',
  PROCESSED_PREFIX: '__processed__:',
  CP_STEP: 'cp_step',
  ADMIN_REJECT_REASON: 'admin_reject_reason',
  ADMIN_APPROVE_SELECT: 'admin_approve_select',
  ADMIN_REJECT_SELECT: 'admin_reject_select',
} as const

export const TTL_ADMIN_SELECT_MIN = 5
export const TTL_BULK_VOUCHER_REVIEW_MIN = 30

export interface VoucherConfirmState {
  partnership_id: string
  recipient_name: string
  recipient_phone: string
  recipient_first_name: string
  combo: string
  expires_at: string
  reminder_sent?: boolean
}

/**
 * State `bulk_voucher_review` · parceira mandou lista N vouchers,
 * Mira ja fez dedup pre-check em paralelo e mostrou preview · aguarda
 * SIM/NAO ou edicao de schedule. TTL 30min · igual single voucher_confirm.
 *
 * `batch_id` ja gerado aqui (uuid v4) · vai pra queue no confirm. Permite
 * audit cross-table (state preview → queue items → vouchers emitidos).
 *
 * `blocked` carrega items que bateram dedup · NAO entram na queue, sao apenas
 * exibidos no preview pra parceira saber que nao esquecemos · UI fica auto-doc.
 */
export interface BulkVoucherReviewState {
  partnership_id: string
  batch_id: string
  items: Array<{
    name: string
    phone: string
    combo?: string | null
  }>
  blocked: Array<{
    name: string
    phone: string
    dedup_hit_kind: string
    dedup_hit_msg: string
  }>
  scheduled_at: string
  expires_at: string
  schedule_hint?: string
}

export type CpStep =
  | 'menu'
  | 'name'
  | 'contact_name'
  | 'phone'
  | 'pillar'
  | 'combo'
  | 'confirm'

export interface CpStepState {
  step: CpStep
  data: Partial<{
    type: string  // 'transactional' | 'occasion' | 'institutional'
    name: string
    contact_name: string
    contact_phone: string
    pillar: string
    combo: string
    category: string
  }>
}

// Aliases pillares · transcricao de voz pode variar (Whisper PT-BR)
export const CP_PILLARS = [
  'saude', 'imagem', 'fitness', 'rede', 'evento',
  'alimentacao', 'institucional', 'status', 'outros',
] as const

export function stripAccents(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function normalizePillar(raw: string | undefined | null): string | null {
  if (!raw) return null
  const k = stripAccents(String(raw).trim())
  if ((CP_PILLARS as readonly string[]).includes(k)) return k
  if (/sa[uú]de|medic|clinic/.test(k)) return 'saude'
  if (/imagem|beleza|estetica|moda/.test(k)) return 'imagem'
  if (/fitness|academ|crossfit|esporte/.test(k)) return 'fitness'
  if (/alimen|nutric|restaur|gastron/.test(k)) return 'alimentacao'
  if (/even|festa|casamento|decor/.test(k)) return 'evento'
  if (/rede|networ|comunidad/.test(k)) return 'rede'
  if (/institu|empres/.test(k)) return 'institucional'
  if (/status|luxo|premium/.test(k)) return 'status'
  return null
}

export function isE164ish(phone: string): boolean {
  const d = String(phone || '').replace(/\D/g, '')
  return d.length >= 10 && d.length <= 13
}

export function slugify(s: string): string {
  return stripAccents(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function isAffirmative(text: string): boolean {
  const m = String(text || '').trim().toLowerCase().replace(/[!.?,]+/g, '')
  return /^(sim|s|claro|pode|emite|emitir|ok|aprovo|aprovado|confirma(do)?|confirmo|vai|manda|isso|positivo|beleza|uhum|aham)$/i.test(m)
}

export function isNegative(text: string): boolean {
  const m = String(text || '').trim().toLowerCase().replace(/[!.?,]+/g, '')
  return /^(nao|não|n|esquece|esquec[ae]|cancela|cancelar|deixa|para|pare|stop|errado|errou|negativo)$/i.test(m)
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
