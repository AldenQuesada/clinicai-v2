'use client'

/**
 * PadroesClient · espelho 1:1 de `b2b-config-defaults.ui.js`.
 *
 * 2 sub-blocos:
 *   A. Combos de voucher (CRUD b2b_voucher_combos)
 *   B. Outros padrões (cap, validade, antecedência, custo, CTA do voucher)
 *      em clinics.settings via b2b_clinic_defaults_*.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  upsertVoucherComboAction,
  deleteVoucherComboAction,
  updateClinicDefaultsAction,
} from './actions'

type ComboRow = {
  id: string
  label: string
  description: string | null
  is_default: boolean
  is_active: boolean
  sort_order: number
}

type DefaultsRaw = {
  voucher_monthly_cap?: number
  voucher_validity_days?: number
  voucher_min_notice_days?: number
  voucher_unit_cost_brl?: number
  voucher_cta?: { button_label: string; whatsapp_message: string }
  [k: string]: unknown
}

type ComboDraft = Partial<ComboRow> & {
  label?: string
  description?: string | null
  is_default?: boolean
  is_active?: boolean
  sort_order?: number
}

const DEFAULT_CTA_BUTTON = 'Agendar meu {combo}'
const DEFAULT_CTA_MSG =
  'Olá! Vim pelo voucher da parceria {parceira}. Gostaria de agendar meu {combo}.'

export function PadroesClient({
  initialCombos,
  initialDefaults,
}: {
  initialCombos: ComboRow[]
  initialDefaults: DefaultsRaw
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingCombo, setEditingCombo] = useState<ComboDraft | null>(null)

  // Defaults form state (controlled)
  const [cap, setCap] = useState<number>(
    Number(initialDefaults.voucher_monthly_cap ?? 5),
  )
  const [validity, setValidity] = useState<number>(
    Number(initialDefaults.voucher_validity_days ?? 30),
  )
  const [notice, setNotice] = useState<number>(
    Number(initialDefaults.voucher_min_notice_days ?? 15),
  )
  const [cost, setCost] = useState<number>(
    Number(initialDefaults.voucher_unit_cost_brl ?? 0),
  )
  const [ctaButton, setCtaButton] = useState<string>(
    initialDefaults.voucher_cta?.button_label || DEFAULT_CTA_BUTTON,
  )
  const [ctaMessage, setCtaMessage] = useState<string>(
    initialDefaults.voucher_cta?.whatsapp_message || DEFAULT_CTA_MSG,
  )

  function patchCombo<K extends keyof ComboDraft>(
    key: K,
    value: ComboDraft[K],
  ) {
    setEditingCombo((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function startNewCombo() {
    setEditingCombo({
      label: '',
      description: '',
      is_default: false,
      is_active: true,
      sort_order: 100,
    })
  }

  function startEditCombo(c: ComboRow) {
    setEditingCombo({ ...c })
  }

  function cancelCombo() {
    setEditingCombo(null)
  }

  function saveCombo() {
    if (!editingCombo) return
    const label = (editingCombo.label || '').trim()
    if (label.length < 2) {
      alert('Nome do combo é obrigatório')
      return
    }
    startTransition(async () => {
      try {
        const r = await upsertVoucherComboAction({
          id: editingCombo.id,
          label,
          description: editingCombo.description?.trim() || null,
          is_default: !!editingCombo.is_default,
          is_active: editingCombo.is_active !== false,
          sort_order: Number(editingCombo.sort_order ?? 100),
        })
        if (!r.ok) {
          alert(`Erro: ${r.error || 'falha'}`)
          return
        }
        setEditingCombo(null)
        router.refresh()
      } catch (e) {
        alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  function removeCombo(id: string, label: string) {
    if (!confirm(`Remover combo "${label}"?`)) return
    startTransition(async () => {
      try {
        const r = await deleteVoucherComboAction(id)
        if (!r.ok) {
          alert(`Erro: ${r.error || 'falha'}`)
          return
        }
        router.refresh()
      } catch (e) {
        alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  function resetDefaults() {
    setCap(Number(initialDefaults.voucher_monthly_cap ?? 5))
    setValidity(Number(initialDefaults.voucher_validity_days ?? 30))
    setNotice(Number(initialDefaults.voucher_min_notice_days ?? 15))
    setCost(Number(initialDefaults.voucher_unit_cost_brl ?? 0))
    setCtaButton(initialDefaults.voucher_cta?.button_label || DEFAULT_CTA_BUTTON)
    setCtaMessage(
      initialDefaults.voucher_cta?.whatsapp_message || DEFAULT_CTA_MSG,
    )
  }

  function saveDefaults() {
    startTransition(async () => {
      try {
        const r = await updateClinicDefaultsAction({
          voucher_monthly_cap: cap || 5,
          voucher_validity_days: validity || 30,
          voucher_min_notice_days: notice || 15,
          voucher_unit_cost_brl: cost || 0,
          voucher_cta: {
            button_label: ctaButton.trim() || DEFAULT_CTA_BUTTON,
            whatsapp_message: ctaMessage.trim() || DEFAULT_CTA_MSG,
          },
        })
        if (!r.ok) {
          alert(`Erro: ${r.error || 'falha'}`)
          return
        }
        router.refresh()
      } catch (e) {
        alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  return (
    <div className="bcfg-body">
      {/* ─── Combos ─────────────────────────────────────────── */}
      <div className="bcfg-section-sub">Combos de voucher</div>
      <p className="bcfg-hint">
        Lista de pacotes disponíveis. O form de cadastro de parceria apresenta
        esse catálogo + opção &quot;outro&quot; pra livre.
      </p>

      {editingCombo ? (
        <ComboForm
          draft={editingCombo}
          saving={pending}
          onChange={patchCombo}
          onSave={saveCombo}
          onCancel={cancelCombo}
        />
      ) : (
        <>
          <div className="bcfg-combo-list">
            {initialCombos.length === 0 ? (
              <div className="bcfg-empty">Nenhum combo cadastrado.</div>
            ) : (
              initialCombos.map((c) => (
                <ComboRow
                  key={c.id}
                  c={c}
                  onEdit={() => startEditCombo(c)}
                  onDelete={() => removeCombo(c.id, c.label)}
                  busy={pending}
                />
              ))
            )}
          </div>
          <button
            type="button"
            className="bcomm-btn bcomm-btn-primary"
            onClick={startNewCombo}
            disabled={pending}
          >
            + Novo combo
          </button>
        </>
      )}

      {/* ─── Defaults numericos ─────────────────────────────── */}
      <div className="bcfg-section-sub" style={{ marginTop: 24 }}>
        Outros padrões
      </div>
      <p className="bcfg-hint">
        Cap mensal, validade, antecedência e custo default do voucher. Aplicados
        a cada nova parceria.
      </p>

      <div className="bcfg-grid-3">
        <label className="bcfg-field">
          <span className="bcfg-field-lbl">Cap mensal (un.)</span>
          <input
            type="number"
            className="bcomm-input"
            value={cap}
            min={0}
            max={100}
            onChange={(e) => setCap(Number(e.target.value) || 0)}
          />
        </label>
        <label className="bcfg-field">
          <span className="bcfg-field-lbl">Validade (dias)</span>
          <input
            type="number"
            className="bcomm-input"
            value={validity}
            min={1}
            max={365}
            onChange={(e) => setValidity(Number(e.target.value) || 0)}
          />
        </label>
        <label className="bcfg-field">
          <span className="bcfg-field-lbl">Antecedência (dias)</span>
          <input
            type="number"
            className="bcomm-input"
            value={notice}
            min={0}
            max={90}
            onChange={(e) => setNotice(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <label className="bcfg-field">
        <span className="bcfg-field-lbl">
          Custo real por voucher (R$){' '}
          <small className="bcfg-dim">— usado em ROI/impacto</small>
        </span>
        <input
          type="number"
          className="bcomm-input"
          value={cost}
          min={0}
          step={0.01}
          onChange={(e) => setCost(Number(e.target.value) || 0)}
        />
      </label>

      <div className="bcfg-section-sub" style={{ marginTop: 20 }}>
        CTA do voucher (botão e mensagem WhatsApp)
      </div>
      <p className="bcfg-hint">
        Texto do botão de agendamento dentro da página pública do voucher +
        mensagem pré-preenchida que abre no WhatsApp da clínica. Placeholders:{' '}
        <code>{'{combo}'}</code>, <code>{'{parceira}'}</code>,{' '}
        <code>{'{convidada}'}</code>, <code>{'{convidada_first}'}</code>.
      </p>

      <label className="bcfg-field">
        <span className="bcfg-field-lbl">Texto do botão</span>
        <input
          type="text"
          className="bcomm-input"
          value={ctaButton}
          onChange={(e) => setCtaButton(e.target.value)}
          placeholder={DEFAULT_CTA_BUTTON}
        />
      </label>

      <label className="bcfg-field">
        <span className="bcfg-field-lbl">Mensagem WhatsApp pré-preenchida</span>
        <textarea
          className="bcomm-input bcomm-textarea"
          rows={3}
          value={ctaMessage}
          onChange={(e) => setCtaMessage(e.target.value)}
          placeholder={DEFAULT_CTA_MSG}
        />
      </label>

      <div className="bcfg-form-actions">
        <button
          type="button"
          className="bcomm-btn"
          onClick={resetDefaults}
          disabled={pending}
        >
          Desfazer
        </button>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary"
          onClick={saveDefaults}
          disabled={pending}
        >
          {pending ? 'Salvando…' : 'Salvar padrões'}
        </button>
      </div>
    </div>
  )
}

