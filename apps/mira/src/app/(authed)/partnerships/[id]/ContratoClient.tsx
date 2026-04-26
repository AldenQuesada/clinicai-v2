'use client'

/**
 * ContratoClient · 2 sections lado a lado:
 *
 * ESQUERDA · Contrato (1 por parceria · upsert)
 *   - Status (draft/sent/signed/expired/cancelled)
 *   - Datas (sent_at / signed_at / expiry_date)
 *   - Termos versão (free text · ex 'v1')
 *   - File path (PDF storage · upload deferido pra fase 2)
 *   - Notas
 *
 * DIREITA · Atividades (1:N · timeline)
 *   - Lista chronologica por due_date asc
 *   - Cada item: kind + title + status + due_date + responsavel
 *   - Add nova / edit / completar / cancelar / deletar
 *
 * Visual luxury: cards b2b-card · headings serif · pills champagne.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  upsertContractAction,
  upsertActivityAction,
  deleteActivityAction,
} from './contrato-actions'
import type {
  PartnershipContractDTO,
  PartnershipActivityDTO,
  ContractStatus,
  ActivityKind,
  ActivityStatus,
  ActivityResponsible,
} from '@clinicai/repositories'

const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  signed: 'Assinado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
}

const ACTIVITY_KIND_LABELS: Record<ActivityKind, { label: string; emoji: string }> = {
  monthly_meeting: { label: 'Reunião mensal', emoji: '🤝' },
  content_post: { label: 'Post agendado', emoji: '📱' },
  event: { label: 'Evento conjunto', emoji: '🎉' },
  voucher_review: { label: 'Revisão de combos', emoji: '🎁' },
  training: { label: 'Capacitação equipe', emoji: '📚' },
  feedback_session: { label: 'Sessão de feedback', emoji: '💬' },
  custom: { label: 'Custom', emoji: '✦' },
}

const RESPONSIBLE_LABELS: Record<ActivityResponsible, string> = {
  clinic: 'Mira',
  partner: 'Parceira',
  both: 'Ambos',
}

function fmtDate(iso: string | null): string {
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

export function ContratoClient({
  partnershipId,
  canManage,
  initialContract,
  initialActivities,
}: {
  partnershipId: string
  canManage: boolean
  initialContract: PartnershipContractDTO | null
  initialActivities: PartnershipActivityDTO[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [editActivity, setEditActivity] = useState<PartnershipActivityDTO | null>(null)

  // Local state pra contrato (form editavel)
  const c = initialContract
  const [contractStatus, setContractStatus] = useState<ContractStatus>(c?.status ?? 'draft')
  const [termsVersion, setTermsVersion] = useState(c?.termsVersion ?? 'v1')
  const [signedAt, setSignedAt] = useState(c?.signedAt?.slice(0, 10) ?? '')
  const [expiryDate, setExpiryDate] = useState(c?.expiryDate ?? '')
  const [notes, setNotes] = useState(c?.notes ?? '')
  const [filePath, setFilePath] = useState(c?.filePath ?? '')

  function saveContract() {
    startTransition(async () => {
      const r = await upsertContractAction({
        partnership_id: partnershipId,
        status: contractStatus,
        terms_version: termsVersion || null,
        signed_at: signedAt ? new Date(signedAt).toISOString() : null,
        expiry_date: expiryDate || null,
        file_path: filePath || null,
        notes: notes || null,
      })
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'desconhecido'}`)
        return
      }
      setFeedback('Contrato salvo.')
      router.refresh()
    })
  }

  function markSigned() {
    setContractStatus('signed')
    if (!signedAt) {
      setSignedAt(new Date().toISOString().slice(0, 10))
    }
  }

  function onDeleteActivity(id: string) {
    if (!confirm('Excluir esta atividade?')) return
    startTransition(async () => {
      const r = await deleteActivityAction(id, partnershipId)
      if (!r.ok) setFeedback(`Erro: ${r.error || 'falha'}`)
      else router.refresh()
    })
  }

  function onToggleActivityStatus(a: PartnershipActivityDTO) {
    const nextStatus: ActivityStatus = a.status === 'completed' ? 'pending' : 'completed'
    startTransition(async () => {
      const r = await upsertActivityAction({
        id: a.id,
        partnership_id: partnershipId,
        title: a.title,
        kind: a.kind,
        status: nextStatus,
        due_date: a.dueDate,
        responsible: a.responsible,
        notes: a.notes,
      })
      if (!r.ok) setFeedback(`Erro: ${r.error || 'falha'}`)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {feedback && (
        <div className="text-[12px] text-[#C9A96E] bg-[#C9A96E]/10 border border-[#C9A96E]/22 rounded px-3 py-2">
          {feedback}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ESQUERDA · Contrato */}
        <section className="b2b-card flex flex-col gap-3">
          <header>
            <h3 className="b2b-card-title">📜 Contrato</h3>
            <p className="b2b-card-sub">
              {c
                ? `Versão ${c.termsVersion ?? 'v1'} · criado ${fmtDate(c.createdAt)}`
                : 'Nenhum contrato registrado'}
            </p>
          </header>

          <div className="flex flex-col gap-2.5">
            <Field
              label="Status"
              value={
                <select
                  className="b2b-input"
                  value={contractStatus}
                  onChange={(e) => setContractStatus(e.target.value as ContractStatus)}
                  disabled={!canManage || pending}
                >
                  {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {CONTRACT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              }
            />
            <Field
              label="Termos · versão"
              value={
                <input
                  className="b2b-input"
                  type="text"
                  value={termsVersion}
                  onChange={(e) => setTermsVersion(e.target.value)}
                  placeholder="v1"
                  disabled={!canManage || pending}
                />
              }
            />
            <div className="grid grid-cols-2 gap-2.5">
              <Field
                label="Assinado em"
                value={
                  <input
                    className="b2b-input"
                    type="date"
                    value={signedAt}
                    onChange={(e) => setSignedAt(e.target.value)}
                    disabled={!canManage || pending}
                  />
                }
              />
              <Field
                label="Vence em"
                value={
                  <input
                    className="b2b-input"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={!canManage || pending}
                  />
                }
              />
            </div>
            <Field
              label="PDF (path no storage · opcional)"
              value={
                <input
                  className="b2b-input"
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="contracts/2026/parceria-x.pdf"
                  disabled={!canManage || pending}
                />
              }
            />
            <Field
              label="Notas"
              value={
                <textarea
                  className="b2b-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  disabled={!canManage || pending}
                />
              }
            />
          </div>

          {canManage && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--b2b-border)]">
              {contractStatus !== 'signed' && (
                <button
                  type="button"
                  onClick={markSigned}
                  className="b2b-btn b2b-btn-primary"
                  disabled={pending}
                >
                  ✓ Marcar como assinado
                </button>
              )}
              <button
                type="button"
                onClick={saveContract}
                className="b2b-btn"
                disabled={pending}
              >
                {pending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          )}

          {c && (
            <div className="text-[10px] text-[var(--b2b-text-muted)] italic mt-2 pt-2 border-t border-[var(--b2b-border)]">
              Assinatura digital (Clicksign/FreeSign integration) fica como
              fase 2 · hoje admin marca manualmente.
            </div>
          )}
        </section>

        {/* DIREITA · Atividades */}
        <section className="b2b-card flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <div>
              <h3 className="b2b-card-title">🗓 Plano de atividades</h3>
              <p className="b2b-card-sub">
                {initialActivities.length} atividade
                {initialActivities.length === 1 ? '' : 's'} ·{' '}
                {initialActivities.filter((a) => a.status === 'completed').length} concluída
                {initialActivities.filter((a) => a.status === 'completed').length === 1
                  ? ''
                  : 's'}
              </p>
            </div>
            {canManage && !showActivityForm && !editActivity && (
              <button
                type="button"
                onClick={() => setShowActivityForm(true)}
                className="b2b-btn b2b-btn-primary"
                disabled={pending}
              >
                + Nova
              </button>
            )}
          </header>

          {(showActivityForm || editActivity) && (
            <ActivityForm
              partnershipId={partnershipId}
              initial={editActivity}
              onCancel={() => {
                setShowActivityForm(false)
                setEditActivity(null)
              }}
              onSaved={() => {
                setShowActivityForm(false)
                setEditActivity(null)
                router.refresh()
              }}
            />
          )}

          {initialActivities.length === 0 && !showActivityForm ? (
            <div className="text-[12px] text-[var(--b2b-text-muted)] italic text-center py-6">
              Nenhuma atividade planejada. Adicione a primeira reunião mensal,
              post agendado ou evento conjunto.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {initialActivities.map((a) => (
                <ActivityRow
                  key={a.id}
                  a={a}
                  canManage={canManage}
                  onToggle={() => onToggleActivityStatus(a)}
                  onEdit={() => setEditActivity(a)}
                  onDelete={() => onDeleteActivity(a.id)}
                  pending={pending}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-[1.4px] font-bold text-[var(--b2b-text-muted)]">
        {label}
      </label>
      {value}
    </div>
  )
}

function ActivityRow({
  a,
  canManage,
  onToggle,
  onEdit,
  onDelete,
  pending,
}: {
  a: PartnershipActivityDTO
  canManage: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  pending: boolean
}) {
  const meta = ACTIVITY_KIND_LABELS[a.kind]
  const isOverdue =
    a.status === 'pending' && a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10)
  const isDone = a.status === 'completed'

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 rounded border"
      style={{
        background: isDone ? 'rgba(16,185,129,0.04)' : 'var(--b2b-bg-2)',
        borderColor: isDone
          ? 'rgba(16,185,129,0.25)'
          : isOverdue
            ? 'rgba(239,68,68,0.3)'
            : 'var(--b2b-border)',
        opacity: a.status === 'cancelled' ? 0.5 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span style={{ fontSize: 14 }}>{meta.emoji}</span>
          <span
            className="text-[12px] font-semibold truncate"
            style={{
              color: 'var(--b2b-ivory)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {a.title}
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--b2b-border)] hover:border-[var(--b2b-champagne)] text-[var(--b2b-text-dim)] hover:text-[var(--b2b-champagne)]"
              title={isDone ? 'Desfazer' : 'Marcar como concluída'}
            >
              {isDone ? '↺' : '✓'}
            </button>
            <button
              type="button"
              onClick={onEdit}
              disabled={pending}
              className="text-[10px] px-2 py-0.5 rounded text-[var(--b2b-text-dim)] hover:text-[var(--b2b-champagne)]"
              title="Editar"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="text-[10px] px-2 py-0.5 rounded text-[var(--b2b-text-muted)] hover:text-[var(--b2b-red)]"
              title="Excluir"
            >
              🗑
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-[var(--b2b-text-muted)] flex-wrap">
        <span>{meta.label}</span>
        <span>·</span>
        <span style={{ color: isOverdue ? 'var(--b2b-red)' : undefined }}>
          {a.dueDate ? fmtDate(a.dueDate) : 'sem prazo'}
          {isOverdue ? ' · vencida' : ''}
        </span>
        <span>·</span>
        <span>responsável: {RESPONSIBLE_LABELS[a.responsible]}</span>
        {a.completedAt && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--b2b-sage)' }}>
              concluída {fmtDate(a.completedAt)}
            </span>
          </>
        )}
      </div>
      {a.notes && (
        <div className="text-[11px] text-[var(--b2b-text-dim)] italic">{a.notes}</div>
      )}
    </div>
  )
}

function ActivityForm({
  partnershipId,
  initial,
  onCancel,
  onSaved,
}: {
  partnershipId: string
  initial: PartnershipActivityDTO | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<ActivityKind>(initial?.kind ?? 'monthly_meeting')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [responsible, setResponsible] = useState<ActivityResponsible>(
    initial?.responsible ?? 'clinic',
  )
  const [activityNotes, setActivityNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  function onSave() {
    if (title.trim().length < 2) {
      setError('Título obrigatório (min 2 chars)')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await upsertActivityAction({
        id: initial?.id,
        partnership_id: partnershipId,
        kind,
        title: title.trim(),
        status: initial?.status ?? 'pending',
        due_date: dueDate || null,
        responsible,
        notes: activityNotes || null,
      })
      if (!r.ok) {
        setError(`Erro: ${r.error || 'falha'}`)
        return
      }
      onSaved()
    })
  }

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2.5"
      style={{
        background: 'rgba(201, 169, 110, 0.04)',
        border: '1px solid rgba(201, 169, 110, 0.22)',
      }}
    >
      <div className="text-[11px] uppercase tracking-[1.4px] font-bold text-[var(--b2b-champagne)]">
        {initial ? 'Editar atividade' : 'Nova atividade'}
      </div>
      <Field
        label="Tipo"
        value={
          <select
            className="b2b-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ActivityKind)}
            disabled={pending}
          >
            {(Object.keys(ACTIVITY_KIND_LABELS) as ActivityKind[]).map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KIND_LABELS[k].emoji} {ACTIVITY_KIND_LABELS[k].label}
              </option>
            ))}
          </select>
        }
      />
      <Field
        label="Título"
        value={
          <input
            className="b2b-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Reunião mensal · revisão Q2"
            disabled={pending}
          />
        }
      />
      <div className="grid grid-cols-2 gap-2.5">
        <Field
          label="Prazo"
          value={
            <input
              className="b2b-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={pending}
            />
          }
        />
        <Field
          label="Responsável"
          value={
            <select
              className="b2b-input"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value as ActivityResponsible)}
              disabled={pending}
            >
              <option value="clinic">{RESPONSIBLE_LABELS.clinic}</option>
              <option value="partner">{RESPONSIBLE_LABELS.partner}</option>
              <option value="both">{RESPONSIBLE_LABELS.both}</option>
            </select>
          }
        />
      </div>
      <Field
        label="Notas"
        value={
          <textarea
            className="b2b-input"
            value={activityNotes}
            onChange={(e) => setActivityNotes(e.target.value)}
            rows={2}
            disabled={pending}
          />
        }
      />
      {error && (
        <div className="text-[11px] text-[var(--b2b-red)]">{error}</div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="b2b-btn b2b-btn-primary"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="b2b-btn"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
