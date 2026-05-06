/**
 * GET /api/cron/wa-chat-sync · sincroniza wa_chat_mirror com Evolution.
 *
 * Sincroniza apenas wa_number_id Mih (escopo Commit 1 · mig 133).
 * Próximos commits: parametrizar por todos os wa_numbers ativos com
 * Evolution adapter + integrar com /api/conversations + UI.
 *
 * Auth: header `x-cron-secret` ou `Authorization: Bearer <secret>` ·
 * timing-safe via @clinicai/utils. Aceita WA_CHAT_SYNC_SECRET (preferido)
 * ou CRON_SECRET (fallback).
 *
 * Pipeline:
 *   1. Busca wa_number Mih · pega api_url, api_key, instance_id
 *   2. EvolutionService.findChats() · POST /chat/findChats/Mih body {}
 *   3. Normaliza cada item (apps/lara/lib/wa-chat-sync/normalize-chat.ts)
 *   4. UPSERT batch em wa_chat_mirror por (clinic_id, wa_number_id, remote_jid)
 *   5. Retorna JSON com counts e sample top 10
 *
 * Idempotente · UPSERT preserva created_at original via DO UPDATE com
 * coalesce. raw_chat é sobrescrito (snapshot mais recente).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { EvolutionService } from '@clinicai/whatsapp'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger } from '@clinicai/logger'
import {
  normalizeEvolutionChat,
  type NormalizedChat,
  type RemoteKind,
} from '@/lib/wa-chat-sync/normalize-chat'

const log = createLogger({ app: 'lara' })

export const dynamic = 'force-dynamic'

// Escopo Commit 1: hardcode Mih · mig 851 documenta este wa_number_id
const MIH_WA_NUMBER_ID = 'ead8a6f9-6e0e-4a89-8268-155392794f69'

const UPSERT_BATCH_SIZE = 200

interface SyncResultLog {
  ok: boolean
  wa_number_id: string
  total_received: number
  total_normalized: number
  total_skipped_missing_jid: number
  total_upserted: number
  counts_by_remote_kind: Record<RemoteKind, number>
  max_last_message_at: string | null
  sample_top_10: Array<{
    rank: number
    remote_jid: string
    remote_kind: RemoteKind
    display_name: string | null
    push_name: string | null
    unread_count: number
    last_message_at: string
    last_message_text: string | null
    last_message_from_me: boolean | null
  }>
  errors?: string[]
}

export async function GET(req: NextRequest) {
  const reject =
    validateCronSecret(req, 'WA_CHAT_SYNC_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET')
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  const supabase = createServerClient()

  // 1. Resolve wa_number Mih · creds Evolution
  const { data: waRow, error: waErr } = await supabase
    .from('wa_numbers')
    .select('id, clinic_id, instance_id, api_url, api_key, is_active, inbox_role')
    .eq('id', MIH_WA_NUMBER_ID)
    .maybeSingle()

  if (waErr || !waRow) {
    log.error({ wa_number_id: MIH_WA_NUMBER_ID, err: waErr?.message }, 'wa_chat_sync.wa_number.miss')
    return NextResponse.json(
      { ok: false, error: 'wa_number_not_found', wa_number_id: MIH_WA_NUMBER_ID },
      { status: 404 },
    )
  }

  if (!waRow.is_active) {
    return NextResponse.json(
      { ok: false, error: 'wa_number_inactive', wa_number_id: MIH_WA_NUMBER_ID },
      { status: 409 },
    )
  }

  if (!waRow.api_url || !waRow.api_key || !waRow.instance_id) {
    return NextResponse.json(
      { ok: false, error: 'wa_number_creds_missing', wa_number_id: MIH_WA_NUMBER_ID },
      { status: 500 },
    )
  }

  // 2. findChats
  let raw: unknown[] = []
  try {
    const evo = new EvolutionService({
      apiUrl: String(waRow.api_url),
      apiKey: String(waRow.api_key),
      instance: String(waRow.instance_id),
    })
    raw = await evo.findChats()
  } catch (err) {
    log.error(
      { wa_number_id: MIH_WA_NUMBER_ID, err: (err as Error)?.message },
      'wa_chat_sync.findChats.failed',
    )
    return NextResponse.json(
      { ok: false, error: 'findChats_failed', detail: (err as Error)?.message?.slice(0, 300) },
      { status: 502 },
    )
  }

  // 3. Normaliza
  const normalized: NormalizedChat[] = []
  let skippedMissingJid = 0
  for (const item of raw) {
    const n = normalizeEvolutionChat(item)
    if (!n) {
      skippedMissingJid++
      continue
    }
    normalized.push(n)
  }

  // 4. UPSERT em batches
  const errors: string[] = []
  let upserted = 0
  for (let i = 0; i < normalized.length; i += UPSERT_BATCH_SIZE) {
    const batch = normalized.slice(i, i + UPSERT_BATCH_SIZE)
    const rows = batch.map((n) => ({
      clinic_id: waRow.clinic_id,
      wa_number_id: waRow.id,
      remote_jid: n.remote_jid,
      remote_kind: n.remote_kind,
      phone_e164: n.phone_e164,
      group_id: n.group_id,
      lid_id: n.lid_id,
      push_name: n.push_name,
      group_subject: n.group_subject,
      display_name: n.display_name,
      unread_count: n.unread_count,
      last_message_id: n.last_message_id,
      last_message_type: n.last_message_type,
      last_message_text: n.last_message_text,
      last_message_from_me: n.last_message_from_me,
      last_message_participant_jid: n.last_message_participant_jid,
      last_message_sender_pn: n.last_message_sender_pn,
      last_message_timestamp: n.last_message_timestamp,
      last_message_at: n.last_message_at,
      raw_chat: n.raw_chat,
      last_synced_at: new Date().toISOString(),
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase as any)
      .from('wa_chat_mirror')
      .upsert(rows, {
        onConflict: 'clinic_id,wa_number_id,remote_jid',
        ignoreDuplicates: false,
      })

    if (upErr) {
      const msg = `batch ${i / UPSERT_BATCH_SIZE + 1}: ${upErr.message?.slice(0, 200)}`
      errors.push(msg)
      log.error(
        { wa_number_id: MIH_WA_NUMBER_ID, batch_start: i, err: upErr.message },
        'wa_chat_sync.upsert.batch_failed',
      )
      continue
    }
    upserted += rows.length
  }

  // 5. Stats
  const countsByKind: Record<RemoteKind, number> = {
    private: 0,
    group: 0,
    lid: 0,
    unknown: 0,
  }
  let maxTs: string | null = null
  for (const n of normalized) {
    countsByKind[n.remote_kind]++
    if (!maxTs || n.last_message_at > maxTs) maxTs = n.last_message_at
  }

  const sortedSample = [...normalized]
    .sort((a, b) => (b.last_message_at > a.last_message_at ? 1 : -1))
    .slice(0, 10)
    .map((n, i) => ({
      rank: i + 1,
      remote_jid: n.remote_jid,
      remote_kind: n.remote_kind,
      display_name: n.display_name,
      push_name: n.push_name,
      unread_count: n.unread_count,
      last_message_at: n.last_message_at,
      last_message_text: n.last_message_text ? n.last_message_text.slice(0, 80) : null,
      last_message_from_me: n.last_message_from_me,
    }))

  const result: SyncResultLog = {
    ok: errors.length === 0,
    wa_number_id: MIH_WA_NUMBER_ID,
    total_received: raw.length,
    total_normalized: normalized.length,
    total_skipped_missing_jid: skippedMissingJid,
    total_upserted: upserted,
    counts_by_remote_kind: countsByKind,
    max_last_message_at: maxTs,
    sample_top_10: sortedSample,
    ...(errors.length > 0 ? { errors } : {}),
  }

  log.info(
    {
      wa_number_id: MIH_WA_NUMBER_ID,
      total_received: result.total_received,
      total_upserted: result.total_upserted,
      counts_by_remote_kind: result.counts_by_remote_kind,
      errors_count: errors.length,
    },
    'wa_chat_sync.done',
  )

  return NextResponse.json(result, { status: errors.length === 0 ? 200 : 207 })
}
