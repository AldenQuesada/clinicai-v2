'use client'

/**
 * AdminsClient · espelho 1:1 de `b2b-config-admins.ui.js`.
 *
 * Lista de phones autorizados + form inline (novo/editar) + revogar/reativar.
 * Strings, classes (.bcfg-admin-*, .bcfg-pill-*) preservadas literalmente.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  upsertAdminPhoneAction,
  revokeAdminPhoneAction,
} from './actions'
import type { B2BAdminPhoneRaw } from '@clinicai/repositories'

type EditDraft = {
  phone_full: string
  name: string
  is_active: boolean
  can_approve: boolean
  can_create: boolean
  notes: string | null
  _new?: boolean
  phone_last8?: string
}

function fmtPhone(full: string | null | undefined): string {
  if (!full) return '—'
  const d = String(full).replace(/\D/g, '')
  if (d.length === 13) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 5)} ${d.slice(5, 9)}-${d.slice(9)}`
  }
  if (d.length === 12) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  }
  return full
}

export function AdminsClient({ initial }: { initial: B2BAdminPhoneRaw[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<EditDraft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function startNew() {
    setErrors({})
    setEditing({
      _new: true,
      phone_full: '',
      name: '',
      is_active: true,
      can_approve: true,
      can_create: true,
      notes: null,
    })
  }

  function startEdit(r: B2BAdminPhoneRaw) {
    setErrors({})
    setEditing({
      phone_full: r.phone_full,
      phone_last8: r.phone_last8,
      name: r.name,
      is_active: r.is_active,
      can_approve: r.can_approve,
      can_create: r.can_create,
      notes: r.notes,
    })
  }

  function cancel() {
    setEditing(null)
    setErrors({})
  }

  function patch<K extends keyof EditDraft>(key: K, value: EditDraft[K]) {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function onSave() {
    if (!editing) return
    const errs: Record<string, string> = {}
    if (editing.name.trim().length < 2) errs.name = 'Nome obrigatório'
    const digits = editing.phone_full.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 13) {
      errs.phone_full = 'WhatsApp inválido (10-13 dígitos)'
    }
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }

    startTransition(async () => {
      try {
        const r = await upsertAdminPhoneAction({
          phone_full: editing.phone_full,
          name: editing.name.trim(),
          is_active: editing.is_active,
          can_approve: editing.can_approve,
          can_create: editing.can_create,
          notes: editing.notes?.trim() || null,
        })
        if (!r.ok) {
          setErrors({ _global: r.error || 'Falha ao salvar' })
          return
        }
        setEditing(null)
        setErrors({})
        router.refresh()
      } catch (e) {
        setErrors({ _global: e instanceof Error ? e.message : String(e) })
      }
    })
  }

  function onRevoke(r: B2BAdminPhoneRaw) {
    if (
      !confirm(
        'Revogar esse admin? Ele não vai mais conseguir usar a Mira.',
      )
    )
      return
    startTransition(async () => {
      try {
        const out = await revokeAdminPhoneAction(r.phone_last8)
        if (!out.ok) {
          alert(`Erro: ${out.error || 'falha'}`)
          return
        }
        router.refresh()
      } catch (e) {
        alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  function onReactivate(r: B2BAdminPhoneRaw) {
    startTransition(async () => {
      try {
        const out = await upsertAdminPhoneAction({
          phone_full: r.phone_full,
          name: r.name,
          is_active: true,
          can_approve: r.can_approve,
          can_create: r.can_create,
          notes: r.notes,
        })
        if (!out.ok) {
          alert(`Erro: ${out.error || 'falha'}`)
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
      <div className="bcfg-admin-list">
        {initial.length === 0 ? (
          <div className="bcfg-empty">Nenhum admin cadastrado.</div>
        ) : (
          initial.map((r) => (
            <AdminRow
              key={r.phone_last8}
              r={r}
              onEdit={() => startEdit(r)}
              onRevoke={() => onRevoke(r)}
              onReactivate={() => onReactivate(r)}
              busy={pending}
            />
          ))
        )}
      </div>
      <button
        type="button"
        className="bcomm-btn bcomm-btn-primary"
        onClick={startNew}
        disabled={pending}
      >
        + Novo admin
      </button>

      {/* Modal overlay · padronizado com ProfessionalsClient (b2b-overlay
          fixed inset-0 z-1000 · clique fora fecha · sem replace de tela). */}
      {editing ? (
        <div
          className="b2b-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) cancel()
          }}
        >
          <div className="b2b-modal" style={{ maxWidth: 640 }}>
            <AdminForm
              draft={editing}
              errors={errors}
              saving={pending}
              onChange={patch}
              onSave={onSave}
              onCancel={cancel}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AdminRow({
  r,
  onEdit,
  onRevoke,
  onReactivate,
  busy,
}: {
  r: B2BAdminPhoneRaw
  onEdit: () => void
  onRevoke: () => void
  onReactivate: () => void
  busy: boolean
}) {
  return (
    <div
      className={'bcfg-admin-row' + (r.is_active ? '' : ' bcfg-admin-row-inactive')}
    >
      <div className="bcfg-admin-main">
        <div className="bcfg-admin-name">
          {r.name}
          {r.is_active ? null : (
            <span className="bcfg-pill bcfg-pill-inactive">inativo</span>
          )}
        </div>
        <div className="bcfg-admin-phone">
          {fmtPhone(r.phone_full)}{' '}
          <small className="bcfg-dim">· last8: {r.phone_last8}</small>
        </div>
        {r.notes ? <div className="bcfg-admin-notes">{r.notes}</div> : null}
      </div>
      <div className="bcfg-admin-caps">
        {r.can_create ? <span className="bcfg-cap">🆕 cadastrar</span> : null}
        {r.can_approve ? <span className="bcfg-cap">✅ aprovar</span> : null}
      </div>
      <div className="bcfg-admin-acts">
        <button
          type="button"
          className="bcomm-btn bcomm-btn-xs"
          onClick={onEdit}
          disabled={busy}
        >
          Editar
        </button>
        {r.is_active ? (
          <button
            type="button"
            className="bcomm-btn bcomm-btn-xs bcomm-btn-danger"
            onClick={onRevoke}
            disabled={busy}
          >
            Revogar
          </button>
        ) : (
          <button
            type="button"
            className="bcomm-btn bcomm-btn-xs"
            onClick={onReactivate}
            disabled={busy}
          >
            Reativar
          </button>
        )}
      </div>
    </div>
  )
}

