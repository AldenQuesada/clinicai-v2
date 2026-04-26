'use client'

/**
 * VouchersClient · espelho funcional de `b2b-vouchers.ui.js` adaptado pra
 * tab dentro do detail (sem overlay).
 *
 * Funil + lista de vouchers + form inline de emissao + acoes
 * (copiar link, marcar entregue, cancelar).
 *
 * Visual: usa b2b-perf-kpi pros 4 cards do funil, b2b-card-gold pro form,
 * b2b-vch-row pra lista com data-status, b2b-btn pros CTAs.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  issueVoucherAction,
  cancelVoucherAction,
  markVoucherDeliveredAction,
} from './actions'

type VoucherRow = {
  id: string
  token: string
  combo: string
  status: 'issued' | 'delivered' | 'opened' | 'redeemed' | 'expired' | 'cancelled'
  recipientName: string | null
  recipientPhone: string | null
  validUntil: string
  issuedAt: string
}

type Funnel = {
  issued: number
  delivered: number
  opened: number
  redeemed: number
  expired: number
  cancelled: number
  total: number
  redemption_rate_pct: number
  last_issued_at: string | null
} | null

const STATUS_LABEL: Record<VoucherRow['status'], string> = {
  issued: 'Emitido',
  delivered: 'Entregue',
  opened: 'Aberto',
  redeemed: 'Resgatado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
}

function voucherUrl(token: string): string {
  return `https://og.miriandpaula.com.br/?type=voucher&x=${encodeURIComponent(token)}`
}

function fmt(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return iso
  }
}

export function VouchersClient({
  partnershipId,
  partnershipPhone,
  initialVouchers,
  funnel,
  canManage,
}: {
  partnershipId: string
  partnershipPhone: string
  initialVouchers: VoucherRow[]
  funnel: Funnel
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Form state
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState(partnershipPhone || '')
  const [recipientCpf, setRecipientCpf] = useState('')
  const [combo, setCombo] = useState('')
  const [notes, setNotes] = useState('')

  function resetForm() {
    setRecipientName('')
    setRecipientPhone(partnershipPhone || '')
    setRecipientCpf('')
    setCombo('')
    setNotes('')
  }

  function onIssue(e: React.FormEvent) {
    e.preventDefault()
    if (!recipientName.trim()) {
      setFeedback('Nome do destinatário obrigatório')
      return
    }
    setFeedback(null)
    startTransition(async () => {
      const r = await issueVoucherAction({
        partnershipId,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.replace(/\D/g, '') || undefined,
        recipientCpf: recipientCpf.trim() || undefined,
        combo: combo.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback(`Voucher emitido · #${r.token || r.id}`)
      setShowForm(false)
      resetForm()
      router.refresh()
    })
  }

  function onCopy(token: string) {
    const url = voucherUrl(token)
    navigator.clipboard
      .writeText(url)
      .then(() => setFeedback('Link copiado'))
      .catch(() => setFeedback(`Copie manualmente: ${url}`))
  }

  function onMarkDelivered(id: string) {
    startTransition(async () => {
      const r = await markVoucherDeliveredAction(id, partnershipId)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback('Marcado como entregue')
      router.refresh()
    })
  }

  function onCancel(id: string) {
    const reason = window.prompt('Motivo do cancelamento (opcional):', '')
    if (reason === null) return
    startTransition(async () => {
      const r = await cancelVoucherAction(id, partnershipId, reason || null)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback('Voucher cancelado')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Funnel · 4 KPI cards */}
      {funnel ? (
        <div className="b2b-perf-kpis">
          {(['issued', 'delivered', 'opened', 'redeemed'] as const).map((k) => (
            <div key={k} className="b2b-perf-kpi">
              <div className="b2b-perf-kpi-val">{funnel[k] || 0}</div>
              <div className="b2b-perf-kpi-lbl">{STATUS_LABEL[k]}</div>
            </div>
          ))}
        </div>
      ) : null}
      {funnel && (funnel.expired > 0 || funnel.cancelled > 0 || funnel.total > 0) ? (
        <div className="text-[10.5px] uppercase tracking-[1.4px] text-[var(--b2b-text-muted)]">
          Expirados: {funnel.expired || 0} · Cancelados: {funnel.cancelled || 0} · Redemption{' '}
          {funnel.redemption_rate_pct || 0}%
        </div>
      ) : null}

      {/* Botao "+ Emitir voucher" · form abre como modal overlay
          (padrao b2b-overlay igual ProfessionalsClient · pedido Alden 2026-04-26). */}
      {canManage ? (
        <button
          type="button"
          className="b2b-btn b2b-btn-primary self-start"
          onClick={() => setShowForm(true)}
        >
          + Emitir voucher
        </button>
      ) : null}

      {showForm && canManage ? (
        <div
          className="b2b-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowForm(false)
              resetForm()
            }
          }}
        >
          <div className="b2b-modal" style={{ maxWidth: 720 }}>
            <header className="b2b-modal-hdr">
              <h2>Emitir voucher</h2>
              <button
                type="button"
                className="b2b-close"
                aria-label="Fechar"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
              >
                ×
              </button>
            </header>
            <div className="b2b-modal-body">
              <form onSubmit={onIssue}>
                <div className="b2b-grid-2">
                  <Field
                    label="Nome do destinatário *"
                    value={recipientName}
                    onChange={setRecipientName}
                    placeholder="Mariana"
                  />
                  <Field
                    label={
                      partnershipPhone
                        ? 'WhatsApp (preenchido do cadastro)'
                        : 'WhatsApp da parceira'
                    }
                    value={recipientPhone}
                    onChange={setRecipientPhone}
                    placeholder="55 44 9..."
                    mono
                  />
                  <Field
                    label="CPF (opcional)"
                    value={recipientCpf}
                    onChange={setRecipientCpf}
                  />
                  <Field
                    label="Combo (padrão se vazio)"
                    value={combo}
                    onChange={setCombo}
                    placeholder="veu_noiva+anovator"
                  />
                </div>

                <div className="b2b-field" style={{ marginBottom: 0 }}>
                  <label className="b2b-field-lbl">Observações</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="b2b-input"
                    style={{ resize: 'vertical', minHeight: 56 }}
                  />
                </div>

                <div className="b2b-form-actions">
                  <button
                    type="button"
                    className="b2b-btn"
                    onClick={() => {
                      setShowForm(false)
                      resetForm()
                    }}
                    disabled={pending}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="b2b-btn b2b-btn-primary"
                    disabled={pending}
                  >
                    {pending ? 'Emitindo…' : 'Emitir voucher'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}

      {/* Lista */}
      {initialVouchers.length === 0 ? (
        <div className="b2b-empty">
          Esta parceria ainda não tem vouchers emitidos.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {initialVouchers.map((v) => (
            <VoucherRow
              key={v.id}
              v={v}
              busy={pending}
              canManage={canManage}
              onCopy={() => onCopy(v.token)}
              onMarkDelivered={() => onMarkDelivered(v.id)}
              onCancel={() => onCancel(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <div className="b2b-field" style={{ marginBottom: 0 }}>
      <label className="b2b-field-lbl">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="b2b-input"
        style={mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } : undefined}
      />
    </div>
  )
}

function VoucherRow({
  v,
  busy,
  canManage,
  onCopy,
  onMarkDelivered,
  onCancel,
}: {
  v: VoucherRow
  busy: boolean
  canManage: boolean
  onCopy: () => void
  onMarkDelivered: () => void
  onCancel: () => void
}) {
  return (
    <div className="b2b-vch-row">
      <span className="b2b-vch-token">{v.token}</span>

      <div className="min-w-0 flex flex-col">
        <span className="b2b-vch-name">
          {v.recipientName || '—'}
          {v.combo ? (
            <span className="ml-2 text-[10px] uppercase tracking-[1.4px] text-[var(--b2b-text-muted)]">
              {v.combo}
            </span>
          ) : null}
        </span>
        <div className="b2b-vch-meta">
          {v.recipientPhone ? <span>{v.recipientPhone}</span> : null}
          <span>
            emit {fmt(v.issuedAt)} · até {fmt(v.validUntil)}
          </span>
        </div>
      </div>

      <span className="b2b-vch-status" data-status={v.status}>
        {STATUS_LABEL[v.status]}
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          className="b2b-btn"
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onCopy}
          title="Copiar link"
        >
          Link
        </button>
        {canManage && v.status === 'issued' ? (
          <button
            type="button"
            className="b2b-btn"
            style={{ padding: '4px 8px', fontSize: 11, borderColor: 'rgba(59,130,246,0.4)', color: '#93C5FD' }}
            onClick={onMarkDelivered}
            disabled={busy}
            title="Marcar como entregue"
          >
            Entregue
          </button>
        ) : null}
        {canManage && v.status !== 'cancelled' && v.status !== 'expired' && v.status !== 'redeemed' ? (
          <button
            type="button"
            className="b2b-btn"
            style={{ padding: '4px 8px', fontSize: 11, borderColor: 'rgba(217,122,122,0.4)', color: 'var(--b2b-red)' }}
            onClick={onCancel}
            disabled={busy}
            title="Cancelar voucher"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  )
}
