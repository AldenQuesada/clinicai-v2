/**
 * Role resolver · admin vs partner vs unknown.
 *
 * Hierarquia (mesma do clinic-dashboard b2b-mira-inbound):
 *   1. wa_numbers (number_type=professional_private, is_active=true) → admin
 *   2. b2b_partnership_wa_senders (active=true, last8 match) → partner
 *   3. nada → null (silent ignore · GOLD ALDEN: Mira nunca responde unknown)
 *
 * Match por last8 (BR phone com/sem 9 inicial · cobre LID Evolution sem 9).
 *
 * Fail-closed: erro de DB → null (defensivo · evita responder estranho).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger, hashPhone } from '@clinicai/logger'
import type { B2BWASenderRepository } from '@clinicai/repositories'

const log = createLogger({ app: 'mira' })

export type Role = 'admin' | 'partner' | null

function last11(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-11)
}

function last8(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-8)
}

export async function resolveRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  b2bSenders: B2BWASenderRepository,
  clinicId: string,
  phone: string,
): Promise<Role> {
  const phoneLast11 = last11(phone)
  const phoneLast8 = last8(phone)

  if (!phoneLast8) return null

  try {
    // ── 1. admin via wa_numbers ─────────────────────────────────────────
    // Fonte canonica: wa_numbers.number_type='professional_private', is_active=true.
    // Match por last11 OU last8 (cobre formatos 12d/13d/14d).
    const { data: waRows } = await supabase
      .from('wa_numbers')
      .select('phone')
      .eq('is_active', true)
      .eq('number_type', 'professional_private')

    if (Array.isArray(waRows)) {
      for (const row of waRows) {
        const rowPhone = String((row as { phone?: string })?.phone ?? '')
        if (last11(rowPhone) === phoneLast11 || last8(rowPhone) === phoneLast8) {
          return 'admin'
        }
      }
    }

    // ── 2. partner via b2b_partnership_wa_senders ───────────────────────
    const sender = await b2bSenders.findByPhone(clinicId, phone)
    if (sender) return 'partner'

    return null
  } catch (err) {
    log.warn({ err, phoneHash: hashPhone(phone) }, 'mira.resolveRole.fail_closed')
    return null
  }
}
