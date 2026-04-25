/**
 * Handler contract · cada handler retorna { replyText, actions, stateTransitions }.
 *
 * - replyText: msg que a Mira responde direto pro phone que originou (parceira/admin)
 * - actions:   side-effects · sendText pra outro phone (ex: voucher pra recipient
 *              via Mih), RPC call, etc.
 * - stateTransitions: lista de mira_state_set/clear pra aplicar atomicamente
 */

import type { Intent } from '../intent-classifier'
import type { Role } from '../role-resolver'
import type { MiraRepos } from '@/lib/repos'

export interface HandlerContext {
  clinicId: string
  phone: string
  role: Role
  text: string
  intent: Intent
  repos: MiraRepos
  pushName: string | null
}

export interface HandlerAction {
  kind: 'send_wa'
  to: string
  via: 'mira' | 'mih'
  content: string
  eventKey?: string
  recipientRole?: 'partner' | 'beneficiary' | 'admin' | 'unknown'
}

export interface StateTransition {
  op: 'set' | 'clear'
  key: string
  value?: Record<string, unknown> | null
  ttlMinutes?: number
}

export interface HandlerResult {
  replyText: string
  actions: HandlerAction[]
  stateTransitions: StateTransition[]
  meta?: Record<string, unknown>
}

export type Handler = (ctx: HandlerContext) => Promise<HandlerResult>
