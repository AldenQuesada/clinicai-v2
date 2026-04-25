/**
 * Cron: webhook-processing-worker.
 *
 * Schedule: a cada 1min (cron `* * * * *`).
 *
 * Drena fila `webhook_processing_queue` (mig 800-11) · processa em background
 * audio download + Whisper + classify (Tier1 + Haiku) + handler dispatch +
 * Evolution reply + audit logs. Webhook entrante so faz pre-validacao + INSERT
 * + 202 Accepted (<500ms).
 *
 *   0. resetStuck(5) · resgata items 'processing' presos > 5min (worker zumbi,
 *      crash, deploy mid-flight). Loga warn + audit se reset > 0.
 *   1. pickPending(5) · marca items como 'processing' via FOR UPDATE SKIP LOCKED
 *      + SET processing_started_at (mig 800-11 · multi-worker safe).
 *   2. Pra cada item:
 *      a. Reextrai ExtractedMessage do payload jsonb (mesma fn extractEvolutionMessage)
 *      b. Roda processWebhookMessage (audio + classify + handler + reply + audit)
 *      c. OK   → webhookQueue.complete(id)
 *         erro → webhookQueue.fail(id, error) · retry < 3, senao 'failed'
 *   3. Espaca 1s entre cada item (anti-flood Evolution).
 *
 * Limite 5/min · spacing 1s = ~5s wallclock por batch · cabe folgado no
 * timeout 60s do GitHub Actions cron-fire.
 *
 * Idempotency:
 *   wa_message_id UNIQUE no enqueue (mig 800-11) ja garante 1 row por msg.
 *   Worker NAO faz dedup state (`__processed__:msgId`) porque o webhook
 *   sincrono ja faz · processo do worker e idempotente sob retry porque
 *   complete/fail tem guard WHERE status='processing'.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { extractEvolutionMessage } from '@/lib/webhook/evolution-extract'
import { processWebhookMessage } from '@/lib/webhook/process-message'
import type { Role } from '@/lib/webhook/role-resolver'
import { createLoggerWithAlerts } from '@/lib/logger-with-alerts'
import { alertSlack } from '@/lib/alerts'

export const dynamic = 'force-dynamic'

// Logger com alerts integrados (F6) · .error/.warn disparam Sentry/Slack.
const log = createLoggerWithAlerts({ app: 'mira' }).child({ cron: 'webhook-processing-worker' })

const PICK_LIMIT = 5
const SPACING_MS = 1000
const STUCK_THRESHOLD_MIN = 5
// F6 · queue >50 pending e sinal de cron nao drenando (Easypanel offline,
// rate limit Anthropic/Groq, etc) · alerta humano pra investigar.
const QUEUE_BACKLOG_THRESHOLD = 50

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  return runCron(req, 'webhook-processing-worker', async ({ repos, clinicId }) => {
    // F6 · backlog check ANTES de processar · se queue tem >50 pending,
    // cron nao esta dando conta (worker derrubado, dependencia lenta, deploy
    // travado). Alerta antes mesmo de tentar drenar.
    try {
      const pendingCount = await repos.webhookQueue.count(clinicId, {
        status: 'pending',
      })
      if (pendingCount > QUEUE_BACKLOG_THRESHOLD) {
        void alertSlack(
          `webhook_worker.queue_backlog: ${pendingCount} mensagens pending (>${QUEUE_BACKLOG_THRESHOLD})`,
          'warn',
          {
            handler: 'webhook-processing-worker',
            clinic_id: clinicId,
            pending_count: pendingCount,
            threshold: QUEUE_BACKLOG_THRESHOLD,
          },
        )
        log.warn(
          { pending_count: pendingCount, threshold: QUEUE_BACKLOG_THRESHOLD },
          'webhook_worker.queue_backlog',
        )
      }
    } catch (e) {
      // Best-effort · count nao pode quebrar o drain
      log.error({ err: e instanceof Error ? e.message : e }, 'webhook_worker.count_failed')
    }

    // Step 0 · circuit breaker (mig 800-11 anti-zumbi)
    const reset = await repos.webhookQueue.resetStuck(STUCK_THRESHOLD_MIN)
    if (reset.resetCount > 0) {
      void alertSlack(
        `webhook_worker.reset_stuck: ${reset.resetCount} items travados >${reset.thresholdMinutes}min`,
        'warn',
        {
          handler: 'webhook-processing-worker',
          clinic_id: clinicId,
          reset_count: reset.resetCount,
          threshold_minutes: reset.thresholdMinutes,
          items: reset.items,
        },
      )
      log.warn(
        {
          reset_count: reset.resetCount,
          threshold_minutes: reset.thresholdMinutes,
          items: reset.items,
        },
        'webhook_worker.reset_stuck',
      )
      try {
        await repos.waProAudit.logQuery({
          msg: {
            clinicId,
            phone: 'system:cron',
            direction: 'inbound',
            content: `webhook_worker.reset_stuck count=${reset.resetCount}`,
            intent: 'webhook_worker.reset_stuck',
            intentData: {
              reset_count: reset.resetCount,
              threshold_minutes: reset.thresholdMinutes,
              items: reset.items,
            },
            status: 'sent',
          },
          audit: {
            clinicId,
            phone: 'system:cron',
            query: 'webhook_queue_reset_stuck',
            intent: 'webhook_worker.reset_stuck',
            rpcCalled: 'webhook_queue_reset_stuck',
            success: true,
            resultSummary: `reset ${reset.resetCount} stuck items`,
          },
        })
      } catch {
        // best-effort
      }
    } else if (!reset.ok && reset.error) {
      log.error({ error: reset.error }, 'webhook_worker.reset_stuck_rpc_failed')
    }

    const picked = await repos.webhookQueue.pickPending(PICK_LIMIT)

    if (picked.length === 0) {
      return { picked: 0, completed: 0, failed: 0, skipped: 0, reset_stuck: reset.resetCount }
    }

    let completed = 0
    let failed = 0
    let skipped = 0
    let guardHits = 0

    for (let i = 0; i < picked.length; i++) {
      const item = picked[i]
      try {
        // Reextrai ExtractedMessage do payload jsonb persistido
        const extracted = extractEvolutionMessage(item.payload)
        if (!extracted.ok) {
          // Payload veio quebrado · marca skipped sem retry (item nao vai dar OK
          // em retry futuro · payload e imutavel).
          log.warn(
            {
              queue_id: item.id,
              wa_message_id: item.waMessageId,
              skip: extracted.skip,
              detail: extracted.detail,
            },
            'webhook_worker.extract_failed',
          )
          // Forca status=failed via fail() · attempts ja foi incrementado no pick
          // entao pode nao bater 3 ainda · mas como o payload e quebrado, NAO
          // queremos retry · usamos fail diretamente com attempts forcados a 3
          // via 3 calls? Opcao mais limpa: marca diretamente como skipped via UPDATE.
          // Como nao temos RPC dedicada, usamos fail() ate >= 3 attempts.
          // Pratico: marca uma vez · se persistir, proxima rodada vai eventually
          // virar failed apos 3 attempts.
          await repos.webhookQueue.fail(item.id, `extract_failed:${extracted.skip}`)
          skipped++
          continue
        }

        const msg = extracted.msg

        // Role veio pre-resolvido pelo webhook sincrono · evita query DB.
        // Caso (legacy/edge) role venha null no payload, marca como skipped:
        // Mira NUNCA responde unknown.
        const role: Role = item.role ?? null
        if (role === null) {
          log.info(
            { queue_id: item.id, wa_message_id: item.waMessageId, phone: msg.phone },
            'webhook_worker.unauthorized_phone_silent',
          )
          await repos.webhookQueue.complete(item.id) // marca done, nao retenta
          skipped++
          continue
        }

        const t0 = Date.now()
        const result = await processWebhookMessage({
          clinicId,
          msg,
          role,
          repos,
          startedAtMs: t0,
        })

        if (!result.ok) {
          failed++
          const errMsg = result.error ?? 'process_unknown_error'
          const f = await repos.webhookQueue.fail(item.id, errMsg)
          if (!f.ok) {
            guardHits++
            log.error(
              {
                queue_id: item.id,
                wa_message_id: item.waMessageId,
                attempts: item.attempts,
                error: f.error,
                current_status: f.currentStatus,
                original_error: errMsg,
              },
              'webhook_worker.fail_guard_hit',
            )
          } else {
            log.warn(
              {
                queue_id: item.id,
                wa_message_id: item.waMessageId,
                attempts: item.attempts,
                new_status: f.newStatus,
                error: errMsg,
              },
              'webhook_worker.item.failed',
            )
          }
        } else {
          const c = await repos.webhookQueue.complete(item.id)
          if (c.ok) {
            completed++
            log.info(
              {
                queue_id: item.id,
                wa_message_id: item.waMessageId,
                phone: msg.phone,
                role,
                intent: result.intent,
                skip: result.skip,
                response_ms: result.responseMs,
                transcribed: result.transcribed,
                actions_count: result.actionsCount,
              },
              'webhook_worker.item.completed',
            )
          } else {
            // Idempotency guard hit · status mudou (race com reset_stuck)
            guardHits++
            log.error(
              {
                queue_id: item.id,
                wa_message_id: item.waMessageId,
                error: c.error,
                current_status: c.currentStatus,
              },
              'webhook_worker.complete_guard_hit',
            )
          }
        }
      } catch (err) {
        failed++
        const errMsg = err instanceof Error ? err.message : String(err)
        try {
          await repos.webhookQueue.fail(item.id, `worker_exception:${errMsg}`)
        } catch (failErr) {
          log.error(
            { queue_id: item.id, err: failErr },
            'webhook_worker.fail_rpc_exception',
          )
        }
        log.error(
          {
            queue_id: item.id,
            wa_message_id: item.waMessageId,
            err: errMsg,
          },
          'webhook_worker.item.exception',
        )
      }

      // Anti-flood: 1s entre items (exceto apos o ultimo)
      if (i < picked.length - 1) {
        await sleep(SPACING_MS)
      }
    }

    log.info(
      {
        picked: picked.length,
        completed,
        failed,
        skipped,
        guard_hits: guardHits,
        reset_stuck: reset.resetCount,
      },
      'webhook_worker.batch.processed',
    )

    return {
      picked: picked.length,
      completed,
      failed,
      skipped,
      guard_hits: guardHits,
      reset_stuck: reset.resetCount,
    }
  })
}
