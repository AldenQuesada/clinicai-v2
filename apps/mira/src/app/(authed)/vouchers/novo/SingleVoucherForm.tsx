'use client'

/**
 * SingleVoucherForm · client component pra /vouchers/novo.
 *
 * Pedido Alden 2026-04-27: formulario reativo · ao selecionar parceria,
 * mostra cascade com combo cadastrado, validade, cap mensal, vouchers
 * emitidos no mes. Combo vira dropdown (select) com combos validos
 * em vez de input livre. Background dark forcado.
 *
 * 2026-04-29: action retorna { ok, error, batchId } via useActionState.
 * Erro fica visivel inline (modal nao perde estado). Sucesso chama
 * onSuccess(batchId) se passado, senao navega pra /vouchers/bulk/[id].
 */

import { useEffect, useMemo, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { emitVoucherSingleAction, type EmitVoucherSingleResult } from './actions'

export interface PartnershipOption {
  id: string
  name: string
  voucherCombo: string | null
  voucherValidityDays: number
  voucherMonthlyCap: number | null
  vouchersIssuedThisMonth: number
}

function localNowInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SingleVoucherForm({
  partnerships,
  combos = [],
  onSuccess,
}: {
  partnerships: PartnershipOption[]
  /** Lista de combos cadastrados na clinica · vem de b2b_voucher_combos */
  combos?: string[]
  /**
   * Chamado em emit OK · recebe batchId. Caller decide o que fazer
   * (modal fecha + router.push, page so router.push). Se nao passado,
   * o form navega sozinho pra /vouchers/bulk/[batchId].
   */
  onSuccess?: (batchId: string) => void
}) {
  const router = useRouter()
  const [state, formAction] = useActionState<EmitVoucherSingleResult | null, FormData>(
    emitVoucherSingleAction,
    null,
  )
  const [partnershipId, setPartnershipId] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [combo, setCombo] = useState('')

  // Sucesso · delega pro caller OU navega default
  useEffect(() => {
    if (state?.ok && state.batchId) {
      if (onSuccess) onSuccess(state.batchId)
      else router.push(`/vouchers/bulk/${state.batchId}`)
    }
  }, [state, onSuccess, router])

  const selected = useMemo(
    () => partnerships.find((p) => p.id === partnershipId) ?? null,
    [partnerships, partnershipId],
  )

  // Quando muda parceria, pre-fill combo com o cadastrado
  function selectPartnership(id: string) {
    setPartnershipId(id)
    const p = partnerships.find((x) => x.id === id)
    if (p?.voucherCombo) setCombo(p.voucherCombo)
  }

  // Combos disponiveis · merge entre tabela b2b_voucher_combos + combos
  // efetivamente em uso pelas parcerias (caso algum combo legacy nao esteja
  // no catalog mas ainda esta nas parcerias).
  const allCombos = useMemo(() => {
    const set = new Set<string>(combos)
    for (const p of partnerships) {
      if (p.voucherCombo) set.add(p.voucherCombo)
    }
    return Array.from(set).sort()
  }, [combos, partnerships])

  // Phone · so digitos · UI mantem mascara visual mas state guarda raw
  function handlePhoneChange(raw: string) {
    // strip qualquer coisa que nao seja digito
    const digits = raw.replace(/\D/g, '').slice(0, 13) // max 13 (BR longo)
    setPhone(digits)
  }
  // Formata pra exibicao: (DDD) NNNNN-NNNN ou similar
  function formatPhoneDisplay(d: string): string {
    if (d.length === 0) return ''
    if (d.length <= 2) return `(${d}`
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }

  // Phone validation · ja garantido so digitos pelo handlePhoneChange
  const phoneDigits = phone
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 13
  const phoneFilled = phoneDigits.length > 0

  // Cap status · alerta se ja perto do cap mensal
  const capStatus: { tone: 'crit' | 'warn' | 'ok'; label: string } | null = (() => {
    if (!selected || selected.voucherMonthlyCap == null) return null
    const used = selected.vouchersIssuedThisMonth
    const cap = selected.voucherMonthlyCap
    const pct = cap > 0 ? (used / cap) * 100 : 0
    if (used >= cap) return { tone: 'crit' as const, label: `${used}/${cap} · cap atingido!` }
    if (pct >= 80) return { tone: 'warn' as const, label: `${used}/${cap} · perto do cap (${Math.round(pct)}%)` }
    return { tone: 'ok' as const, label: `${used}/${cap} emitidos este mês` }
  })()

  return (
    <form
      action={formAction}
      className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3.5"
    >
      {state?.ok === false && state.error ? (
        <div
          role="alert"
          className="rounded-md px-3 py-2 text-[12px]"
          style={{
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.4)',
            color: '#FCA5A5',
          }}
        >
          {state.error}
        </div>
      ) : null}
      <Field label="Parceria" id="v-partner" required>
        <select
          id="v-partner"
          name="partnership_id"
          required
          value={partnershipId}
          onChange={(e) => selectPartnership(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-md border border-white/10 text-xs focus:outline-none focus:border-[#C9A96E]/50"
          style={{
            colorScheme: 'dark',
            background: '#1A1814',
            color: '#F5F0E8',
          }}
        >
          <option value="" disabled style={{ background: '#1A1814', color: '#9CA3AF' }}>
            Selecionar parceria ativa…
          </option>
          {partnerships.map((p) => (
            <option
              key={p.id}
              value={p.id}
              style={{ background: '#1A1814', color: '#F5F0E8' }}
            >
              {p.name}
              {p.voucherCombo ? ` · combo: ${p.voucherCombo}` : ' · sem combo'}
            </option>
          ))}
        </select>
        {partnerships.length === 0 && (
          <span className="text-[10px] text-[#FCA5A5]">
            Nenhuma parceria ativa · cadastra uma em Estúdio › Cadastrar parceria
          </span>
        )}
      </Field>

      {/* Cascade panel · só aparece quando parceria selecionada */}
      {selected ? (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-2 px-3 py-2.5 rounded-md"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(201,169,110,0.18)',
          }}
        >
          <Stat label="Combo padrão" value={selected.voucherCombo ?? '—'} />
          <Stat
            label="Validade"
            value={`${selected.voucherValidityDays} dias`}
          />
          <Stat
            label="Cap mensal"
            value={
              selected.voucherMonthlyCap == null
                ? 'sem limite'
                : String(selected.voucherMonthlyCap)
            }
          />
          <Stat
            label="Este mês"
            value={capStatus?.label ?? '0 emitidos'}
            tone={capStatus?.tone}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome da convidada" id="v-name" required>
          <input
            id="v-name"
            name="name"
            type="text"
            required
            placeholder="Ana"
            className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
          />
        </Field>

        <Field label="Telefone (BR)" id="v-phone" required>
          <input
            id="v-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            required
            value={formatPhoneDisplay(phone)}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onKeyDown={(e) => {
              // Bloqueia letras · permite numeros, backspace, delete, setas, tab
              const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End']
              if (allowed.includes(e.key)) return
              if (e.ctrlKey || e.metaKey) return // copy/paste
              if (!/^[0-9]$/.test(e.key)) e.preventDefault()
            }}
            placeholder="(44) 99876-5432"
            className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border text-xs text-[#F5F0E8] font-mono focus:outline-none"
            style={{
              borderColor: phoneFilled
                ? phoneValid
                  ? 'rgba(16,185,129,0.6)'
                  : 'rgba(220,38,38,0.6)'
                : 'rgba(255,255,255,0.1)',
            }}
          />
          {phoneFilled ? (
            <span
              className="text-[10px] mt-0.5"
              style={{ color: phoneValid ? '#10B981' : '#FCA5A5' }}
            >
              {phoneValid
                ? `${phoneDigits.length} dígitos ✓`
                : `${phoneDigits.length}/10-13 dígitos`}
            </span>
          ) : null}
        </Field>
      </div>

      <Field label="Combo (default = combo da parceria)" id="v-combo">
        <select
          id="v-combo"
          name="combo"
          value={combo}
          onChange={(e) => setCombo(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-md border border-white/10 text-xs focus:outline-none focus:border-[#C9A96E]/50"
          style={{
            colorScheme: 'dark',
            background: '#1A1814',
            color: '#F5F0E8',
          }}
        >
          <option value="" style={{ background: '#1A1814', color: '#9CA3AF' }}>
            {selected?.voucherCombo
              ? `${selected.voucherCombo} (padrão da parceria)`
              : 'Selecionar combo…'}
          </option>
          {allCombos.map((c) => (
            <option
              key={c}
              value={c}
              style={{ background: '#1A1814', color: '#F5F0E8' }}
            >
              {c}
            </option>
          ))}
        </select>
        {allCombos.length === 0 ? (
          <span className="text-[10px] text-[#FCA5A5] mt-0.5">
            Nenhum combo cadastrado · adicione em /b2b/config/combos
          </span>
        ) : null}
      </Field>

      <Field label="Agendar pra (opcional · default agora)" id="v-sched">
        <input
          id="v-sched"
          name="scheduled_at"
          type="datetime-local"
          defaultValue={localNowInput()}
          className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
          style={{ colorScheme: 'dark' }}
        />
      </Field>

      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        <SubmitButton
          disabled={
            partnerships.length === 0 ||
            !partnershipId ||
            (phoneFilled && !phoneValid)
          }
          capCrit={capStatus?.tone === 'crit'}
        />
        <span className="text-[10px] text-[#6B7280]">
          Voucher entra na queue · dispatch ~1min
        </span>
      </div>
    </form>
  )
}

function SubmitButton({ disabled, capCrit }: { disabled: boolean; capCrit: boolean }) {
  const { pending } = useFormStatus()
  const label = pending
    ? 'Enfileirando…'
    : capCrit
      ? 'Emitir mesmo acima do cap'
      : 'Enfileirar e disparar'
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string
  id: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="eyebrow text-[#9CA3AF]">
        {label}
        {required && <span className="text-[#FCA5A5] ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'crit'
}) {
  const color =
    tone === 'crit' ? '#FCA5A5' : tone === 'warn' ? '#F59E0B' : '#F5F0E8'
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[1.2px] text-[#9CA3AF]">
        {label}
      </span>
      <span className="text-[12px]" style={{ color }}>
        {value}
      </span>
    </div>
  )
}
