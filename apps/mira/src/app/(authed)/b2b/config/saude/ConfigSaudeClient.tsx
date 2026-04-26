'use client'

/**
 * ConfigSaudeClient · espelho 1:1 de `b2b-config-health.ui.js`.
 *
 * 4 cards read-only: Disparos · Insights · Vouchers · Contagens globais.
 * Botão "↻ Recarregar" recalcula via b2b_system_health.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { reloadSystemHealthAction } from './actions'
import type { SystemHealthSnapshot } from '@clinicai/repositories'

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h atrás`
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} d atrás`
  return fmtTime(iso)
}

export function ConfigSaudeClient({
  initial,
}: {
  initial: SystemHealthSnapshot | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [snap, setSnap] = useState<SystemHealthSnapshot | null>(initial)

  function refresh() {
    startTransition(async () => {
      const next = await reloadSystemHealthAction()
      setSnap(next)
      router.refresh()
    })
  }

  if (!snap) {
    return <div className="bcfg-empty">Sem dados de saúde do sistema.</div>
  }

  const d = snap.dispatch || ({} as SystemHealthSnapshot['dispatch'])
  const i = snap.insights || ({} as SystemHealthSnapshot['insights'])
  const v = snap.vouchers || ({} as SystemHealthSnapshot['vouchers'])
  const c = snap.counts || ({} as SystemHealthSnapshot['counts'])

  return (
    <div className="bcfg-body">
      <div className="bcfg-health-grid">
        <Card
          title="Disparos (WhatsApp Mira)"
          healthy={!!d.healthy}
          rows={[
            ['Último envio', relativeTime(d.last_at)],
            ['Status', d.last_status || '—'],
            ['Evolution', 'mira-mirian'],
          ]}
        />
        <Card
          title="Insights (Claude Haiku)"
          healthy={!!i.healthy}
          rows={[
            ['Último insight', relativeTime(i.last_at)],
            ['Gerados (30d)', String(i.cnt_30d || 0)],
            ['Cron', '08:15 BRT diário'],
          ]}
        />
        <Card
          title="Vouchers"
          healthy={!!v.healthy}
          rows={[
            ['Último emitido', relativeTime(v.last_issued_at)],
            ['Tipo', 'b2b_vouchers'],
          ]}
        />
        <Card
          title="Contagens globais"
          healthy
          rows={[
            ['Parcerias ativas', String(c.partnerships_active || 0)],
            ['Templates ativos', String(c.active_templates || 0)],
            ['Admins ativos', String(c.active_admins || 0)],
            ['Crons B2B ativos', String(c.crons_active || 0)],
          ]}
        />
      </div>

      <div className="bcfg-form-actions">
        <small className="bcfg-dim">Última checagem: {fmtTime(snap.computed_at)}</small>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-xs"
          onClick={refresh}
          disabled={pending}
        >
          {pending ? '…' : '↻ Recarregar'}
        </button>
      </div>
    </div>
  )
}

function Card({
  title,
  healthy,
  rows,
}: {
  title: string
  healthy: boolean
  rows: [string, string][]
}) {
  return (
    <div className="bcfg-hcard">
      <div className="bcfg-hcard-hdr">
        <strong>{title}</strong>
        <span className={'bcfg-hstat bcfg-hstat-' + (healthy ? 'ok' : 'warn')}>
          {healthy ? '● saudável' : '● atenção'}
        </span>
      </div>
      <div className="bcfg-hcard-body">
        {rows.map(([k, v]) => (
          <div key={k} className="bcfg-hcard-row">
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
