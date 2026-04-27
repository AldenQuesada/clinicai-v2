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

interface PreviousRecipient {
  name: string
  phone: string
}

export function VouchersClient({
  partnershipId,
  partnershipCombo,
  partnershipValidityDays,
  previousRecipients,
  initialVouchers,
  funnel,
  canManage,
}: {
  partnershipId: string
  /** Combo padrao da parceria (ex: 'veu_noiva+anovator') · prefill do form. */
  partnershipCombo: string | null
  /** Validade default em dias · mostrado no preview do form. */
  partnershipValidityDays: number
  /** Convidadas anteriores · autocomplete via datalist HTML5. */
  previousRecipients: PreviousRecipient[]
  initialVouchers: VoucherRow[]
  funnel: Funnel
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Form state
  // PHONE COMECA VAZIO · phone da convidada, NAO da parceira (bug Alden 2026-04-26)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientCpf, setRecipientCpf] = useState('')
  // COMBO default = combo da parceria (cadastrado no perfil)
  const [combo, setCombo] = useState(partnershipCombo ?? '')
  const [notes, setNotes] = useState('')

  // Phone validation visual · 10-13 digitos brasileiros
  const phoneDigits = recipientPhone.replace(/\D/g, '')
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 13
  const phoneFilled = phoneDigits.length > 0

  // Quando usuario digita nome que bate com convidada anterior, pre-fill phone
  function handleNameChange(v: string) {
    setRecipientName(v)
    const match = previousRecipients.find(
      (r) => r.name.toLowerCase() === v.trim().toLowerCase(),
    )
    if (match && !phoneFilled) {
      setRecipientPhone(match.phone)
    }
  }

  function resetForm() {
    setRecipientName('')
    setRecipientPhone('')
    setRecipientCpf('')
    setCombo(partnershipCombo ?? '')
    setNotes('')
  }

  function onIssue(e: React.FormEvent) {
    e.preventDefault()
    if (!recipientName.trim()) {
      setFeedback('Nome da convidada obrigatório')
      return
    }
    if (phoneFilled && !phoneValid) {
      setFeedback('Telefone deve ter 10-13 dígitos · ex: 5544991234567')
      return
    }
    if (!phoneFilled) {
      setFeedback('Telefone obrigatório · convidada recebe voucher por aí')
      return
    }
    setFeedback(null)
    startTransition(async () => {
      const r = await issueVoucherAction({
        partnershipId,
        recipientName: recipientName.trim(),
        recipientPhone: phoneDigits || undefined,
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
          style={{
            // Sanity belt-and-suspenders · forca dark backdrop mesmo
            // se variavel CSS quebrar em algum contexto
            background: 'rgba(0,0,0,0.78)',
          }}
        >
          {/* Datalist nativo HTML5 · autocomplete por nome de convidada anterior */}
          {previousRecipients.length > 0 ? (
            <datalist id="vch-prev-recipients">
              {previousRecipients.map((r, i) => (
                <option key={`${r.phone}-${i}`} value={r.name}>
                  {r.phone}
                </option>
              ))}
            </datalist>
          ) : null}
          <div
            className="b2b-modal"
            style={{
              maxWidth: 720,
              // Forca bg dark · evita white flash em contextos sem CSS var
              background: 'var(--b2b-bg-1, #1A1713)',
              color: 'var(--b2b-ivory, #F5F0E8)',
            }}
          >
            <header
              className="b2b-modal-hdr"
              style={{
                paddingBottom: 16,
                borderBottom: '1px solid var(--b2b-border)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  className="b2b-eyebrow"
                  style={{ fontSize: 10, marginBottom: 4 }}
                >
                  Voucher · novo
                </div>
                <h2
                  style={{
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                    fontSize: 28,
                    fontWeight: 300,
                    margin: 0,
                    color: 'var(--b2b-ivory)',
                    lineHeight: 1.1,
                  }}
                >
                  Emitir <em style={{ color: 'var(--b2b-champagne)', fontWeight: 400 }}>voucher</em>
                </h2>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--b2b-text-muted)',
                    marginTop: 4,
                  }}
                >
                  Convidada recebe link via WhatsApp · agenda direto pela Mira
                </div>
              </div>
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
            <div className="b2b-modal-body" style={{ paddingTop: 20 }}>
              <form onSubmit={onIssue}>
                <div
                  className="b2b-sec-title"
                  style={{ marginTop: 0, marginBottom: 12 }}
                >
                  Identidade da convidada
                </div>
                <div className="b2b-grid-2" style={{ gap: 16 }}>
                  <Field
                    label="Nome da convidada *"
                    value={recipientName}
                    onChange={handleNameChange}
                    placeholder={
                      previousRecipients.length > 0
                        ? `Comece a digitar · ${previousRecipients.length} convidada${previousRecipients.length > 1 ? 's' : ''} já cadastrada${previousRecipients.length > 1 ? 's' : ''}`
                        : 'Mariana'
                    }
                    listId={
                      previousRecipients.length > 0 ? 'vch-prev-recipients' : undefined
                    }
                  />
                  <Field
                    label="WhatsApp da convidada *"
                    value={recipientPhone}
                    onChange={setRecipientPhone}
                    placeholder="55 44 9 1234 5678"
                    mono
                    valid={phoneFilled ? phoneValid : null}
                    hint={
                      phoneFilled
                        ? phoneValid
                          ? `${phoneDigits.length} dígitos ✓`
                          : `${phoneDigits.length} dígitos · faltam ${10 - phoneDigits.length > 0 ? 10 - phoneDigits.length : 0} (mín 10, máx 13)`
                        : 'DDD + número (10-13 dígitos)'
                    }
                  />
                  <Field
                    label="CPF (opcional)"
                    value={recipientCpf}
                    onChange={setRecipientCpf}
                  />
                  <Field
                    label={
                      partnershipCombo
                        ? `Combo (padrão da parceria)`
                        : 'Combo (padrão se vazio)'
                    }
                    value={combo}
                    onChange={setCombo}
                    placeholder={partnershipCombo ?? 'veu_noiva+anovator'}
                    hint={
                      partnershipCombo
                        ? `Cadastrado: ${partnershipCombo} · valid ${partnershipValidityDays}d`
                        : 'Sem combo padrão · usa o cadastrado na parceria'
                    }
                  />
                </div>

                <div
                  className="b2b-sec-title"
                  style={{ marginTop: 24, marginBottom: 12 }}
                >
                  Contexto adicional
                </div>
                <div className="b2b-field" style={{ marginBottom: 0 }}>
                  <label className="b2b-field-lbl">Observações internas</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="b2b-input"
                    style={{ resize: 'vertical', minHeight: 64 }}
                    placeholder="Ex: indicação direta da Bella's · prioridade alta"
                  />
                </div>

                <div
                  className="b2b-form-actions"
                  style={{
                    marginTop: 28,
                    paddingTop: 16,
                    borderTop: '1px solid var(--b2b-border)',
                  }}
                >
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
  valid,
  hint,
  listId,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  /** null = neutro · true = ✓ verde · false = ✗ vermelho */
  valid?: boolean | null
  /** Texto auxiliar abaixo do input */
  hint?: string
  /** ID do <datalist> pra autocomplete HTML5 */
  listId?: string
}) {
  const borderColor =
    valid === true
      ? 'rgba(16, 185, 129, 0.6)' // green
      : valid === false
        ? 'rgba(220, 38, 38, 0.6)' // red urgent #DC2626
        : undefined
  const hintColor =
    valid === true
      ? '#10B981'
      : valid === false
        ? '#FCA5A5'
        : 'var(--b2b-text-muted, #9CA3AF)'
  return (
    <div className="b2b-field" style={{ marginBottom: 0 }}>
      <label className="b2b-field-lbl">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="b2b-input"
        style={{
          ...(mono
            ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }
            : {}),
          ...(borderColor ? { borderColor } : {}),
        }}
      />
      {hint ? (
        <div
          style={{
            fontSize: 10,
            color: hintColor,
            marginTop: 4,
            fontFamily: mono
              ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
              : undefined,
          }}
        >
          {hint}
        </div>
      ) : null}
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