function AdminForm({
  draft,
  errors,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: EditDraft
  errors: Record<string, string>
  saving: boolean
  onChange: <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = !!draft._new
  return (
    <div className="bcfg-admin-form">
      <div className="bcfg-form-hdr">
        <strong>
          {isNew ? 'Novo admin' : `Editando: ${draft.name || draft.phone_last8}`}
        </strong>
      </div>

      {errors._global ? <div className="bcfg-err">{errors._global}</div> : null}

      <div className="bcfg-grid-2">
        <label className="bcfg-field">
          <span className="bcfg-field-lbl">
            Nome <em>*</em>
          </span>
          <input
            type="text"
            className={'bcomm-input' + (errors.name ? ' b2b-input-err' : '')}
            value={draft.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="Ex: Alden Quesada"
          />
          {errors.name ? <div className="bcfg-err">{errors.name}</div> : null}
        </label>
        <label className="bcfg-field">
          <span className="bcfg-field-lbl">
            WhatsApp completo <em>*</em>
          </span>
          <input
            type="text"
            className={
              'bcomm-input' + (errors.phone_full ? ' b2b-input-err' : '')
            }
            value={draft.phone_full}
            onChange={(e) => onChange('phone_full', e.target.value)}
            placeholder="5544998787673"
            readOnly={!isNew}
          />
          {errors.phone_full ? (
            <div className="bcfg-err">{errors.phone_full}</div>
          ) : null}
        </label>
      </div>

      <div className="bcfg-checks">
        <label className="bcfg-check">
          <input
            type="checkbox"
            checked={draft.can_create}
            onChange={(e) => onChange('can_create', e.target.checked)}
          />
          <span>Pode cadastrar parcerias pela voz</span>
        </label>
        <label className="bcfg-check">
          <input
            type="checkbox"
            checked={draft.can_approve}
            onChange={(e) => onChange('can_approve', e.target.checked)}
          />
          <span>Pode aprovar/rejeitar candidatas</span>
        </label>
        <label className="bcfg-check">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => onChange('is_active', e.target.checked)}
          />
          <span>Admin ativo</span>
        </label>
      </div>

      <label className="bcfg-field">
        <span className="bcfg-field-lbl">Notas (opcional)</span>
        <input
          type="text"
          className="bcomm-input"
          value={draft.notes || ''}
          onChange={(e) => onChange('notes', e.target.value)}
          placeholder="Ex: número principal do celular"
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
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
