'use client'

/**
 * SingleVoucherForm · client component pra /vouchers/novo.
 *
 * Pedido Alden 2026-04-27: formulario reativo · ao selecionar parceria,
 * mostra cascade com combo cadastrado, validade, cap mensal, vouchers
 * emitidos no mes. Combo vira dropdown (select) com combos validos
 * em vez de input livre. Background dark forcado.
 */

import { useMemo, useState } from 'react'
import { emitVoucherSingleAction } from './actions'

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
}: {
  partnerships: PartnershipOption[]
}) {
  const [partnershipId, setPartnershipId] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [combo, setCombo] = useState('')

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

  // Lista unica de combos cadastrados em todas parcerias · datalist autocomplete
  const allCombos = useMemo(() => {
    const set = new Set<string>()
    for (const p of partnerships) {
      if (p.voucherCombo) set.add(p.voucherCombo)
    }
    return Array.from(set).sort()
  }, [partnerships])

  // Phone validation visual · 10-13 digitos brasileiros
  const phoneDigits = phone.replace(/\D/g, '')
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
      action={emitVoucherSingleAction}
      className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3.5"
    >
      <Field label="Parceria" id="v-partner" required>
        <select
          id="v-partner"
          name="partnership_id"
          required
          value={partnershipId}
          onChange={(e) => selectPartnership(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
          style={{ colorScheme: 'dark' }}
        >
          <option value="" disabled>
            Selecionar parceria ativa…
          </option>
          {partnerships.map((p) => (
            <option key={p.id} value={p.id}>
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
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
        <input
          id="v-combo"
          name="combo"
          type="text"
          value={combo}
          onChange={(e) => setCombo(e.target.value)}
          list="v-combo-options"
          placeholder={selected?.voucherCombo ?? 'Selecione parceria primeiro'}
          className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
        />
        {allCombos.length > 0 ? (
          <datalist id="v-combo-options">
            {allCombos.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
        <button
          type="submit"
          disabled={
            partnerships.length === 0 ||
            !partnershipId ||
            (phoneFilled && !phoneValid)
          }
          className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {capStatus?.tone === 'crit'
            ? 'Emitir mesmo acima do cap'
            : 'Enfileirar e disparar'}
        </button>
        <span className="text-[10px] text-[#6B7280]">
          Voucher entra na queue · dispatch ~1min
        </span>
      </div>
    </form>
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
