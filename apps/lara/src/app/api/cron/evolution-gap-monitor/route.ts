/**
 * GET /api/cron/evolution-gap-monitor · P7.2 · 2026-05-10.
 *
 * Health-check read-only que detecta GAP de eventos `MESSAGES_UPSERT` da
 * instance Evolution Mih em horário comercial BRT (08:00–19:00 seg–sáb).
 *
 * Motivação · incidente Arildo 2026-05-10:
 *   Mih estava `connectionState=open` MAS sem receber events por 1h25min.
 *   Sessão Baileys "zombie" · API responde OK · WebSocket WA Web morto.
 *   Resultado: figurinha do Arildo (11:20 BRT) nunca chegou à Evolution.
 *   Monitor olha FLUXO DE EVENTOS real, não só state · cobre esse modo.
 *
 * Read-only:
 *   - SOMENTE SELECTs em wa_webhook_log + wa_numbers
 *   - NÃO chama Evolution API (não decide restart)
 *   - NÃO escreve em wa_messages / wa_conversations / wa_pending_*
 *   - NÃO envia mensagem
 *   - NÃO toca crons existentes
 *
 * Auth fail-CLOSED:
 *   header `x-cron-secret` · secret dedicado EVOLUTION_GAP_MONITOR_SECRET
 *   (fallback CRON_SECRET pra compat com schedule existente sem rotação).
 *
 * Comportamento:
 *   - Horário comercial BRT (seg–sáb 08:00–18:59) · monitor ativo.
 *   - Fora · status=skipped · não dispara fail (Mih ociosa de manhã cedo
 *     ou domingo é esperado · alerta seria ruído).
 *   - Em horário comercial: se último `evo:event_messages_upsert` > 30min,
 *     status=problem + verdict=FAIL_EVOLUTION_MIH_EVENT_GAP_DETECTED.
 *
 * Auto-restart: NÃO implementado neste patch · só alerta via JSON.
 *   Flag stub: process.env.EVOLUTION_GAP_MONITOR_AUTO_RESTART (default false).
 *   Mesmo se true, ainda exige EVOLUTION_GAP_MONITOR_ALLOW_RESTART_MIH=true.
 *   Reservado pra P7.2.1 quando houver guardrail completo (cooldown,
 *   dedup do restart, audit log do trigger).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'lara' })

export const dynamic = 'force-dynamic'

// ── Constantes operacionais ───────────────────────────────────────────
const INSTANCE_ID = 'Mih'
const GAP_THRESHOLD_MIN = 30
const COMMERCIAL_HOUR_START = 8 // BRT · inclusive
const COMMERCIAL_HOUR_END = 19 // BRT · exclusive (até 18:59)
const COMMERCIAL_DAYS = new Set([1, 2, 3, 4, 5, 6]) // Mon–Sat (0=Sun)

type Status = 'ok' | 'problem' | 'skipped'
type Verdict =
  | 'PASS_EVOLUTION_MIH_EVENT_FLOW_HEALTHY'
  | 'FAIL_EVOLUTION_MIH_EVENT_GAP_DETECTED'
  | 'SKIP_OUTSIDE_COMMERCIAL_HOURS'
  | 'FAIL_EVOLUTION_MIH_NO_RECENT_EVENT'

/**
 * BRT é UTC-3 fixo (Brasil sem DST desde 2019). Converte Date UTC → BRT.
 */
function toBrt(d: Date): Date {
  return new Date(d.getTime() - 3 * 3600 * 1000)
}

function isCommercialHoursBrt(now: Date): {
  isHours: boolean
  brt_iso: string
  day_of_week: number
  hour: number
} {
  const brt = toBrt(now)
  const day_of_week = brt.getUTCDay()
  const hour = brt.getUTCHours()
  const isHours =
    COMMERCIAL_DAYS.has(day_of_week) &&
    hour >= COMMERCIAL_HOUR_START &&
    hour < COMMERCIAL_HOUR_END
  return {
    isHours,
    brt_iso: brt.toISOString().replace('Z', '-03:00'),
    day_of_week,
    hour,
  }
}