function ComboRow({
  c,
  onEdit,
  onDelete,
  busy,
}: {
  c: ComboRow
  onEdit: () => void
  onDelete: () => void
  busy: boolean
}) {
  return (
    <div
      className={'bcfg-combo-row' + (c.is_active ? '' : ' bcfg-combo-row-inactive')}
    >
      <div className="bcfg-combo-main">
        <div className="bcfg-combo-lbl">
          {c.label}
          {c.is_default ? (
            <span className="bcfg-pill bcfg-pill-default">padrão</span>
          ) : null}
          {c.is_active ? null : (
            <span className="bcfg-pill bcfg-pill-inactive">inativo</span>
          )}
        </div>
        {c.description ? (
          <div className="bcfg-combo-desc">{c.description}</div>
        ) : null}
      </div>
      <div className="bcfg-combo-acts">
        <button
          type="button"
          className="bcomm-btn bcomm-btn-xs"
          onClick={onEdit}
          disabled={busy}
        >
          Editar
        </button>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-xs bcomm-btn-danger"
          onClick={onDelete}
          disabled={busy}
        >
          Remover
        </button>
      </div>
    </div>
  )
}

function ComboForm({
  draft,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: ComboDraft
  saving: boolean
  onChange: <K extends keyof ComboDraft>(key: K, value: ComboDraft[K]) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = !draft.id
  return (
    <div className="bcfg-combo-form">
      <div className="bcfg-form-hdr">
        <strong>{isNew ? 'Novo combo' : `Editando: ${draft.label}`}</strong>
      </div>

      <label className="bcfg-field">
        <span className="bcfg-field-lbl">
          Nome do combo <em>*</em>
        </span>
        <input
          type="text"
          className="bcomm-input"
          value={draft.label || ''}
          onChange={(e) => onChange('label', e.target.value)}
          placeholder="Ex: Anovator A5"
        />
      </label>

      <label className="bcfg-field">
        <span className="bcfg-field-lbl">Descrição (opcional)</span>
        <input
          type="text"
          className="bcomm-input"
          value={draft.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Nota interna, não aparece pra parceira"
        />
      </label>

      <div className="bcfg-checks">
        <label className="bcfg-check">
          <input
            type="checkbox"
            checked={!!draft.is_default}
            onChange={(e) => onChange('is_default', e.target.checked)}
          />
          <span>Marcar como padrão (pre-selecionado no form)</span>
        </label>
        <label className="bcfg-check">
          <input
            type="checkbox"
            checked={draft.is_active !== false}
            onChange={(e) => onChange('is_active', e.target.checked)}
          />
          <span>Ativo no catálogo</span>
        </label>
      </div>

      <label className="bcfg-field">
        <span className="bcfg-field-lbl">Ordem (menor = primeiro)</span>
        <input
          type="number"
          className="bcomm-input"
          value={draft.sort_order ?? 100}
          min={0}
          onChange={(e) => onChange('sort_order', Number(e.target.value) || 100)}
        />
      </label>

      <div className="bcfg-form-actions">
        <button
          type="button"
          className="bcomm-btn bcomm-btn-ghost"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="bcomm-btn bcomm-btn-primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Salvando…' : 'Salvar combo'}
        </button>
      </div>
    </div>
  )
}
