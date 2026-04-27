'use client'

/**
 * CandidaturasClient · espelho 1:1 do `b2b-applications.ui.js`.
 * Sub-tabs internos (Pendentes/Aprovadas/Rejeitadas) com cards
 * + botões Aprovar/Rejeitar com prompt de nota/motivo.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveApplicationAction, rejectApplicationAction } from './actions'
import type { ApplicationDTO, ApplicationStatus } from '@clinicai/repositories'
import { EmptyState } from '@clinicai/ui'

const SUB_TABS: Array<{ id: ApplicationStatus; label: string }> = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovadas' },
  { id: 'rejected', label: 'Rejeitadas' },
]

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return (
      d.toLocaleDateString('pt-BR') +
      ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    )
  } catch {
    return iso
  }
}

function fmtPhone(p: string | null): string {
  if (!p) return '—'
  let digits = String(p).replace(/\D/g, '')
  if (digits.length === 13 && digits.indexOf('55') === 0) digits = digits.slice(2)
  if (digits.length === 11)
    return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7)
  if (digits.length === 10)
    return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6)
  return p
}

export function CandidaturasClient({
  items,
  subTab,
}: {
  items: ApplicationDTO[]
  subTab: ApplicationStatus
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  function changeTab(id: ApplicationStatus) {
    if (id === subTab) return
    router.push(`/b2b/candidaturas?status=${id}`)
  }

  function onApprove(id: string, name: string) {
    const note = window.prompt(
      `Aprovar "${name}" — nota opcional sobre a aprovação (vai para o histórico):`,
      '',
    )
    if (note === null) return
    setBusyId(id)
    startTransition(async () => {
      try {
        const r = await approveApplicationAction(id, note || null)
        if (!r.ok) throw new Error(r.error || 'falha')
        alert(`Parceria criada: ${r.partnership_name || name}`)
        router.refresh()
      } catch (e) {
        alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusyId(null)
      }
    })
  }

  function onReject(id: string, name: string) {
    const reason = window.prompt(`Rejeitar "${name}" — motivo da rejeição (obrigatório):`, '')
    if (reason === null) return
    if (!String(reason).trim()) {
      alert('Motivo é obrigatório')
      return
    }
    setBusyId(id)
    startTransition(async () => {
      try {
        const r = await rejectApplicationAction(id, reason.trim())
        if (!r.ok) throw new Error(r.error || 'falha')
        router.refresh()
      } catch (e) {
        alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusyId(null)
      }
    })
  }

  const emptyMsg =
    subTab === 'pending'
      ? 'Nenhuma candidatura pendente. A Mira está quieta por enquanto.'
      : subTab === 'approved'
        ? 'Nenhuma candidatura aprovada ainda.'
        : 'Nenhuma candidatura rejeitada.'

  const emptyTitle =
    subTab === 'pending'
      ? 'Sem candidaturas pendentes'
      : subTab === 'approved'
        ? 'Sem aprovadas'
        : 'Sem rejeitadas'

  return (
    <>
      <div className="b2b-list-head">
        <div>
          <div className="b2b-list-count">Candidaturas de parceria</div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--b2b-text-muted)',
              marginTop: '2px',
            }}
          >
            Fluxo A · Mira recebe pedidos no WhatsApp e cadastra aqui para aprovação
          </div>
        </div>
      </div>

      <nav className="b2b-app-tabs">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`b2b-app-subtab ${t.id === subTab ? 'active' : ''}`}
            onClick={() => changeTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          variant="leads"
          title={emptyTitle}
          message={emptyMsg}
        />
      ) : (
        <div className="b2b-app-list">
          {items.map((a) => (
            <Card
              key={a.id}
              app={a}
              busy={busyId === a.id || pending}
              onApprove={() => onApprove(a.id, a.name)}
              onReject={() => onReject(a.id, a.name)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function Card({
  app,
  busy,
  onApprove,
  onReject,
}: {
  app: ApplicationDTO
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const meta: string[] = [`Solicitado ${fmtDateTime(app.created_at)}`]
  if (app.resolved_at) meta.push(`Resolvido ${fmtDate(app.resolved_at)}`)
  if (app.partnership_id) meta.push('Parceria criada')
  if (app.follow_up_count) meta.push(`${app.follow_up_count}x follow-up`)

  return (
    <div className="b2b-app-card">
      <div className="b2b-app-head">
        <div className="b2b-app-ident">
          <strong>{app.name}</strong>
          {app.category && <span className="b2b-pill">{app.category}</span>}
          <StatusPill status={app.status} />
        </div>
        <div className="b2b-app-contact">
          {fmtPhone(app.contact_phone || app.requested_by_phone)}
        </div>
      </div>

      {(app.instagram ||
        app.address ||
        app.contact_name ||
        app.notes ||
        app.approval_note ||
        app.rejection_reason) && (
        <div className="b2b-app-extra">
          {app.instagram && (
            <div className="b2b-app-line">
              IG: <strong>{app.instagram}</strong>
            </div>
          )}
          {app.address && <div className="b2b-app-line">Endereço: {app.address}</div>}
          {app.contact_name && <div className="b2b-app-line">Contato: {app.contact_name}</div>}
          {app.notes && <div className="b2b-app-line">Nota: {app.notes}</div>}
          {app.approval_note && (
            <div className="b2b-app-line" style={{ color: 'var(--b2b-sage)' }}>
              Aprovada com nota: {app.approval_note}
            </div>
          )}
          {app.rejection_reason && (
            <div className="b2b-app-line" style={{ color: 'var(--b2b-red)' }}>
              Motivo rejeição: {app.rejection_reason}
            </div>
          )}
        </div>
      )}

      <div className="b2b-app-meta">{meta.join(' · ')}</div>

      {app.status === 'pending' && (
        <div className="b2b-app-acts">
          <button type="button" className="b2b-btn" disabled={busy} onClick={onReject}>
            {busy ? 'Rejeitando…' : 'Rejeitar'}
          </button>
          <button
            type="button"
            className="b2b-btn b2b-btn-primary"
            disabled={busy}
            onClick={onApprove}
          >
            {busy ? 'Aprovando…' : 'Aprovar'}
          </button>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: ApplicationStatus }) {
  if (status === 'pending') return <span className="b2b-pill">pendente</span>
  if (status === 'approved')
    return <span className="b2b-pill b2b-pill-tier">aprovada</span>
  if (status === 'rejected')
    return (
      <span
        className="b2b-pill"
        style={{ background: 'rgba(217,122,122,0.18)', color: 'var(--b2b-red)' }}
      >
        rejeitada
      </span>
    )
  return <span className="b2b-pill">arquivada</span>
}
