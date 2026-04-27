/**
 * Cron worker standalone · dispara endpoints internos do mira web.
 * Roda em container separado no Easypanel · service `mira-cron`.
 *
 * Por que separado: o scheduler precisa estar UP 24/7. Se mesclado ao web,
 * crash do web tira ambos. Containers separados isolam falhas.
 *
 * Por que fetch e nao import direto dos handlers: evita acoplar este worker
 * ao runtime do Next.js (server components, edge runtime, etc) e mantem o
 * mesmo contrato dos disparadores externos (GitHub Actions, pg_cron). Se um
 * dia migrar pra outra plataforma, basta apontar a URL.
 *
 * Variaveis necessarias:
 *   MIRA_INTERNAL_URL   · URL base do mira web · default http://mira:3006
 *                         (DNS interno do Easypanel network · services do
 *                         mesmo project se enxergam pelo nome). Em dev local
 *                         usar http://localhost:3006. Em prod com fallback
 *                         publico, https://mira.miriandpaula.com.br.
 *   MIRA_CRON_SECRET    · header x-cron-secret · mesmo valor do service mira.
 *
 * Schedule: usa node-cron · padrao identico ao .github/workflows/mira-crons.yml
 * (fallback redundante · ambos disparam, endpoints sao idempotentes).
 *
 * Timezone: America/Sao_Paulo (alinha com horarios humanos dos digests/alerts).
 *
 * Logs: stdout (Easypanel captura) · formato "[cron] HH:MM:SS endpoint -> status".
 */

import cron from 'node-cron'

// ─── Config via env ────────────────────────────────────────────────
const SECRET = process.env.MIRA_CRON_SECRET ?? ''
const BASE = (process.env.MIRA_INTERNAL_URL ?? 'http://mira:3006').replace(/\/$/, '')
const TZ = process.env.MIRA_CRON_TZ ?? 'America/Sao_Paulo'
const TIMEOUT_MS = Number(process.env.MIRA_CRON_TIMEOUT_MS ?? 60_000)

if (!SECRET) {
  // Falha cedo · sem secret nao tem como autenticar contra os handlers.
  console.error('[cron] FATAL · env MIRA_CRON_SECRET nao setada · aborting')
  process.exit(1)
}

console.log(`[cron] startup · base=${BASE} tz=${TZ} timeout=${TIMEOUT_MS}ms`)

// ─── Tipo de um job agendado ────────────────────────────────────────
interface CronJob {
  schedule: string
  endpoints: string[]
  // Descricao curta · vai pro log de boot pra confirmar que tudo subiu certo.
  label: string
}

