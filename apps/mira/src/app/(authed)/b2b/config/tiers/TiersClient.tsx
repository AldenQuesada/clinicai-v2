'use client'

/**
 * TiersClient · cards editaveis dos 3 tiers (1/2/3) da clinica.
 *
 * Cada card tem · label / description / color picker / cap mensal R$
 * / combo default (datalist) / validade voucher (dias) / cap mensal voucher (un).
 *
 * Save por tier · chama saveTierConfigAction(payload) que upserta + revalida
 * /b2b/config/tiers + /estudio/cadastrar (Wizard le defaults via SSR).
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveTierConfigAction } from './actions'

export interface TierDraft {
  tier: 1 | 2 | 3
  label: string
  description: string | null
  colorHex: string
  defaultMonthlyCapBrl: number | null
  defaultVoucherCombo: string | null
  defaultVoucherValidityDays: number
  defaultVoucherMonthlyCap: number | null
  sortOrder: number
  persisted: boolean
}

interface ComboOption {
  label: string
  isDefault: boolean
}

export function TiersClient({
  initialTiers,
  comboOptions,
}: {
  initialTiers: TierDraft[]
  comboOptions: ComboOption[]
}) {
  return (
    <div className="bcfg-body flex flex-col gap-5">
      <p className="bcfg-hint">
        Cada parceria entra em 1 dos 3 tiers (1/2/3). Os valores abaixo viram
        <strong> defaults herdados</strong> ao cadastrar uma nova parceria —
        admin pode editar caso a caso.
      </p>

      <div className="flex flex-col gap-3">
        {initialTiers.map((t) => (
          <TierCard
            key={t.tier}
            initial={t}
            comboOptions={comboOptions}
          />
        ))}
      </div>

      <TiersStyles />
    </div>
  )
}

function TierCard({
  initial,
  comboOptions,
}: {
  initial: TierDraft
  comboOptions: ComboOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<TierDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  function patch<K extends keyof TierDraft>(key: K, value: TierDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function reset() {
    setDraft(initial)
    setError(null)
  }

  function save() {
    setError(null)
    if (!draft.label.trim() || draft.label.trim().length < 2) {
      setError('Nome do tier obrigatorio (min 2 chars)')
      return
    }
    startTransition(async () => {
      try {
        const r = await saveTierConfigAction({
          tier: draft.tier,
          label: draft.label.trim(),
          description: draft.description?.trim() || null,
          colorHex: draft.colorHex || null,
          defaultMonthlyCapBrl: draft.defaultMonthlyCapBrl,
          defaultVoucherCombo: draft.defaultVoucherCombo,
          defaultVoucherValidityDays: draft.defaultVoucherValidityDays,
          defaultVoucherMonthlyCap: draft.defaultVoucherMonthlyCap,
          sortOrder: draft.sortOrder,
        })
        if (!r.ok) {
          setError(r.error || 'Falha ao salvar')
          return
        }
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1800)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const dirty =
    draft.label !== initial.label ||
    (draft.description ?? '') !== (initial.description ?? '') ||
    draft.colorHex !== initial.colorHex ||
    draft.defaultMonthlyCapBrl !== initial.defaultMonthlyCapBrl ||
    (draft.defaultVoucherCombo ?? '') !== (initial.defaultVoucherCombo ?? '') ||
    draft.defaultVoucherValidityDays !== initial.defaultVoucherValidityDays ||
    draft.defaultVoucherMonthlyCap !== initial.defaultVoucherMonthlyCap

  const datalistId = `tier-combo-list-${draft.tier}`

  return (
    <div
      className="rounded-lg border border-white/10 bg-[#C9A96E]/[0.03] p-4 flex flex-col gap-3"
      style={{ borderLeftWidth: 4, borderLeftColor: draft.colorHex || '#C9A96E' }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold"
            style={{
              background: `${draft.colorHex || '#C9A96E'}20`,
              color: draft.colorHex || '#C9A96E',
              border: `1px solid ${draft.colorHex || '#C9A96E'}55`,
            }}
            title={`Tier ${draft.tier}`}
          >
            {draft.tier}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[2px] font-bold text-[#C9A96E]">
              Tier {draft.tier}
            </span>
            <span className="text-[14px] text-[#F5F0E8] font-medium">
              {draft.label || '—'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!initial.persisted && (
            <span className="text-[9px] uppercase tracking-[1.4px] text-[#FCD34D] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded px-1.5 py-0.5">
              nao salvo
            </span>
          )}
          {savedFlash && (
            <span className="text-[9px] uppercase tracking-[1.4px] text-[#86EFAC] bg-[#16A34A]/10 border border-[#16A34A]/30 rounded px-1.5 py-0.5">
              salvo
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FieldLbl label="Nome (label exibido)" required>
          <input
            type="text"
            className="bcomm-input"
            value={draft.label}
            onChange={(e) => patch('label', e.target.value)}
            placeholder="Ex.: Premium"
          />
        </FieldLbl>
        <FieldLbl label="Cor (hex)">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={draft.colorHex || '#C9A96E'}
              onChange={(e) => patch('colorHex', e.target.value)}
              className="bcfg-tier-color-input"
              aria-label={`Cor do tier ${draft.tier}`}
            />
            <input
              type="text"
              className="bcomm-input font-mono"
              value={draft.colorHex || ''}
              onChange={(e) => patch('colorHex', e.target.value)}
              placeholder="#C9A96E"
              maxLength={9}
            />
          </div>
        </FieldLbl>
      </div>

      <FieldLbl label="Descricao (interna · aparece em tooltip do tier)">
        <textarea
          className="bcomm-input bcomm-textarea"
          rows={2}
          value={draft.description ?? ''}
          onChange={(e) => patch('description', e.target.value || null)}
          placeholder="Ex.: Parcerias estrategicas · alta exposicao + prioridade no calendario."
        />
      </FieldLbl>

      <div className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF] mt-1 pt-2 border-t border-white/5">
        Defaults herdados ao cadastrar parceria
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FieldLbl label="Cap mensal (R$)" hint="teto de valor mensal · NULL = sem teto">
          <input
            type="number"
            className="bcomm-input font-mono"
            value={draft.defaultMonthlyCapBrl ?? ''}
            min={0}
            step={50}
            onChange={(e) =>
              patch(
                'defaultMonthlyCapBrl',
                e.target.value === '' ? null : Number(e.target.value),
              )
            }
            placeholder="ex.: 2000"
          />
        </FieldLbl>
        <FieldLbl label="Validade voucher (dias)">
          <input
            type="number"
            className="bcomm-input font-mono"
            value={draft.defaultVoucherValidityDays}
            min={1}
            max={365}
            onChange={(e) =>
              patch(
                'defaultVoucherValidityDays',
                Number(e.target.value) || 30,
              )
            }
          />
        </FieldLbl>
        <FieldLbl label="Cap mensal voucher (un.)" hint="qtd · NULL = sem teto">
          <input
            type="number"
            className="bcomm-input font-mono"
            value={draft.defaultVoucherMonthlyCap ?? ''}
            min={0}
            max={999}
            onChange={(e) =>
              patch(
                'defaultVoucherMonthlyCap',
                e.target.value === '' ? null : Number(e.target.value),
              )
            }
            placeholder="ex.: 5"
          />
        </FieldLbl>
      </div>

      <FieldLbl label="Combo padrão" hint="datalist com combos existentes · pode digitar um novo">
        <input
          type="text"
          className="bcomm-input"
          list={datalistId}
          autoComplete="off"
          value={draft.defaultVoucherCombo ?? ''}
          onChange={(e) =>
            patch('defaultVoucherCombo', e.target.value || null)
          }
          placeholder="Escolha do catálogo ou digite"
        />
        <datalist id={datalistId}>
          {comboOptions.map((c) => (
            <option key={c.label} value={c.label}>
              {c.isDefault ? `${c.label} (padrão clinica)` : c.label}
            </option>
          ))}
        </datalist>
      </FieldLbl>

      {error && (
        <div className="rounded-md border border-[#FCA5A5]/30 bg-[#FCA5A5]/10 px-3 py-2 text-[11px] text-[#FCA5A5]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button
          type="button"
          className="bcomm-btn"
          onClick={reset}
          disabled={pending || !dirty}
        >
          Desfazer
        </button>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary ml-auto"
          onClick={save}
          disabled={pending || (!dirty && initial.persisted)}
          title={!initial.persisted ? 'Salvar primeira vez' : 'Salvar alteracoes'}
        >
          {pending ? 'Salvando…' : initial.persisted ? 'Salvar tier' : 'Criar tier'}
        </button>
      </div>
    </div>
  )
}

function FieldLbl({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="bcfg-field flex flex-col gap-1">
      <span className="bcfg-field-lbl text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">
        {label} {required && <span className="text-[#FCA5A5]">*</span>}
        {hint && (
          <span className="ml-1 normal-case font-normal tracking-normal text-[#6B7280]">
            · {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}

function TiersStyles() {
  return (
    <style jsx global>{`
      .bcfg-tier-color-input {
        width: 38px;
        height: 32px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
      }
      .bcfg-tier-color-input::-webkit-color-swatch-wrapper {
        padding: 2px;
      }
      .bcfg-tier-color-input::-webkit-color-swatch {
        border: none;
        border-radius: 4px;
      }
    `}</style>
  )
}
