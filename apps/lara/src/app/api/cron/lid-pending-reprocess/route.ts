/**
 * POST /api/cron/lid-pending-reprocess · drena pending @lid events com
 * exatamente 1 conversa resolvível.
 *
 * Step 11D.1 (2026-05-10) · reprocessador idempotente mínimo.
 *
 * Auth: header `x-cron-secret` ou `Authorization: Bearer <secret>` ·
 * timing-safe via @clinicai/utils. Aceita WA_LID_REPROCESS_SECRET
 * (preferido) ou CRON_SECRET (fallback).
 *
 * Body JSON: { dry_run: boolean (default true), limit: number (1-50, default 20) }
 *
 * Pipeline por linha:
 *   1. Idempotência · check provider_msg_id em wa_messages
 *      → match: marca pending status='duplicate' + resolved_*
 *   2. Lookup conv (clinic_id, wa_number_id, remote_jid, deleted_at NULL) LIMIT 2
 *      → 0 convs : kept_pending_no_conversation · attempts++
 *      → ≥2 convs: kept_pending_ambiguous · attempts++
 *      → 1 conv  : drain via MessageRepository.saveInbound/saveOutbound
 *   3. drain bem-sucedido · UPDATE pending status='drained' + resolved_*
 *
 * Idempotência:
 *   - MessageRepository.saveInbound/saveOutbound trata 23505 e retorna o id
 *     existente · não duplica wa_messages.
 *   - sent_at canonical = pending.message_timestamp (NUNCA hit_at).
 *   - Sem message_timestamp → invalid_payload (mantém pending).
 *
 * Não cria phone fake. Não cria lead fake. Não toca conv/mirror além do
 * comportamento já existente em saveInbound/saveOutbound.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger } from '@clinicai/logger'
import { makeRepos } from '@/lib/repos'

const log = createLogger({ app: 'lara' })

export const dynamic = 'force-dynamic'

interface PendingRow {
  id: string
  clinic_id: string
  wa_number_id: string | null
  provider_msg_id: string
  remote_jid: string
  from_me: boolean
  sender_pn: string | null
  message_type: string | null
  content_preview: string | null
  message_timestamp: string | null
  message_timestamp_epoch: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_body: any
  reason: string
  status: string
  attempts: number
}

type Classification =
  | 'would_drain'
  | 'drained'
  | 'would_duplicate'
  | 'duplicate'
  | 'no_conversation_match'
  | 'ambiguous_conversation_match'
  | 'invalid_payload'
  | 'error'

interface ProcessedItem {
  id: string
  provider_msg_id: string
  remote_jid: string
  classification: Classification
  conversation_id?: string | null
  message_id?: string | null
  reason?: string
}

// Extrai content + contentType do raw_body Evolution · espelha lógica do
// webhook (route.ts ~411-466) · SEM media download (reprocesso só persiste
// metadata; mídia já está no payload bruto, UI ressalva on-demand).
function extractContent(rawBody: unknown): { content: string; contentType: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (rawBody as any)?.data ?? {}
  const msg = (data?.message ?? {}) as Record<string, unknown>

  const text =
    (msg?.conversation as string | undefined) ||
    ((msg?.extendedTextMessage as { text?: string } | undefined)?.text) ||
    ((msg?.imageMessage as { caption?: string } | undefined)?.caption) ||
    ((msg?.videoMessage as { caption?: string } | undefined)?.caption) ||
    ''

  let content = text
  let contentType = 'text'

  if (msg?.audioMessage) {
    contentType = 'audio'
    if (!content) content = '[audio recebido]'
  } else if (msg?.imageMessage) {
    contentType = 'image'
    if (!content) content = '[imagem recebida]'
  } else if (msg?.videoMessage) {
    contentType = 'video'
    if (!content) content = '[video recebido]'
  } else if (msg?.stickerMessage) {
    contentType = 'sticker'
    content = '[sticker recebido]'
  } else if (msg?.documentMessage) {
    contentType = 'document'
    content = '[documento recebido]'
  }

  return { content, contentType }
}

export async function POST(req: NextRequest) {
  // Auth fail-CLOSED · timing-safe · WA_LID_REPROCESS_SECRET preferido,
  // CRON_SECRET fallback.
  const reject =
    validateCronSecret(req, 'WA_LID_REPROCESS_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET')
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* default */
  }

  // dry_run default = true (segurança)
  const dry_run = body?.dry_run !== false
  const limitRaw = Number(body?.limit ?? 20)
  const limit = Math.max(
    1,
    Math.min(50, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 20),
  )

  log.info({ dry_run, limit }, 'pending_lid_reprocess.started')

  const supabase = createServerClient()

  // Pega N rows pending · ORDER BY created_at ASC (mais antigas primeiro)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: fetchErr } = await (supabase as any)
    .from('wa_pending_lid_events')
    .select(
      'id, clinic_id, wa_number_id, provider_msg_id, remote_jid, from_me, sender_pn, ' +
        'message_type, content_preview, message_timestamp, message_timestamp_epoch, ' +
        'raw_body, reason, status, attempts',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (fetchErr) {
    log.error({ err: fetchErr.message }, 'pending_lid_reprocess.fetch_failed')
    return NextResponse.json(
      { ok: false, error: 'fetch_failed', detail: fetchErr.message },
      { status: 500 },
    )
  }

  const pendings = (rows ?? []) as PendingRow[]
  const items: ProcessedItem[] = []
  let drained = 0
  let duplicates = 0
  let kept_pending_no_conversation = 0
  let kept_pending_ambiguous = 0
  let failed = 0

  const repos = makeRepos(supabase)

  for (const p of pendings) {
    try {
      // 1. IDEMPOTÊNCIA · provider_msg_id em wa_messages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: byProvider } = await (supabase as any)
        .from('wa_messages')
        .select('id, conversation_id')
        .eq('clinic_id', p.clinic_id)
        .eq('provider_msg_id', p.provider_msg_id)
        .is('deleted_at', null)
        .maybeSingle()
      let existingMsg = byProvider as { id: string; conversation_id: string | null } | null
      if (!existingMsg) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: byWaMsg } = await (supabase as any)
          .from('wa_messages')
          .select('id, conversation_id')
          .eq('clinic_id', p.clinic_id)
          .eq('wa_message_id', p.provider_msg_id)
          .is('deleted_at', null)
          .maybeSingle()
        existingMsg = byWaMsg as { id: string; conversation_id: string | null } | null
      }

      if (existingMsg?.id) {
        items.push({
          id: p.id,
          provider_msg_id: p.provider_msg_id,
          remote_jid: p.remote_jid,
          classification: dry_run ? 'would_duplicate' : 'duplicate',
          conversation_id: existingMsg.conversation_id ?? null,
          message_id: existingMsg.id,
        })
        duplicates++
        if (!dry_run) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('wa_pending_lid_events')
            .update({
              status: 'duplicate',
              resolved_message_id: existingMsg.id,
              resolved_conversation_id: existingMsg.conversation_id ?? null,
              resolved_at: new Date().toISOString(),
              attempts: p.attempts + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', p.id)
          log.info(
            { pending_id: p.id, message_id: existingMsg.id },
            'pending_lid_reprocess.duplicate',
          )
        } else {
          log.info(
            { pending_id: p.id, would_duplicate_msg: existingMsg.id },
            'pending_lid_reprocess.dry_run.would_duplicate',
          )
        }
        continue
      }

      // 2. LOOKUP CONVERSA · clinic_id + remote_jid + (wa_number_id se presente)
      //    LIMIT 2 pra detectar ambiguidade.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let convQuery = (supabase as any)
        .from('wa_conversations')
        .select('id, lead_id, phone, wa_number_id, remote_jid')
        .eq('clinic_id', p.clinic_id)
        .eq('remote_jid', p.remote_jid)
        .is('deleted_at', null)
      if (p.wa_number_id) convQuery = convQuery.eq('wa_number_id', p.wa_number_id)
      const { data: convsRaw } = await convQuery.limit(2)
      const convs = (convsRaw ?? []) as Array<{
        id: string
        lead_id: string | null
        phone: string | null
        wa_number_id: string | null
      }>
      const convCount = convs.length

      if (convCount === 0) {
        items.push({
          id: p.id,
          provider_msg_id: p.provider_msg_id,
          remote_jid: p.remote_jid,
          classification: 'no_conversation_match',
        })
        kept_pending_no_conversation++
        if (!dry_run) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('wa_pending_lid_events')
            .update({
              attempts: p.attempts + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', p.id)
          log.info(
            { pending_id: p.id },
            'pending_lid_reprocess.kept_pending_no_conversation',
          )
        }
        continue
      }

      if (convCount >= 2) {
        items.push({
          id: p.id,
          provider_msg_id: p.provider_msg_id,
          remote_jid: p.remote_jid,
          classification: 'ambiguous_conversation_match',
          reason: 'n_convs=' + convCount,
        })
        kept_pending_ambiguous++
        if (!dry_run) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('wa_pending_lid_events')
            .update({
              attempts: p.attempts + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', p.id)
          log.info(
            { pending_id: p.id, n_convs: convCount },
            'pending_lid_reprocess.kept_pending_ambiguous',
          )
        }
        continue
      }

      // 3. EXATAMENTE 1 CONVERSA · pode drenar
      const conv = convs[0]

      // sent_at canonical = pending.message_timestamp · NUNCA hit_at
      // Sem message_timestamp · não inventar · marcar invalid_payload.
      const sentAt = p.message_timestamp ?? null
      if (!sentAt) {
        items.push({
          id: p.id,
          provider_msg_id: p.provider_msg_id,
          remote_jid: p.remote_jid,
          classification: 'invalid_payload',
          reason: 'no_message_timestamp',
        })
        failed++
        if (!dry_run) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('wa_pending_lid_events')
            .update({
              attempts: p.attempts + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', p.id)
          log.warn(
            { pending_id: p.id },
            'pending_lid_reprocess.invalid_payload_no_timestamp',
          )
        }
        continue
      }

      const { content, contentType } = extractContent(p.raw_body)
      // Se content vazio, fallback pra content_preview salvo · senão marca invalid.
      const finalContent = content || p.content_preview || ''
      if (!finalContent) {
        items.push({
          id: p.id,
          provider_msg_id: p.provider_msg_id,
          remote_jid: p.remote_jid,
          classification: 'invalid_payload',
          reason: 'no_content_extractable',
        })
        failed++
        if (!dry_run) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('wa_pending_lid_events')
            .update({
              attempts: p.attempts + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', p.id)
          log.warn(
            { pending_id: p.id },
            'pending_lid_reprocess.invalid_payload_no_content',
          )
        }
        continue
      }

      if (dry_run) {
        items.push({
          id: p.id,
          provider_msg_id: p.provider_msg_id,
          remote_jid: p.remote_jid,
          classification: 'would_drain',
          conversation_id: conv.id,
        })
        drained++
        log.info(
          { pending_id: p.id, would_drain_conv: conv.id, content_type: contentType },
          'pending_lid_reprocess.dry_run.would_drain',
        )
        continue
      }

      // 4. INSERT REAL via MessageRepository · idempotente (23505 catch).
      const sharedPayload = {
        kind: 'pending_lid_reprocess',
        source: 'wa_pending_lid_events',
        pending_lid_event_id: p.id,
        reason: p.reason,
      }
      let insertedId: string | null = null
      if (p.from_me) {
        // outbound device echo · padrão do branch isOutboundFromDevice no webhook
        insertedId = await repos.messages.saveOutbound(p.clinic_id, {
          conversationId: conv.id,
          sender: 'humano',
          content: finalContent,
          contentType,
          sentAt,
          status: 'sent',
          providerMsgId: p.provider_msg_id,
          waMessageId: p.provider_msg_id,
          channel: 'evolution',
          payload: sharedPayload,
        })
      } else {
        insertedId = await repos.messages.saveInbound(p.clinic_id, {
          conversationId: conv.id,
          phone: conv.phone ?? '',
          content: finalContent,
          contentType,
          sentAt,
          providerMsgId: p.provider_msg_id,
          waMessageId: p.provider_msg_id,
          channel: 'evolution',
          payload: sharedPayload,
        })
      }

      if (!insertedId) {
        items.push({
          id: p.id,
          provider_msg_id: p.provider_msg_id,
          remote_jid: p.remote_jid,
          classification: 'error',
          reason: 'save_returned_null',
        })
        failed++
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('wa_pending_lid_events')
          .update({
            attempts: p.attempts + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', p.id)
        log.warn({ pending_id: p.id }, 'pending_lid_reprocess.failed')
        continue
      }

      items.push({
        id: p.id,
        provider_msg_id: p.provider_msg_id,
        remote_jid: p.remote_jid,
        classification: 'drained',
        conversation_id: conv.id,
        message_id: insertedId,
      })
      drained++
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('wa_pending_lid_events')
        .update({
          status: 'drained',
          resolved_message_id: insertedId,
          resolved_conversation_id: conv.id,
          resolved_at: new Date().toISOString(),
          attempts: p.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', p.id)
      log.info(
        {
          pending_id: p.id,
          message_id: insertedId,
          conv_id: conv.id,
          direction: p.from_me ? 'outbound' : 'inbound',
        },
        'pending_lid_reprocess.drained',
      )
    } catch (err) {
      const errMsg = (err as Error)?.message ?? String(err)
      items.push({
        id: p.id,
        provider_msg_id: p.provider_msg_id,
        remote_jid: p.remote_jid,
        classification: 'error',
        reason: errMsg.slice(0, 80),
      })
      failed++
      log.error(
        { pending_id: p.id, err: errMsg },
        'pending_lid_reprocess.exception',
      )
      if (!dry_run) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('wa_pending_lid_events')
            .update({
              attempts: p.attempts + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', p.id)
        } catch {
          /* silent · não pode quebrar o batch */
        }
      }
    }
  }

  log.info(
    {
      dry_run,
      processed: pendings.length,
      drained,
      duplicates,
      kept_pending_no_conversation,
      kept_pending_ambiguous,
      failed,
    },
    dry_run
      ? 'pending_lid_reprocess.dry_run.summary'
      : 'pending_lid_reprocess.summary',
  )

  return NextResponse.json({
    ok: true,
    dry_run,
    limit,
    processed: pendings.length,
    drained,
    duplicates,
    kept_pending_no_conversation,
    kept_pending_ambiguous,
    failed,
    items,
  })
}
