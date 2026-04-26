'use client'

/**
 * RotinasClient · controle dos 11 cron jobs proativos da Mira.
 *
 * Lista agrupada por categoria · cada job vira um row com:
 *   - Toggle ON/OFF (Server Action)
 *   - Display name + descricao
 *   - Schedule (cron expr informativo)
 *   - Last run (relative time + status badge)
 *   - 24h stats (runs / failures)
 *   - Botao "ver execucoes" expande lista das ultimas 50 runs
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setCronEnabledAction, fetchCronRunsAction } from './actions'
import type {
  MiraCronJob,
  MiraCronRun,
  CronJobCategory,
  CronRunStatus,
} from '@clinicai/repositories'

const CATEGORY_ORDER: CronJobCategory[] = [
  'digest',
  'alert',
  'reminder',
  'suggestion',
  'maintenance',
  'worker',
  'other',
]

const CATEGORY_LABELS: Record<CronJobCategory, string> = {
  digest: 'Digests',
  alert: 'Alertas',
  reminder: 'Lembretes',
  suggestion: 'Sugestões',
  maintenance: 'Manutenção',
  worker: 'Workers',
  other: 'Outros',
}

const STATUS_COLOR: Record<CronRunStatus, string> = {
  pending: '#9CA3AF',
  success: '#10B981',
  failed: '#EF4444',
  skipped: '#F59E0B',
  disabled: '#6B7280',
}

const STATUS_LABEL: Record<CronRunStatus, string> = {
  pending: 'Em curso',
  success: 'OK',
  failed: 'Falha',
  skipped: 'Pulado',
  disabled: 'Desligado',
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  try {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return Math.floor(diff / 60) + ' min'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h'
    if (diff < 7 * 86400) return Math.floor(diff / 86400) + 'd'
    return d.toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

function fmtAbs(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return ''
  }
}

export function RotinasClient({ initialJobs }: { initialJobs: MiraCronJob[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [runsCache, setRunsCache] = useState<Record<string, MiraCronRun[]>>({})

  function onToggle(job: MiraCronJob) {
    const next = !job.enabled
    let notes: string | null = job.notes
    if (!next) {
      const r = window.prompt(`Desligar "${job.display_name}"? Nota (opcional):`, '')
      if (r === null) return
      notes = r || null
    }
    startTransition(async () => {
      const r = await setCronEnabledAction(job.job_name, next, notes)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback(`${job.display_name}: ${next ? 'Ligado' : 'Desligado'}`)
      router.refresh()
    })
  }

  function onExpand(job: MiraCronJob) {
    if (expanded === job.job_name) {
      setExpanded(null)
      return
    }
    setExpanded(job.job_name)
    if (runsCache[job.job_name]) return
    startTransition(async () => {
      const runs = await fetchCronRunsAction(job.job_name)
      setRunsCache((prev) => ({ ...prev, [job.job_name]: runs }))
    })
  }

  // Agrupa por category na ordem canonica
  const byCategory = new Map<CronJobCategory, MiraCronJob[]>()
  for (const j of initialJobs) {
    const key = (j.category as CronJobCategory) || 'other'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(j)
  }

  if (initialJobs.length === 0) {
    return (
      <div className="bcfg-empty">
        Nenhum job cadastrado. Aplique a migration <code>800-15</code> em prod
        pra criar o catálogo dos 11 jobs proativos da Mira.
      </div>
    )
  }

  return (
    <div className="bcfg-body">
      <p className="bcfg-hint">
        Controle dos 11 cron jobs proativos da Mira. Desligar um job impede que
        a Mira envie mensagens automáticas dele · ela continua respondendo
        quando você fala com ela direto.
      </p>

      {feedback ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--b2b-champagne, #C9A96E)',
            background: 'rgba(201,169,110,0.1)',
            border: '1px solid rgba(201,169,110,0.2)',
            borderRadius: 4,
            padding: '6px 12px',
          }}
        >
          {feedback}
        </div>
      ) : null}

      {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => (
        <section key={cat}>
          <div className="bcfg-section-sub">{CATEGORY_LABELS[cat]}</div>
          <div className="bcfg-admin-list">
            {byCategory.get(cat)!.map((job) => (
              <div key={job.job_name}>
                <JobRow
                  job={job}
                  busy={pending}
                  onToggle={() => onToggle(job)}
                  onExpand={() => onExpand(job)}
                  expanded={expanded === job.job_name}
                />
                {expanded === job.job_name ? (
                  <RunsList
                    runs={runsCache[job.job_name] || []}
                    loading={!runsCache[job.job_name]}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function JobRow({
  job,
  busy,
  onToggle,
  onExpand,
  expanded,
}: {
  job: MiraCronJob
  busy: boolean
  onToggle: () => void
  onExpand: () => void
  expanded: boolean
}) {
  const lastStatus = job.last_status as CronRunStatus | null
  const failRate =
    job.runs_24h > 0 ? Math.round((job.failures_24h / job.runs_24h) * 100) : 0

  return (
    <div
      className={'bcfg-admin-row' + (job.enabled ? '' : ' bcfg-admin-row-inactive')}
      style={{ gridTemplateColumns: '1fr auto auto auto' }}
    >
      <div className="bcfg-admin-main">
        <div className="bcfg-admin-name">
          {job.display_name}
          {!job.enabled ? (
            <span className="bcfg-pill bcfg-pill-inactive">desligado</span>
          ) : null}
        </div>
        {job.description ? (
          <div className="bcfg-admin-notes" style={{ fontStyle: 'normal' }}>
            {job.description}
          </div>
        ) : null}
        <div className="bcfg-admin-phone">
          <code>{job.job_name}</code>
          {job.cron_expr ? (
            <small className="bcfg-dim">
              {' · '}
              {job.cron_expr} (UTC)
            </small>
          ) : null}
        </div>
        {job.notes ? (
          <div
            className="bcfg-admin-notes"
            style={{ marginTop: 4, color: '#F59E0B' }}
          >
            ⚠ {job.notes}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
          fontSize: 11,
          color: 'var(--bcomm-text-mut, #9CA3AF)',
          minWidth: 110,
        }}
      >
        <span title={fmtAbs(job.last_run_at)}>
          último: {fmtRelative(job.last_run_at)}
        </span>
        {lastStatus ? (
          <span
            className="bcfg-pill"
            style={{
              background: STATUS_COLOR[lastStatus] + '26',
              color: STATUS_COLOR[lastStatus],
            }}
          >
            {STATUS_LABEL[lastStatus]}
          </span>
        ) : null}
        <span style={{ fontSize: 10 }}>
          24h: {job.runs_24h} runs
          {job.failures_24h > 0 ? ` · ${failRate}% falha` : ''}
        </span>
      </div>

      <button
        type="button"
        className="bcomm-btn bcomm-btn-xs"
        onClick={onExpand}
        title={expanded ? 'Recolher' : 'Ver execuções'}
      >
        {expanded ? '▴' : '▾'}
      </button>

      <button
        type="button"
        className={
          'bcomm-btn bcomm-btn-xs' +
          (job.enabled ? ' bcomm-btn-danger' : ' bcomm-btn-primary')
        }
        onClick={onToggle}
        disabled={busy}
        title={job.enabled ? 'Desligar' : 'Ligar'}
      >
        {job.enabled ? 'Desligar' : 'Ligar'}
      </button>
    </div>
  )
}

function RunsList({
  runs,
  loading,
}: {
  runs: MiraCronRun[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div
        style={{
          padding: '8px 16px',
          fontSize: 11,
          color: 'var(--bcomm-text-mut, #9CA3AF)',
        }}
      >
        Carregando últimas execuções…
      </div>
    )
  }
  if (runs.length === 0) {
    return (
      <div
        style={{
          padding: '8px 16px',
          fontSize: 11,
          color: 'var(--bcomm-text-mut, #9CA3AF)',
        }}
      >
        Sem execuções registradas ainda.
      </div>
    )
  }
  return (
    <div
      style={{
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid var(--bcomm-border, rgba(255,255,255,0.08))',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: 11,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      {runs.map((r) => (
        <div
          key={r.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 80px 60px 1fr',
            gap: 8,
            padding: '3px 0',
            color: 'var(--bcomm-text, #F5F5F5)',
            borderBottom: '1px dashed rgba(255,255,255,0.05)',
          }}
        >
          <span style={{ color: 'var(--bcomm-text-mut, #9CA3AF)' }}>
            {fmtAbs(r.started_at)}
          </span>
          <span style={{ color: STATUS_COLOR[r.status as CronRunStatus] }}>
            {STATUS_LABEL[r.status as CronRunStatus]}
          </span>
          <span style={{ color: 'var(--bcomm-text-mut, #9CA3AF)' }}>
            {r.items_processed > 0 ? `${r.items_processed} itens` : ''}
          </span>
          <span
            style={{
              color: r.error_message
                ? '#FCA5A5'
                : 'var(--bcomm-text-mut, #9CA3AF)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={r.error_message || ''}
          >
            {r.error_message || ''}
          </span>
        </div>
      ))}
    </div>
  )
}
