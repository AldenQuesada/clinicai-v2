'use client'

/**
 * TimeTrackerBadge · BLOCO 2.4 · paridade V1 agenda-day-panel.js
 *
 * Pill compacto que mostra tempo decorrido pra appointments em estados
 * operacionais (na_clinica · em_atendimento) + atraso pra appointments
 * pré-atendimento (agendado/aguardando_confirmacao/confirmado/aguardando).
 *
 * Thresholds (espelham V1 agenda-day-panel.js linhas 13-15):
 *   - na_clinica > 60min : warning (amarelo)
 *   - na_clinica > 120min: warning forte (amarelo + sem pulse · 2h é V1 amarelo)
 *   - na_clinica > 180min: danger (vermelho + animate-pulse · 3h é V1 vermelho)
 *   - em_atendimento > 120min: warning (amarelo)
 *   - em_atendimento > 180min: danger (vermelho + pulse)
 *   - atrasado > 15min (pré-atendimento): danger (vermelho · "Atrasado Xmin")
 *
 * Hydration-safe:
 *   - Retorna null no SSR (sem `Date.now()` no render do servidor)
 *   - Após mount, recalcula a cada 60s
 *   - Cleanup do interval no unmount
 */

import * as React from 'react'

const NA_CLINICA_WARN_MIN = 60 // > 1h amarelo suave
const NA_CLINICA_STRONG_MIN = 120 // > 2h amarelo forte (V1 warning)
const NA_CLINICA_CRIT_MIN = 180 // > 3h vermelho + pulse (V1 danger)
const EM_ATEND_WARN_MIN = 120 // > 2h amarelo
const EM_ATEND_CRIT_MIN = 180 // > 3h vermelho + pulse
const ATRASO_BADGE_MIN = 15 // > 15min pré-atendimento mostra "Atrasado"

interface TimeTrackerBadgeProps {
  status: string
  /** ISO timestamp (UTC) · null se ainda não chegou nesse status */
  chegadaEm: string | null
  /** ISO timestamp (UTC) · proxy pra started_at no em_atendimento (fallback) */
  updatedAt: string | null
  /** YYYY-MM-DD */
  scheduledDate: string
  /** HH:MM:SS · start_time */
  startTime: string
}

type Tone = 'info' | 'warn' | 'danger'

interface BadgeState {
  label: string
  tone: Tone
  pulse: boolean
}

function diffMinutes(fromIso: string, nowMs: number): number {
  const fromMs = new Date(fromIso).getTime()
  if (isNaN(fromMs)) return 0
  return Math.floor((nowMs - fromMs) / 60000)
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`
}

function computeBadge(
  status: string,
  chegadaEm: string | null,
  updatedAt: string | null,
  scheduledDate: string,
  startTime: string,
  nowMs: number,
): BadgeState | null {
  // Em clínica · usa chegada_em (canônica)
  if (status === 'na_clinica' && chegadaEm) {
    const mins = diffMinutes(chegadaEm, nowMs)
    if (mins >= NA_CLINICA_CRIT_MIN) {
      return {
        label: `Na clínica há ${formatDuration(mins)} · atenção`,
        tone: 'danger',
        pulse: true,
      }
    }
    if (mins >= NA_CLINICA_STRONG_MIN) {
      return {
        label: `Na clínica há ${formatDuration(mins)}`,
        tone: 'warn',
        pulse: false,
      }
    }
    if (mins >= NA_CLINICA_WARN_MIN) {
      return {
        label: `Na clínica há ${formatDuration(mins)}`,
        tone: 'info',
        pulse: false,
      }
    }
    if (mins >= 1) {
      return {
        label: `Na clínica há ${formatDuration(mins)}`,
        tone: 'info',
        pulse: false,
      }
    }
    return null
  }

  // Em atendimento · fallback pra updatedAt (não há started_at dedicado)
  if (status === 'em_atendimento' && updatedAt) {
    const mins = diffMinutes(updatedAt, nowMs)
    if (mins >= EM_ATEND_CRIT_MIN) {
      return {
        label: `Em atendimento há ${formatDuration(mins)}`,
        tone: 'danger',
        pulse: true,
      }
    }
    if (mins >= EM_ATEND_WARN_MIN) {
      return {
        label: `Em atendimento há ${formatDuration(mins)}`,
        tone: 'warn',
        pulse: false,
      }
    }
    if (mins >= 1) {
      return {
        label: `Em atendimento há ${formatDuration(mins)}`,
        tone: 'info',
        pulse: false,
      }
    }
    return null
  }

  // Atraso · pré-atendimento + appointment com horário passado
  const isPreAtendimento =
    status === 'agendado' ||
    status === 'aguardando_confirmacao' ||
    status === 'confirmado' ||
    status === 'aguardando'

  if (isPreAtendimento) {
    // scheduledDate é YYYY-MM-DD · startTime HH:MM:SS · UTC local da clínica
    // Pra evitar drift de timezone, tratamos como local naive (mesmo
    // comportamento do day-view que filtra por scheduledDate=date).
    const sched = new Date(`${scheduledDate}T${startTime}`).getTime()
    if (isNaN(sched)) return null
    const lateMin = Math.floor((nowMs - sched) / 60000)
    if (lateMin >= ATRASO_BADGE_MIN) {
      return {
        label: `Atrasado ${formatDuration(lateMin)}`,
        tone: 'danger',
        pulse: lateMin >= 30,
      }
    }
    return null
  }

  return null
}

export function TimeTrackerBadge(props: TimeTrackerBadgeProps) {
  // Hydration-safe: nowMs começa null no SSR · recalcula no client
  const [nowMs, setNowMs] = React.useState<number | null>(null)

  React.useEffect(() => {
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  if (nowMs == null) return null

  const badge = computeBadge(
    props.status,
    props.chegadaEm,
    props.updatedAt,
    props.scheduledDate,
    props.startTime,
    nowMs,
  )

  if (!badge) return null

  const toneClass =
    badge.tone === 'danger'
      ? 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300'
      : badge.tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300'
        : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneClass}`}
      role="status"
      aria-live="polite"
      title={badge.label}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          badge.tone === 'danger'
            ? 'bg-red-500'
            : badge.tone === 'warn'
              ? 'bg-amber-500'
              : 'bg-cyan-500'
        } ${badge.pulse ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      {badge.label}
    </span>
  )
}
