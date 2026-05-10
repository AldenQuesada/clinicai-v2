/**
 * POST /api/cron/cross-instance-media-hydrate · P7 · 2026-05-10.
 *
 * Hidrata media_url em wa_messages que vieram via cross-instance bridge
 * (payload.kind='cross_device_echo' · ver mig 0872) e ainda não têm o
 * arquivo no Storage. Baixa via Evolution API da source_instance + faz
 * upload no bucket 'media' usando o padrão canônico mediaPaths.
 *
 * MOTIVAÇÃO · incidente A567 (2026-05-10 13:31 BRT):
 *   Imagem da Mih → Alden bridge'd via mig 0872 entrou em wa_messages
 *   mas media_url=null · dash mostra só "[imagem enviada]" sem renderizar.
 *   Outras imagens evolution têm caminho '<clinic>/wa-evolution/pending/
 *   <uuid>.jpg' no Storage. Este endpoint replica esse padrão pra
 *   mensagens cross-device.
 *
 * AUTH fail-CLOSED · dedicado · NÃO compartilha com CRON_SECRET.
 *   header `x-cron-secret` + env `CROSS_DEVICE_MEDIA_HYDRATE_SECRET`.
 *
 * BODY (POST · application/json):
 *   { message_id?: uuid, queue_id?: uuid }
 *   Pelo menos UM dos dois · queue_id preferido (vai direto pro Evolution).
 *
 * REGRAS:
 *   - Só processa rows com payload.kind='cross_device_echo'
 *   - Só processa content_type IN (image, audio, video, sticker, document)
 *   - Só processa media_url IS NULL (idempotência)
 *   - Resolve source instance via payload.source_instance_id +
 *     wa_numbers preferindo has_evolution_config + clinic_official
 *   - Chama EvolutionService.downloadMedia com key do payload original
 *   - Upload pro bucket 'media' · path `<clinic_id>/wa-evolution/<conv_id>/<uuid>.<ext>`
 *   - Atualiza media_url + payload.media_hydrated=true + metadata
 *   - NUNCA loga/retorna base64
 *   - NUNCA loga/retorna api_key
 *   - NUNCA retorna payload bruto da queue
 *   - NUNCA altera mensagens fora do bridge cross_device_echo
 *   - NUNCA muda content_type/content/direction (só media_url + payload)
 */

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createServerClient } from '@/lib/supabase'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger } from '@clinicai/logger'
import { EvolutionService } from '@clinicai/whatsapp'
import { mediaPaths } from '@clinicai/supabase'

const log = createLogger({ app: 'lara' })

export const dynamic = 'force-dynamic'

// MIME → extensão · cobre os tipos que Evolution costuma entregar
function mimeToExt(mime: string | null, contentType: string): string {
  const m = (mime || '').toLowerCase()
  if (m.includes('image/png')) return 'png'
  if (m.includes('image/webp')) return 'webp'
  if (m.includes('image/gif')) return 'gif'
  if (m.includes('image')) return 'jpg'
  if (m.includes('audio/ogg')) return 'ogg'
  if (m.includes('audio/mpeg') || m.includes('audio/mp3')) return 'mp3'
  if (m.includes('audio/mp4')) return 'm4a'
  if (m.includes('audio')) return 'ogg'
  if (m.includes('video/mp4')) return 'mp4'
  if (m.includes('video')) return 'mp4'
  if (m.includes('pdf')) return 'pdf'
  // fallback por content_type da row
  if (contentType === 'image' || contentType === 'sticker') return 'jpg'
  if (contentType === 'audio') return 'ogg'
  if (contentType === 'video') return 'mp4'
  if (contentType === 'document') return 'bin'
  return 'bin'
}

interface HydrateBody {
  message_id?: string
  queue_id?: string
}

