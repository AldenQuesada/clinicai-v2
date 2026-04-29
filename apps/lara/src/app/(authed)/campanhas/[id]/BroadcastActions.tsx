'use client'

/**
 * BroadcastActions · botoes start/cancel/edit/delete pra detalhes.
 *
 * Espelho dos botoes do _renderBroadcastDetail topbar (broadcast.ui.js
 * linhas 644–656) + handlers de broadcast-events.ui.js.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Play, Trash2, XCircle, FileEdit, Loader2 } from 'lucide-react'
import type { BroadcastDTO } from '@clinicai/repositories'
import {
  cancelBroadcastAction,
  deleteBroadcastAction,
  startBroadcastAction,
} from '../actions'

export function BroadcastActions({ broadcast }: { broadcast: BroadcastDTO }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<'start' | 'cancel' | 'delete' | null>(null)
  const [confirmKind, setConfirmKind] = useState<'start' | 'cancel' | 'delete' | null>(
    null,
  )
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleStart() {
    setBusy('start')
    const res = await startBroadcastAction(broadcast.id)
    setBusy(null)
    setConfirmKind(null)
    if (!res.ok || !res.data) {
      showToast(res.error || 'Falha ao iniciar', 'err')
      return
    }
    const est = res.data.estimated_minutes || 0
    const schedFor = res.data.scheduled_for
    let msg = `Disparo iniciado · ${res.data.enqueued} mensagens enfileiradas`
    if (schedFor && new Date(schedFor) > new Date(Date.now() + 60000)) {
      msg += ` · agendado pra ${new Date(schedFor).toLocaleString('pt-BR')}`
    } else if (est > 0) {
      msg += ` (~${est} min para concluir)`
    }
    showToast(msg)
    startTransition(() => router.refresh())
  }

  async function handleCancel() {
    setBusy('cancel')
    const res = await cancelBroadcastAction(broadcast.id)
    setBusy(null)
    setConfirmKind(null)
    if (!res.ok || !res.data) {
      showToast(res.error || 'Falha ao cancelar', 'err')
      return
    }
    showToast(`Disparo cancelado · ${res.data.removed_from_outbox} msgs removidas`)
    startTransition(() => router.refresh())
  }

  async function handleDelete() {
    setBusy('delete')
    const res = await deleteBroadcastAction(broadcast.id)
    setBusy(null)
    setConfirmKind(null)
    if (!res.ok) {
      showToast(res.error || 'Falha ao remover', 'err')
      return
    }
    showToast('Disparo removido')
    startTransition(() => router.push('/campanhas'))
  }

  const status = broadcast.status
  const targets = broadcast.total_targets || 0

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'draft' && (
          <Link href={`/campanhas/nova?clone=${broadcast.id}`} className="b2b-btn">
            <FileEdit className="w-3.5 h-3.5" />
            Reaproveitar
          </Link>
        )}

        {status === 'draft' && (
          <button
            type="button"
            disabled={busy != null}
            className="b2b-btn b2b-btn-primary"
            onClick={() => setConfirmKind('start')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Play className="w-3.5 h-3.5" />
            Iniciar disparo
          </button>
        )}

        {(status === 'draft' || status === 'sending') && (
          <button
            type="button"
            disabled={busy != null}
            onClick={() => setConfirmKind('cancel')}
            className="b2b-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#EF4444',
              borderColor: '#EF4444',
            }}
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancelar
          </button>
        )}

        <button
          type="button"
          disabled={busy != null}
          onClick={() => setConfirmKind('delete')}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          title="Remover disparo"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remover
        </button>
      </div>

      {confirmKind && (
        <ConfirmModal
          title={
            confirmKind === 'start'
              ? `Iniciar disparo para ${targets} destinatarios?`
              : confirmKind === 'cancel'
                ? 'Cancelar disparo? Mensagens pendentes serao removidas.'
                : 'Remover este disparo?'
          }
          confirmLabel={
            confirmKind === 'start'
              ? 'Iniciar'
              : confirmKind === 'cancel'
                ? 'Cancelar disparo'
                : 'Remover'
          }
          tone={confirmKind === 'start' ? 'primary' : 'danger'}
          loading={busy === confirmKind}
          onConfirm={
            confirmKind === 'start'
              ? handleStart
              : confirmKind === 'cancel'
                ? handleCancel
                : handleDelete
          }
          onClose={() => (busy ? null : setConfirmKind(null))}
        />
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 50,
            padding: '12px 16px',
            background:
              toast.tone === 'err' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
            color: '#fff',
            borderRadius: 6,
            fontSize: 13,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}

function ConfirmModal({
  title,
  confirmLabel,
  tone,
  loading,
  onConfirm,
  onClose,
}: {
  title: string
  confirmLabel: string
  tone: 'primary' | 'danger'
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="luxury-card"
        style={{ padding: 22, maxWidth: 420, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, color: 'var(--b2b-ivory)', marginBottom: 18 }}>
          {title}
        </div>
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}
        >
          <button type="button" onClick={onClose} disabled={loading} className="b2b-btn">
            Voltar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`b2b-btn ${tone === 'primary' ? 'b2b-btn-primary' : ''}`}
            style={
              tone === 'danger'
                ? {
                    color: '#EF4444',
                    borderColor: '#EF4444',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }
                : { display: 'inline-flex', alignItems: 'center', gap: 6 }
            }
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
