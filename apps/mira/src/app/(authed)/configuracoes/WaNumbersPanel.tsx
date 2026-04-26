'use client'

/**
 * WaNumbersPanel · painel direito da tab Channels.
 *
 * Lista wa_numbers cadastrados + modal cadastrar/editar/desativar.
 * Usa RPCs SECURITY DEFINER (mig 800-31):
 *   - wa_register_oficial
 *   - wa_update_meta (cobre todos os types)
 *   - wa_deactivate_any
 *
 * Profissionais (number_type=professional_private) sao read-only aqui ·
 * cadastro/edicao desses vive em /configuracoes?tab=pessoas (CRUD com
 * permissions + msg subscriptions).
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  registerOficialWaNumberAction,
  updateWaNumberMetaAction,
  deactivateWaNumberAction,
} from './actions'

export interface WaNumberPanelRow {
  id: string
  phone: string
  phoneNumberId: string | null
  label: string | null
  isActive: boolean
  numberType: string | null
}

type DraftMode = 'new_oficial' | 'edit'

interface Draft {
  mode: DraftMode
  id?: string
  numberType: string | null
  phone: string
  label: string
  phoneNumberId: string
  isActive: boolean
}

export function WaNumbersPanel({ rows }: { rows: WaNumberPanelRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; label: string } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const oficial = rows.filter((r) => r.numberType === 'oficial')
  const profissional = rows.filter((r) => r.numberType === 'professional_private')
  const outros = rows.filter(
    (r) => r.numberType !== 'oficial' && r.numberType !== 'professional_private',
  )

  function startNewOficial() {
    setFeedback(null)
    setEditing({
      mode: 'new_oficial',
      numberType: 'oficial',
      phone: '',
      label: '',
      phoneNumberId: '',
      isActive: true,
    })
  }

  function startEdit(r: WaNumberPanelRow) {
    setFeedback(null)
    setEditing({
      mode: 'edit',
      id: r.id,
      numberType: r.numberType,
      phone: r.phone,
      label: r.label || '',
      phoneNumberId: r.phoneNumberId || '',
      isActive: r.isActive,
    })
  }

  function cancel() {
    setEditing(null)
  }

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function onSave() {
    if (!editing) return
    startTransition(async () => {
      try {
        if (editing.mode === 'new_oficial') {
          if (editing.phone.replace(/\D/g, '').length < 10) {
            setFeedback('Telefone invalido')
            return
          }
          const r = await registerOficialWaNumberAction({
            phone: editing.phone,
            label: editing.label || null,
            phone_number_id: editing.phoneNumberId || null,
          })
          if (!r.ok) {
            setFeedback(`Erro: ${r.error || 'desconhecido'}`)
            return
          }
          setFeedback('Numero oficial cadastrado.')
        } else {
          const r = await updateWaNumberMetaAction(editing.id!, {
            label: editing.label || null,
            // String vazia → seta NULL (RPC trata)
            phone_number_id: editing.phoneNumberId,
            is_active: editing.isActive,
          })
          if (!r.ok) {
            setFeedback(`Erro: ${r.error || 'desconhecido'}`)
            return
          }
          setFeedback('Numero atualizado.')
        }
        setEditing(null)
        router.refresh()
      } catch (e) {
        setFeedback(`Erro: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  function onConfirmDeactivate() {
    if (!confirmDeactivate) return
    const id = confirmDeactivate.id
    setConfirmDeactivate(null)
    startTransition(async () => {
      const r = await deactivateWaNumberAction(id)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback('Numero desativado.')
      router.refresh()
    })
  }

  return (
    <section className="bg-white/[0.02] border border-white/10 rounded-lg p-3.5 flex flex-col gap-2.5 min-w-0">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
            Numeros WhatsApp cadastrados
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            {rows.length} total · {rows.filter((r) => r.isActive).length} ativos
          </p>
        </div>
        <button
          type="button"
          onClick={startNewOficial}
          disabled={pending}
          className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-50"
        >
          + Cadastrar oficial
        </button>
      </header>

      {feedback && (
        <div className="text-[10.5px] text-[#C9A96E] bg-[#C9A96E]/10 border border-[#C9A96E]/20 rounded px-2.5 py-1.5">
          {feedback}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-[11px] text-[#9CA3AF] py-4 text-center italic">
          Nenhum numero cadastrado.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {oficial.length > 0 && (
            <Group label="Oficial" rows={oficial} onEdit={startEdit} onDeactivate={(r) => setConfirmDeactivate({ id: r.id, label: r.label || r.phone })} pending={pending} canEdit />
          )}
          {profissional.length > 0 && (
            <Group label="Professional · CRUD em Pessoas" rows={profissional} onEdit={() => router.push('/configuracoes?tab=pessoas')} onDeactivate={() => router.push('/configuracoes?tab=pessoas')} pending={pending} canEdit={false} />
          )}
          {outros.length > 0 && (
            <Group label="Outros types" rows={outros} onEdit={startEdit} onDeactivate={(r) => setConfirmDeactivate({ id: r.id, label: r.label || r.phone })} pending={pending} canEdit />
          )}
        </div>
      )}

      {/* Modal cadastrar/editar */}
      {editing && (
        <Modal onClose={cancel}>
          <header className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[14px] font-bold text-[#F5F0E8]">
              {editing.mode === 'new_oficial'
                ? 'Cadastrar numero oficial'
                : `Editar · ${editing.phone}`}
            </h3>
            <button
              type="button"
              onClick={cancel}
              className="text-[#9CA3AF] hover:text-[#F5F0E8] text-xl leading-none"
            >
              ×
            </button>
          </header>

          <div className="flex flex-col gap-3">
            <Field
              label="Telefone (E.164 sem +)"
              value={editing.phone}
              onChange={(v) => patch('phone', v)}
              placeholder="5544998787673"
              disabled={editing.mode === 'edit'}
              mono
            />
            <Field
              label="Label"
              value={editing.label}
              onChange={(v) => patch('label', v)}
              placeholder="Mira (onboarding + parceiros B2B)"
            />
            <Field
              label="Phone Number ID (Evolution instance)"
              value={editing.phoneNumberId}
              onChange={(v) => patch('phoneNumberId', v)}
              placeholder="mira-mirian"
              mono
              hint="Deixar vazio = sem instance (numero nao envia)"
            />
            {editing.mode === 'edit' && (
              <label className="flex items-center gap-2 text-[12px] text-[#F5F0E8]">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) => patch('isActive', e.target.checked)}
                  className="w-4 h-4"
                  style={{ accentColor: '#C9A96E' }}
                />
                <span>Ativo</span>
              </label>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-[1px] bg-white/[0.05] text-[#9CA3AF] hover:bg-white/[0.08] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] disabled:opacity-50"
            >
              {pending ? '...' : 'Salvar'}
            </button>
          </footer>
        </Modal>
      )}

      {/* Confirm desativar */}
      {confirmDeactivate && (
        <Modal onClose={() => setConfirmDeactivate(null)}>
          <h3 className="text-[14px] font-bold text-[#F5F0E8] mb-2">
            Desativar numero
          </h3>
          <p className="text-[12px] text-[#9CA3AF] mb-4">
            <strong className="text-[#F5F0E8]">{confirmDeactivate.label}</strong>{' '}
            ficara inativo · canais que apontam pra ele param de enviar.
          </p>
          <footer className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => setConfirmDeactivate(null)}
              disabled={pending}
              className="px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-[1px] bg-white/[0.05] text-[#9CA3AF] hover:bg-white/[0.08] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirmDeactivate}
              disabled={pending}
              className="px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-[1px] bg-[#EF4444] text-white hover:bg-[#DC2626] disabled:opacity-50"
            >
              {pending ? '...' : 'Desativar'}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  )
}

function Group({
  label,
  rows,
  onEdit,
  onDeactivate,
  pending,
  canEdit,
}: {
  label: string
  rows: WaNumberPanelRow[]
  onEdit: (r: WaNumberPanelRow) => void
  onDeactivate: (r: WaNumberPanelRow) => void
  pending: boolean
  canEdit: boolean
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[1.4px] font-bold text-[#6B7280] mb-1.5">
        {label}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((n) => (
          <div
            key={n.id}
            className="bg-black/15 border border-white/5 rounded-md px-3 py-2 flex flex-col gap-0.5"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[12px] font-mono font-bold text-[#F5F0E8]">
                {n.phone}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[8.5px] font-bold uppercase tracking-[1.1px] px-1.5 py-0.5 rounded ${
                    n.isActive
                      ? 'bg-[#10B981]/15 text-[#10B981]'
                      : 'bg-white/10 text-[#9CA3AF]'
                  }`}
                >
                  {n.isActive ? 'ATIVO' : 'INATIVO'}
                </span>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(n)}
                      disabled={pending}
                      className="text-[10px] text-[#9CA3AF] hover:text-[#C9A96E] disabled:opacity-50"
                      title="Editar"
                    >
                      ✎
                    </button>
                    {n.isActive && (
                      <button
                        type="button"
                        onClick={() => onDeactivate(n)}
                        disabled={pending}
                        className="text-[10px] text-[#9CA3AF] hover:text-[#EF4444] disabled:opacity-50"
                        title="Desativar"
                      >
                        🗑
                      </button>
                    )}
                  </>
                )}
                {!canEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(n)}
                    className="text-[9px] text-[#6B7280] hover:text-[#C9A96E] underline"
                  >
                    abrir Pessoas
                  </button>
                )}
              </div>
            </div>
            <div className="text-[10.5px] text-[#9CA3AF]">
              {n.label || <em className="text-[#6B7280]">sem label</em>}
            </div>
            <div className="text-[9.5px] text-[#6B7280] font-mono">
              inst: {n.phoneNumberId ?? '—'}
              {!n.phoneNumberId && (
                <span className="text-[#F59E0B] ml-2">
                  · sem instance (nao envia)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  disabled?: boolean
  mono?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`px-2.5 py-1.5 rounded border border-white/10 bg-white/[0.02] text-[12px] text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50 ${
          mono ? 'font-mono' : ''
        }`}
      />
      {hint && (
        <span className="text-[9.5px] text-[#6B7280] italic">{hint}</span>
      )}
    </label>
  )
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-[#1A1814] border border-white/10 rounded-xl shadow-2xl p-5 w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