export async function POST(req: NextRequest) {
  // 1. Auth fail-CLOSED · secret dedicado · sem fallback
  const reject = validateCronSecret(req, 'CROSS_DEVICE_MEDIA_HYDRATE_SECRET')
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  // 2. Parse body
  let body: HydrateBody
  try {
    body = (await req.json()) as HydrateBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const messageId = typeof body.message_id === 'string' ? body.message_id : ''
  const queueId = typeof body.queue_id === 'string' ? body.queue_id : ''
  if (!messageId && !queueId) {
    return NextResponse.json(
      { ok: false, error: 'missing_message_id_or_queue_id' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // 3. Resolve wa_messages row
  //    Preferência: queue_id (lookup por payload.queue_id em wa_messages)
  //    Senão: message_id direto
  let msgQuery = sb
    .from('wa_messages')
    .select('id, conversation_id, clinic_id, content_type, content, media_url, provider_msg_id, wa_message_id, payload')
    .limit(1)

  if (messageId) {
    msgQuery = msgQuery.eq('id', messageId)
  } else {
    // Lookup via payload.queue_id (JSONB) · única chave que conecta queue→message
    msgQuery = sb
      .from('wa_messages')
      .select('id, conversation_id, clinic_id, content_type, content, media_url, provider_msg_id, wa_message_id, payload')
      .eq('payload->>queue_id', queueId)
      .limit(1)
  }

  const { data: msgRows, error: msgErr } = await msgQuery
  if (msgErr) {
    return NextResponse.json(
      { ok: false, error: 'message_lookup_failed', detail: String(msgErr.message ?? msgErr).slice(0, 200) },
      { status: 500 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = (msgRows as any[])?.[0]
  if (!msg) {
    return NextResponse.json({ ok: false, error: 'message_not_found' }, { status: 404 })
  }

  // 4. Guards: only cross_device_echo, only image/audio/video/sticker/document,
  //    only media_url IS NULL
  const kind = String(msg.payload?.kind ?? '')
  if (kind !== 'cross_device_echo') {
    return NextResponse.json(
      { ok: false, error: 'not_cross_device_echo', kind },
      { status: 422 },
    )
  }
  const allowed = new Set(['image', 'audio', 'video', 'sticker', 'document'])
  if (!allowed.has(String(msg.content_type ?? ''))) {
    return NextResponse.json(
      { ok: false, error: 'content_type_not_hydratable', content_type: msg.content_type },
      { status: 422 },
    )
  }
  if (msg.media_url) {
    return NextResponse.json({
      ok: true,
      kind: 'ALREADY_HYDRATED',
      message_id: msg.id,
      provider_msg_id: msg.provider_msg_id,
      media_url: msg.media_url,
    })
  }

  // 5. Lookup queue row (precisa do payload.data.key + payload.instance original)
  const queueIdResolved: string =
    typeof msg.payload?.queue_id === 'string' ? msg.payload.queue_id : queueId
  if (!queueIdResolved) {
    return NextResponse.json(
      { ok: false, error: 'queue_id_missing_in_payload' },
      { status: 422 },
    )
  }

  const { data: qRow, error: qErr } = await sb
    .from('webhook_processing_queue')
    .select('id, source, payload')
    .eq('id', queueIdResolved)
    .maybeSingle()
  if (qErr || !qRow) {
    return NextResponse.json(
      { ok: false, error: 'queue_row_not_found', queue_id: queueIdResolved },
      { status: 404 },
    )
  }

  const sourceInstance = String(qRow.payload?.instance ?? msg.payload?.source_instance_id ?? '')
  const evoKey = qRow.payload?.data?.key ?? null
  if (!sourceInstance || !evoKey || !evoKey.id) {
    return NextResponse.json(
      { ok: false, error: 'queue_payload_missing_instance_or_key' },
      { status: 422 },
    )
  }

  // 6. Resolve wa_number da source_instance com Evolution credentials
  //    Mesma regra do source_best na view bridge (mig 0872):
  //    has_evolution_config + clinic_official + updated_at desc
  const { data: waRows } = await sb
    .from('wa_numbers')
    .select('id, instance_id, api_url, api_key, number_type, label, updated_at, is_active')
    .eq('instance_id', sourceInstance)
    .eq('is_active', true)
  const waCandidates = ((waRows as Array<Record<string, unknown>>) ?? [])
    .filter((n) => n.api_url && n.api_key)
    .sort((a, b) => {
      const aOfficial = a.number_type === 'clinic_official' ? 1 : 0
      const bOfficial = b.number_type === 'clinic_official' ? 1 : 0
      if (aOfficial !== bOfficial) return bOfficial - aOfficial
      const aUpd = a.updated_at ? new Date(String(a.updated_at)).getTime() : 0
      const bUpd = b.updated_at ? new Date(String(b.updated_at)).getTime() : 0
      return bUpd - aUpd
    })
  const sourceWa = waCandidates[0]
  if (!sourceWa) {
    return NextResponse.json(
      {
        ok: false,
        error: 'source_instance_credentials_unavailable',
        instance_id: sourceInstance,
      },
      { status: 422 },
    )
  }

  // 7. Download via Evolution API · NUNCA loga base64
  const evo = new EvolutionService({
    apiUrl: String(sourceWa.api_url),
    apiKey: String(sourceWa.api_key),
    instance: String(sourceWa.instance_id),
  })
  const dl = await evo.downloadMedia({
    remoteJid: evoKey.remoteJid,
    fromMe: !!evoKey.fromMe,
    id: evoKey.id,
  } as Record<string, unknown>)

  if (!dl) {
    log.warn(
      {
        message_id: msg.id,
        queue_id: queueIdResolved,
        instance: sourceInstance,
        content_type: msg.content_type,
      },
      'cross_device_media_hydrate.download_failed',
    )
    return NextResponse.json(
      {
        ok: false,
        error: 'evolution_download_failed',
        message_id: msg.id,
        instance: sourceInstance,
        hint:
          'Baileys session may no longer have the media decrypted in memory. ' +
          'Retry sooner after the event next time, or accept placeholder-only.',
      },
      { status: 502 },
    )
  }

  // 8. Upload pro Storage · padrão canônico mediaPaths.evolutionInbound
  //    convId AQUI é conhecido (msg.conversation_id) · não cai em 'pending'
  const ext = mimeToExt(dl.contentType, String(msg.content_type))
  const storagePath = mediaPaths.evolutionInbound(
    String(msg.clinic_id),
    String(msg.conversation_id),
    uuidv4(),
    ext,
  )

  const { error: upErr } = await sb.storage.from('media').upload(storagePath, dl.buffer, {
    contentType: dl.contentType,
    upsert: false,
  })
  if (upErr) {
    return NextResponse.json(
      {
        ok: false,
        error: 'storage_upload_failed',
        detail: String(upErr.message ?? upErr).slice(0, 200),
      },
      { status: 500 },
    )
  }

  // 9. Update wa_messages.media_url + payload metadata
  //    Apenas + . Não toca content/content_type/direction.
  const hydrationMeta = {
    media_hydrated: true,
    media_hydrated_at: new Date().toISOString(),
    media_hydration_source: 'webhook_processing_queue',
    media_hydration_version: 'p7-cross-device-media-v1',
    media_bucket: 'media',
    media_path: storagePath,
    media_mimetype: dl.contentType,
    media_size_bytes: dl.buffer.length,
    media_ext: ext,
  }
  const newPayload = { ...(msg.payload ?? {}), ...hydrationMeta }

  const { error: updErr } = await sb
    .from('wa_messages')
    .update({ media_url: storagePath, payload: newPayload })
    .eq('id', msg.id)
  if (updErr) {
    return NextResponse.json(
      {
        ok: false,
        error: 'wa_messages_update_failed',
        detail: String(updErr.message ?? updErr).slice(0, 200),
      },
      { status: 500 },
    )
  }

  log.info(
    {
      message_id: msg.id,
      conversation_id: msg.conversation_id,
      provider_msg_id: msg.provider_msg_id,
      content_type: msg.content_type,
      mimetype: dl.contentType,
      bytes: dl.buffer.length,
      // NUNCA log base64 · não inclui dl.base64 nem dl.buffer
    },
    'cross_device_media_hydrate.success',
  )

  return NextResponse.json({
    ok: true,
    kind: 'HYDRATED',
    message_id: msg.id,
    provider_msg_id: msg.provider_msg_id,
    conversation_id: msg.conversation_id,
    media_url: storagePath,
    content_type: msg.content_type,
    mimetype: dl.contentType,
    bytes: dl.buffer.length,
  })
}