// ─── Tabela de jobs · espelha .github/workflows/mira-crons.yml ─────
//
// Nota sobre 14 endpoints distribuidos em 11 schedules: alguns schedules
// disparam multiplos endpoints na mesma janela (ex: cada minuto roda 4
// jobs), igual ao router do GitHub Actions. Mantem paridade exata.
const JOBS: CronJob[] = [
  {
    label: 'cada-minuto · state cleanup + reminder + b2b voucher dispatch + webhook queue',
    schedule: '* * * * *',
    endpoints: [
      'mira-state-cleanup',
      'mira-state-reminder-check',
      'b2b-voucher-dispatch-worker',
      'webhook-processing-worker',
    ],
  },
  {
    label: 'daily-digest · 10h SP seg-sab',
    schedule: '0 10 * * 1-6',
    endpoints: ['mira-daily-digest'],
  },
  {
    label: 'evening-digest · 23h SP seg-sab',
    schedule: '0 23 * * 1-6',
    endpoints: ['mira-evening-digest'],
  },
  {
    label: 'weekly-roundup · 10h SP segunda',
    schedule: '0 10 * * 1',
    endpoints: ['mira-weekly-roundup'],
  },
  {
    label: 'preconsult-alerts · cada 5min entre 11-23h SP seg-sab',
    schedule: '*/5 11-23 * * 1-6',
    endpoints: ['mira-preconsult-alerts'],
  },
  {
    label: 'anomaly-check · 01h SP diario',
    schedule: '0 1 * * *',
    endpoints: ['mira-anomaly-check'],
  },
  {
    label: 'birthday-alerts · 10h SP diario',
    schedule: '0 10 * * *',
    endpoints: ['mira-birthday-alerts'],
  },
  {
    label: 'task-reminders · cada 5min',
    schedule: '*/5 * * * *',
    endpoints: ['mira-task-reminders'],
  },
  {
    label: 'followup-suggestions + activity-reminders · 12h SP diario',
    schedule: '0 12 * * *',
    endpoints: ['mira-followup-suggestions', 'mira-activity-reminders'],
  },
  {
    label: 'inactivity-radar · sex 21h SP',
    schedule: '0 21 * * 5',
    endpoints: ['mira-inactivity-radar'],
  },
  {
    label: 'lara-voucher-followup · cada hora (mig 800-07/09 batch limit)',
    schedule: '0 * * * *',
    endpoints: ['lara-voucher-followup'],
  },
  {
    label: 'daily-top-insight · 08h SP diario (mig 800-20)',
    schedule: '0 8 * * *',
    endpoints: ['mira-daily-top-insight'],
  },
  {
    label: 'monthly-partner-feedback · dia 1 09h SP (mig 800-16)',
    schedule: '0 9 1 * *',
    endpoints: ['mira-monthly-partner-feedback'],
  },
  // Voucher lifecycle crons · mig 800-49 (Alden 2026-04-27 audit gap)
  {
    label: 'voucher-validity-reminder · 10h SP diario (D-3 antes expirar)',
    schedule: '0 10 * * *',
    endpoints: ['mira-voucher-validity-reminder'],
  },
  {
    label: 'voucher-expired-sweep · 02h SP diario (mark expired + dispatch)',
    schedule: '0 2 * * *',
    endpoints: ['mira-voucher-expired-sweep'],
  },
  {
    label: 'voucher-post-purchase-upsell · 14h SP diario (D+7 pos atendimento)',
    schedule: '0 14 * * *',
    endpoints: ['mira-voucher-post-purchase-upsell'],
  },
]

// ─── Disparador HTTP ───────────────────────────────────────────────
async function fireEndpoint(endpoint: string): Promise<void> {
  const url = `${BASE}/api/cron/${endpoint}`
  const ts = new Date().toISOString().slice(11, 19) // HH:MM:SS
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-cron-secret': SECRET },
      signal: ctrl.signal,
    })

    // Le um pedaco do body so pra log curto · 300 chars sao suficientes
    let bodyPreview = ''
    try {
      const text = await res.text()
      bodyPreview = text.slice(0, 300)
    } catch {
      // ignora · body opcional
    }

    if (res.ok) {
      console.log(`[cron] ${ts} ${endpoint} -> ${res.status} ${bodyPreview ? '· ' + bodyPreview : ''}`)
    } else {
      console.warn(`[cron] ${ts} ${endpoint} -> ${res.status} ${bodyPreview}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cron] ${ts} ${endpoint} -> ERROR ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

async function fireJob(job: CronJob): Promise<void> {
  // Dispara endpoints em paralelo · cada um tem seu timeout proprio.
  await Promise.allSettled(job.endpoints.map((ep) => fireEndpoint(ep)))
}

// ─── Bootstrap · agenda todos os jobs e mantem o processo vivo ─────
function bootstrap(): void {
  for (const job of JOBS) {
    if (!cron.validate(job.schedule)) {
      console.error(`[cron] schedule invalido "${job.schedule}" · job=${job.label} · aborting`)
      process.exit(1)
    }

    cron.schedule(
      job.schedule,
      () => {
        // Fire-and-forget · node-cron nao espera promise.
        void fireJob(job)
      },
      { timezone: TZ },
    )

    console.log(`[cron] agendado · "${job.schedule}" · ${job.label} · endpoints=[${job.endpoints.join(', ')}]`)
  }

  console.log(`[cron] ready · ${JOBS.length} jobs ativos · aguardando schedule`)
}

// ─── Graceful shutdown ─────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`[cron] recebido ${signal} · shutting down`)
  // node-cron tasks param sozinhas quando o processo morre · sem cleanup necessario
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Crashes nao planejados: loga e deixa o container reiniciar (Easypanel restart policy).
process.on('uncaughtException', (err) => {
  console.error('[cron] uncaughtException', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[cron] unhandledRejection', reason)
  process.exit(1)
})

bootstrap()
