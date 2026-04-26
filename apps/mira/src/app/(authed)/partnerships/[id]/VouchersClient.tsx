'use client'

/**
 * VouchersClient · espelho funcional de `b2b-vouchers.ui.js` adaptado pra
 * tab dentro do detail (sem overlay).
 *
 * Funil + lista de vouchers + form inline de emissao + acoes
 * (copiar link, marcar entregue, cancelar).
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

const STATUS_COLOR: Record<VoucherRow['status'], string> = {
  issued: '#9CA3AF',
  delivered: '#3B82F6',
  opened: '#F59E0B',
  redeemed: '#10B981',
  expired: '#6B7280',
  cancelled: '#EF4444',
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
      {/* Funnel */}
      {funnel ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['issued', 'delivered', 'opened', 'redeemed'] as const).map((k) => (
            <div
              key={k}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-center"
            >
              <div
                className="text-2xl font-semibold font-mono leading-none"
                style={{ color: STATUS_COLOR[k] }}
              >
                {funnel[k] || 0}
              </div>
              <div className="text-[10px] uppercase tracking-[1.2px] text-[#9CA3AF] mt-1.5">
                {STATUS_LABEL[k]}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {funnel && (funnel.expired > 0 || funnel.cancelled > 0) ? (
        <div className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
          Expirados: {funnel.expired || 0} · Cancelados: {funnel.cancelled || 0} · Redemption{' '}
          {funnel.redemption_rate_pct || 0}%
        </div>
      ) : null}

      {/* Header com toggle do form */}
      {canManage ? (
        showForm ? (
          <form
            onSubmit={onIssue}
            className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
                Observações
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 resize-y"
              />
            </div>

            <div className="flex items-center gap-2 pt-1.5 border-t border-white/10">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-white/5 text-[#9CA3AF] hover:bg-white/10 transition-colors"
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
                className="px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-50"
                disabled={pending}
              >
                {pending ? 'Emitindo…' : 'Emitir voucher'}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="self-start px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
            onClick={() => setShowForm(true)}
          >
            + Emitir voucher
          </button>
        )
      ) : null}

      {feedback ? (
        <div className="text-[11px] text-[#C9A96E] bg-[#C9A96E]/10 border border-[#C9A96E]/20 rounded px-3 py-2">
          {feedback}
        </div>
      ) : null}

      {/* Lista */}
      {initialVouchers.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-[12.5px] text-[#9CA3AF]">
          Esta parceria ainda não tem vouchers emitidos.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
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
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 ${
          mono ? 'font-mono' : ''
        }`}
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
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 bg-white/[0.02] border border-white/10 rounded-lg hover:border-white/14 transition-colors">
      <span className="font-mono text-[11px] text-[#C9A96E]">{v.token}</span>

      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="text-xs text-[#F5F0E8] truncate">
          {v.recipientName || '—'}
          {v.combo ? (
            <span className="ml-2 text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
              {v.combo}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-3 text-[10.5px] font-mono text-[#9CA3AF]">
          {v.recipientPhone ? <span>{v.recipientPhone}</span> : null}
          <span className="text-[#6B7280]">
            emit {fmt(v.issuedAt)} · até {fmt(v.validUntil)}
          </span>
        </div>
      </div>

      <span
        className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px]"
        style={{
          background: STATUS_COLOR[v.status] + '26',
          color: STATUS_COLOR[v.status],
        }}
      >
        {STATUS_LABEL[v.status]}
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] bg-white/5 text-[#9CA3AF] hover:bg-white/10 transition-colors"
          onClick={onCopy}
          title="Copiar link"
        >
          🔗
        </button>
        {canManage && v.status === 'issued' ? (
          <button
            type="button"
            className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] bg-[#3B82F6]/15 text-[#3B82F6] hover:bg-[#3B82F6]/25 transition-colors disabled:opacity-50"
            onClick={onMarkDelivered}
            disabled={busy}
            title="Marcar como entregue"
          >
            ✓
          </button>
        ) : null}
        {canManage && v.status !== 'cancelled' && v.status !== 'expired' && v.status !== 'redeemed' ? (
          <button
            type="button"
            className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] bg-[#EF4444]/15 text-[#FCA5A5] hover:bg-[#EF4444]/25 transition-colors disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
            title="Cancelar voucher"
          >
            🗑
          </button>
        ) : null}
      </div>
    </div>
  )
}
