'use client'

/**
 * AuditoriaClient · espelho 1:1 de `b2b-config-audit.ui.js`.
 *
 * Lista até 30 entries de b2b_audit_log com filtro por action. Click numa
 * linha com partnership_id navega pra detail (substitui b2b:open-detail).
 */

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { AuditEntry } from '@clinicai/repositories'

const ACTION_LABELS: Record<string, string> = {
  created: '🆕 Criada',
  status_change: '🔄 Status',
  health_change: '❤️ Saúde',
  voucher_issued: '🎁 Voucher',
  closure_suggested: '⚠️ Encerramento sugerido',
  attribution_created: '🎯 Atribuição',
  'comm.sent': '💬 Mensagem',
}

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todas ações' },
  { value: 'created', label: ACTION_LABELS.created },
  { value: 'status_change', label: ACTION_LABELS.status_change },
  { value: 'health_change', label: ACTION_LABELS.health_change },
  { value: 'voucher_issued', label: ACTION_LABELS.voucher_issued },
  { value: 'closure_suggested', label: ACTION_LABELS.closure_suggested },
  { value: 'attribution_created', label: ACTION_LABELS.attribution_created },
]

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    const today = new Date().toDateString() === d.toDateString()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (today) return `hoje ${hh}:${mm}`
    return (
      d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ` ${hh}:${mm}`
    )
  } catch {
    return ''
  }
}

export function AuditoriaClient({
  initial,
  initialAction,
}: {
  initial: AuditEntry[]
  initialAction: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function navigate(action: string | null) {
    const params = new URLSearchParams()
    if (action) params.set('action', action)
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/b2b/config/auditoria?${qs}` : '/b2b/config/auditoria')
      router.refresh()
    })
  }

  return (
    <div className="bcfg-body">
      <div className="bcfg-audit-toolbar">
        <select
          className="bcomm-input"
          value={initialAction || ''}
          disabled={pending}
          onChange={(e) => navigate(e.target.value || null)}
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-xs"
          onClick={() => navigate(initialAction)}
          disabled={pending}
        >
          ↻ Recarregar
        </button>
        <small className="bcfg-dim">Mostrando até 30 entradas</small>
      </div>

      <div className="bcfg-audit-list">
        {initial.length === 0 ? (
          <div className="bcfg-empty">Nenhuma entrada.</div>
        ) : (
          initial.map((r) => (
            <AuditRow
              key={r.id}
              r={r}
              onOpen={() => {
                if (r.partnership_id) router.push(`/partnerships/${r.partnership_id}`)
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}

function AuditRow({ r, onOpen }: { r: AuditEntry; onOpen: () => void }) {
  const lbl = ACTION_LABELS[r.action] || r.action
  const hasPart = !!r.partnership_id
  const detail = r.from_value
    ? `${r.from_value} → ${r.to_value || ''}`
    : r.notes
    ? r.notes.slice(0, 60)
    : ''

  return (
    <button
      type="button"
      className="bcfg-audit-row"
      onClick={onOpen}
      disabled={!hasPart}
    >
      <span className="bcfg-audit-time">{fmtTime(r.created_at)}</span>
      <span className="bcfg-audit-action">{lbl}</span>
      <span className="bcfg-audit-part">{r.partnership_name || '—'}</span>
      <span className="bcfg-audit-detail">{detail}</span>
    </button>
  )
}