export async function GET(req: NextRequest) {
  // Auth fail-CLOSED · prefer EVOLUTION_GAP_MONITOR_SECRET · fallback CRON_SECRET
  const reject =
    validateCronSecret(req, 'EVOLUTION_GAP_MONITOR_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET')
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  const now = new Date()
  const commercial = isCommercialHoursBrt(now)

  log.info(
    {
      instance_id: INSTANCE_ID,
      commercial_hours: commercial.isHours,
      hour_brt: commercial.hour,
      dow: commercial.day_of_week,
    },
    'evolution_gap_monitor.started',
  )

  const supabase = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // ── 1. wa_numbers metadata da Mih ───────────────────────────────────
  const { data: waNumberRow } = await sb
    .from('wa_numbers')
    .select('id, phone, label, inbox_role, default_context_type, is_active')
    .eq('instance_id', INSTANCE_ID)
    .eq('is_active', true)
    .maybeSingle()

  const wa_number_id = (waNumberRow?.id as string) ?? null
  const wa_number_phone = (waNumberRow?.phone as string) ?? null
  const wa_number_label = (waNumberRow?.label as string) ?? null

  // ── 2. Last event_messages_upsert (24h window) ──────────────────────
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data: lastRow } = await sb
    .from('wa_webhook_log')
    .select('hit_at')
    .eq('endpoint', '/api/webhook/whatsapp-evolution')
    .eq('phone_number_id', INSTANCE_ID)
    .eq('signature_reason', 'evo:event_messages_upsert')
    .gte('hit_at', since24h)
    .order('hit_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const last_event_at = (lastRow?.hit_at as string) ?? null
  const last_event_date = last_event_at ? new Date(last_event_at) : null
  const gap_ms = last_event_date ? now.getTime() - last_event_date.getTime() : null
  const gap_minutes = gap_ms !== null ? Math.floor(gap_ms / 60000) : null

  // ── 3. Counts de eventos em janelas curtas (paralelo) ───────────────
  const since30m = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const since60m = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

  const [count30Res, count60Res, inbound60Res, outbound60Res] = await Promise.all([
    sb
      .from('wa_webhook_log')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', '/api/webhook/whatsapp-evolution')
      .eq('phone_number_id', INSTANCE_ID)
      .eq('signature_reason', 'evo:event_messages_upsert')
      .gte('hit_at', since30m),
    sb
      .from('wa_webhook_log')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', '/api/webhook/whatsapp-evolution')
      .eq('phone_number_id', INSTANCE_ID)
      .eq('signature_reason', 'evo:event_messages_upsert')
      .gte('hit_at', since60m),
    sb
      .from('wa_webhook_log')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', '/api/webhook/whatsapp-evolution')
      .eq('phone_number_id', INSTANCE_ID)
      .eq('signature_reason', 'evo:terminal_persisted_inbound')
      .gte('hit_at', since60m),
    sb
      .from('wa_webhook_log')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', '/api/webhook/whatsapp-evolution')
      .eq('phone_number_id', INSTANCE_ID)
      .eq('signature_reason', 'evo:terminal_persisted_outbound')
      .gte('hit_at', since60m),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cnt = (r: any): number => (typeof r?.count === 'number' ? r.count : 0)
  const event_count_last_30m = cnt(count30Res)
  const event_count_last_60m = cnt(count60Res)
  const inbound_count_last_60m = cnt(inbound60Res)
  const outbound_count_last_60m = cnt(outbound60Res)

  // ── 4. Decide status + verdict + action ─────────────────────────────
  let status: Status
  let verdict: Verdict
  let action: 'none' | 'manual_restart_recommended' = 'none'

  if (!commercial.isHours) {
    status = 'skipped'
    verdict = 'SKIP_OUTSIDE_COMMERCIAL_HOURS'
  } else if (gap_minutes === null) {
    // Sem evento nenhum em 24h em horário comercial · sintoma muito ruim
    status = 'problem'
    verdict = 'FAIL_EVOLUTION_MIH_NO_RECENT_EVENT'
    action = 'manual_restart_recommended'
  } else if (gap_minutes >= GAP_THRESHOLD_MIN) {
    status = 'problem'
    verdict = 'FAIL_EVOLUTION_MIH_EVENT_GAP_DETECTED'
    action = 'manual_restart_recommended'
  } else {
    status = 'ok'
    verdict = 'PASS_EVOLUTION_MIH_EVENT_FLOW_HEALTHY'
  }

  // ── 5. Auto-restart stub (NÃO ATIVO neste patch) ────────────────────
  // Reservado pra P7.2.1 · requer 2 flags + cooldown + audit. Hoje:
  //   - default off (env ausente == false)
  //   - se on, ainda checa segunda flag · se any missing, log warn + skip
  const autoRestartFlag =
    process.env.EVOLUTION_GAP_MONITOR_AUTO_RESTART === 'true'
  const allowRestartMihFlag =
    process.env.EVOLUTION_GAP_MONITOR_ALLOW_RESTART_MIH === 'true'
  const auto_restart_armed = autoRestartFlag && allowRestartMihFlag
  if (autoRestartFlag && !allowRestartMihFlag) {
    log.warn(
      { instance_id: INSTANCE_ID },
      'evolution_gap_monitor.auto_restart.partial_flag_only_first',
    )
  }

  log.info(
    {
      instance_id: INSTANCE_ID,
      status,
      verdict,
      gap_minutes,
      event_count_last_30m,
      event_count_last_60m,
      commercial_hours: commercial.isHours,
      auto_restart_armed,
    },
    'evolution_gap_monitor.summary',
  )

  return NextResponse.json({
    ok: true,
    monitor: 'evolution-gap-monitor',
    instance: INSTANCE_ID,
    wa_number_id,
    phone: wa_number_phone,
    label: wa_number_label,
    status,
    verdict,
    now_utc: now.toISOString(),
    now_brt: commercial.brt_iso,
    last_event_messages_upsert_at: last_event_at,
    last_event_messages_upsert_brt: last_event_date
      ? toBrt(last_event_date).toISOString().replace('Z', '-03:00')
      : null,
    gap_minutes,
    threshold_minutes: GAP_THRESHOLD_MIN,
    commercial_hours: commercial.isHours,
    commercial_window_brt: '08:00-19:00 Mon-Sat',
    day_of_week_brt: commercial.day_of_week,
    hour_brt: commercial.hour,
    event_count_last_30m,
    event_count_last_60m,
    inbound_count_last_60m,
    outbound_count_last_60m,
    action,
    auto_restart_armed,
    notes: {
      open_but_not_receiving:
        'Evolution connectionState=open NÃO basta · este monitor olha fluxo real de event_messages_upsert (cobre Baileys zombie · ver incidente Arildo 2026-05-10).',
      recommended_response:
        action === 'manual_restart_recommended'
          ? 'POST https://evolution.aldenquesada.site/instance/restart/Mih com header apikey (api_key da row wa_numbers).'
          : 'sistema saudável · nenhuma ação necessária.',
    },
  })
}
