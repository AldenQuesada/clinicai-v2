'use client'

/**
 * ProfessionalsClient · CRUD completo de wa_numbers (professional_private).
 *
 * Mirror funcional de `mira-config.ui.js` tab Profissionais:
 *   - Lista com escopo (OWN/FULL) + permissoes (Agenda/Pacientes/Financeiro)
 *   - Modal Cadastrar (selecionar profissional + escopo + permissoes)
 *   - Modal Editar (escopo + permissoes · phone read-only)
 *   - Confirm Remover (deactivate · soft-delete)
 *   - Reset quota diaria (wa_pro_rate_limit)
 *
 * Visual usa classes b2b-* / bcfg-* ja existentes (consistencia com resto Mira).
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  registerProfessionalAction,
  updateProfessionalAction,
  removeProfessionalAction,
  resetProfessionalQuotaAction,
} from './actions'
import type {
  WaNumberFullDTO,
  ProfessionalProfileDTO,
} from '@clinicai/repositories'

type Category = 'agenda' | 'pacientes' | 'financeiro' | 'b2b'

type Permissions = {
  agenda: boolean
  pacientes: boolean
  financeiro: boolean
  /** Controle de acesso B2B + mensagens automaticas de parceria/voucher */
  b2b: boolean
  /**
   * Subscriptions individuais por mensagem (override por key).
   * Default true (subscribed) se key ausente. Cron handlers checam:
   *   permissions[categoria] === true
   *   AND permissions.msg?.[messageKey] !== false
   */
  msg?: { [key: string]: boolean }
}

/**
 * Mensagens automaticas por categoria · cada uma com key estavel pra
 * subscription individual (mig 800-30+).
 *
 * Cada check no UI ativa o modulo + cada msg subscrita individualmente.
 * Crons que enviam essas msg filtram recipients por permissions.<categoria>=true
 * AND permissions.msg?.<key> !== false.
 */
type MessageDef = { key: string; label: string }
const PERMISSION_MESSAGES: Record<Category, MessageDef[]> = {
  agenda: [
    { key: 'agenda.appointment_reminder', label: 'Lembretes de consulta · 24h antes' },
    { key: 'agenda.no_show', label: 'Avisos de no-show no dia' },
    { key: 'agenda.gaps_weekly', label: 'Gaps de agenda da semana' },
    { key: 'agenda.daily_summary', label: 'Resumo do dia (consultas + livres)' },
  ],
  pacientes: [
    { key: 'pacientes.nps_received', label: 'NPS recebido (cada nova resposta)' },
    { key: 'pacientes.followup_due', label: 'Follow-up devido (apos X dias sem contato)' },
    { key: 'pacientes.lead_new', label: 'Lead novo no Lara' },
    { key: 'pacientes.silent', label: 'Paciente parou de responder' },
  ],
  financeiro: [
    { key: 'financeiro.daily_revenue', label: 'Revenue diario (8h SP)' },
    { key: 'financeiro.monthly_goal', label: 'Meta mensal · atingida ou em risco' },
    { key: 'financeiro.churn_alert', label: 'Alerta de churn financeiro' },
    { key: 'financeiro.ai_cost_cap', label: 'Custo IA acima do cap' },
    { key: 'financeiro.anomaly_check', label: 'Anomalia operacional (zero agenda, NaN receita)' },
  ],
  b2b: [
    { key: 'b2b.daily_top_insight', label: 'Top insight diario · 8h SP' },
    { key: 'b2b.critical_alerts', label: 'Alertas criticos parceria · over_cap, health_red' },
    { key: 'b2b.voucher_redeemed', label: 'Voucher resgatado / convertido em paciente' },
    { key: 'b2b.application_new', label: 'Candidatura nova ou pendente' },
    { key: 'b2b.renewal_60d', label: 'Parceria a renovar (60d antes)' },
    { key: 'b2b.partner_feedback', label: 'Feedback mensal por parceira' },
  ],
}

function isMsgSubscribed(perms: Permissions, key: string): boolean {
  return perms.msg?.[key] !== false
}

type EditDraft = {
  mode: 'register' | 'edit'
  waNumberId?: string
  phone: string
  professional_id: string
  professional_name: string
  label: string | null
  access_scope: 'own' | 'full'
  permissions: Permissions
}

export function ProfessionalsClient({
  initialNumbers,
  professionals,
  quotasToday,
}: {
  initialNumbers: WaNumberFullDTO[]
  professionals: ProfessionalProfileDTO[]
  /** Mapa professional_id → queries WhatsApp hoje (mig wa_pro_rate_limit). */
  quotasToday: Record<string, number>
}) {
  // Index professionals por id pra lookup rapido na row (specialty, etc.)
  const profById = new Map(professionals.map((p) => [p.id, p]))
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<EditDraft | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  function startNew() {
    setFeedback(null)
    setEditing({
      mode: 'register',
      phone: '',
      professional_id: '',
      professional_name: '',
      label: null,
      access_scope: 'own',
      permissions: { agenda: true, pacientes: true, financeiro: true, b2b: true },
    })
  }

  function startEdit(n: WaNumberFullDTO) {
    setFeedback(null)
    const rawMsg = (n.permissions as { msg?: Record<string, boolean> }).msg
    setEditing({
      mode: 'edit',
      waNumberId: n.id,
      phone: n.phone,
      professional_id: n.professionalId || '',
      professional_name: n.professionalName || n.label || '',
      label: n.label,
      access_scope: (n.accessScope as 'own' | 'full') || 'own',
      permissions: {
        agenda: n.permissions.agenda !== false,
        pacientes: n.permissions.pacientes !== false,
        financeiro: n.permissions.financeiro !== false,
        b2b: n.permissions.b2b !== false,
        msg: rawMsg && typeof rawMsg === 'object' ? { ...rawMsg } : undefined,
      },
    })
  }

  function cancel() {
    setEditing(null)
  }

  function patch<K extends keyof EditDraft>(key: K, value: EditDraft[K]) {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function patchPerm(key: Category, value: boolean) {
    setEditing((prev) =>
      prev ? { ...prev, permissions: { ...prev.permissions, [key]: value } } : prev,
    )
  }

  /**
   * Override individual de subscription por mensagem · escreve em
   * permissions.msg[key]. Default ausente (true). Quando user desmarca,
   * grava false explicito.
   */
  function patchMsg(key: string, subscribed: boolean) {
    setEditing((prev) => {
      if (!prev) return prev
      const msg = { ...(prev.permissions.msg ?? {}) }
      if (subscribed) {
        delete msg[key]
      } else {
        msg[key] = false
      }
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          msg: Object.keys(msg).length > 0 ? msg : undefined,
        },
      }
    })
  }

  function onProfessionalSelect(profId: string) {
    const p = professionals.find((x) => x.id === profId)
    if (!p) return
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            professional_id: p.id,
            professional_name: p.displayName,
            phone: p.phone || '',
            label: 'Mira ' + (p.displayName || '').split(' ')[0],
          }
        : prev,
    )
  }

  function onSave() {
    if (!editing) return
    if (!editing.professional_id) {
      setFeedback('Selecione um profissional')
      return
    }
    if (editing.phone.replace(/\D/g, '').length < 10) {
      setFeedback('Telefone invalido')
      return
    }
    if (
      !editing.permissions.agenda &&
      !editing.permissions.pacientes &&
      !editing.permissions.financeiro &&
      !editing.permissions.b2b
    ) {
      setFeedback('Marque ao menos uma permissao')
      return
    }

    startTransition(async () => {
      const fn = editing.mode === 'register' ? registerProfessionalAction : updateProfessionalAction
      const r = await fn({
        phone: editing.phone,
        professional_id: editing.professional_id,
        label: editing.label,
        access_scope: editing.access_scope,
        permissions: editing.permissions,
      })
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'desconhecido'}`)
        return
      }
      setEditing(null)
      setFeedback(editing.mode === 'register' ? 'Profissional cadastrado!' : 'Atualizado!')
      router.refresh()
    })
  }

  function onConfirmRemove() {
    if (!confirmRemove) return
    const id = confirmRemove.id
    setConfirmRemove(null)
    startTransition(async () => {
      const r = await removeProfessionalAction(id)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback('Acesso removido')
      router.refresh()
    })
  }

  function onResetQuota(profId: string, name: string) {
    if (!profId) return
    if (!confirm(`Resetar a quota diaria de ${name}?`)) return
    startTransition(async () => {
      const r = await resetProfessionalQuotaAction(profId)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback(`Quota de ${name} resetada`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-[1px]">
          {initialNumbers.length} profissional(is) autorizado(s)
        </div>
        <button
          type="button"
          className="b2b-btn b2b-btn-primary"
          onClick={startNew}
          disabled={pending}
        >
          + Cadastrar
        </button>
      </div>

      {feedback ? (
        <div className="text-[12px] text-[#C9A96E] bg-[#C9A96E]/10 border border-[#C9A96E]/20 rounded px-3 py-2">
          {feedback}
        </div>
      ) : null}

      {/* Lista */}
      {initialNumbers.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
          Nenhum profissional cadastrado. Clique em &quot;+ Cadastrar&quot; para autorizar
          um profissional a usar a Mira via WhatsApp.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {initialNumbers.map((n) => (
            <ProfessionalRow
              key={n.id}
              n={n}
              specialty={profById.get(n.professionalId || '')?.specialty || null}
              queriesToday={quotasToday[n.professionalId || ''] || 0}
              busy={pending}
              onEdit={() => startEdit(n)}
              onRemove={() => setConfirmRemove({ id: n.id, name: n.professionalName || n.label || '—' })}
              onResetQuota={() =>
                onResetQuota(n.professionalId || '', n.professionalName || n.label || '—')
              }
            />
          ))}
        </div>
      )}

      {/* Modal cadastrar/editar */}
      {editing ? (
        <Modal onClose={cancel}>
          <ProfessionalForm
            draft={editing}
            professionals={professionals}
            saving={pending}
            onChange={patch}
            onChangePerm={patchPerm}
            onChangeMsg={patchMsg}
            onSelectProfessional={onProfessionalSelect}
            onSave={onSave}
            onCancel={cancel}
          />
        </Modal>
      ) : null}

      {/* Modal confirmar remoção */}
      {confirmRemove ? (
        <Modal onClose={() => setConfirmRemove(null)}>
          <div className="b2b-modal-body" style={{ textAlign: 'center', padding: 32 }}>
            <div
              style={{
                fontSize: 28,
                marginBottom: 12,
                color: '#EF4444',
              }}
            >
              ⚠
            </div>
            <h3 style={{ margin: 0, color: 'var(--b2b-ivory)', fontSize: 18 }}>
              Remover Acesso
            </h3>
            <p
              style={{
                marginTop: 8,
                fontSize: 13,
                color: 'var(--b2b-text-muted)',
              }}
            >
              Desativar o acesso de <strong>{confirmRemove.name}</strong> à Mira?
            </p>
          </div>
          <div className="b2b-form-actions" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="b2b-btn b2b-btn b2b-btn"
              onClick={() => setConfirmRemove(null)}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn b2b-btn b2b-btn-danger"
              onClick={onConfirmRemove}
              disabled={pending}
            >
              {pending ? 'Removendo…' : 'Remover'}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function ProfessionalRow({
  n,
  specialty,
  queriesToday,
  busy,
  onEdit,
  onRemove,
  onResetQuota,
}: {
  n: WaNumberFullDTO
  specialty: string | null
  queriesToday: number
  busy: boolean
  onEdit: () => void
  onRemove: () => void
  onResetQuota: () => void
}) {
  // Tone do uso · cap padrao 200 queries/dia (decisao Alden 2026-04-26)
  const QUOTA_CAP = 200
  const usagePct = Math.min(100, Math.round((queriesToday / QUOTA_CAP) * 100))
  const usageTone =
    queriesToday === 0
      ? 'text-[#6B7280]'
      : usagePct >= 90
        ? 'text-[#EF4444]'
        : usagePct >= 60
          ? 'text-[#F59E0B]'
          : 'text-[#10B981]'

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 bg-white/[0.02] border border-white/10 rounded-lg hover:border-white/14 transition-colors ${
        n.isActive ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1 basis-[180px] flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[#F5F0E8] truncate flex items-center gap-2 flex-wrap">
          {n.professionalName || n.label || '—'}
          {specialty ? (
            <span className="text-[10px] font-normal text-[#9CA3AF] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
              {specialty}
            </span>
          ) : null}
          {!n.isActive ? (
            <span className="text-[9px] uppercase tracking-[1.2px] text-[#9CA3AF] bg-white/5 px-1.5 py-0.5 rounded">
              inativo
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] flex-wrap font-mono">
          <span>{n.phone}</span>
          {n.label && n.label !== n.professionalName ? (
            <span className="text-[10.5px] text-[#6B7280]">{n.label}</span>
          ) : null}
          <span
            className={`text-[10.5px] ${usageTone}`}
            title={`${queriesToday} consulta(s) · cap diario ${QUOTA_CAP} (${usagePct}%)`}
          >
            · {queriesToday}/{QUOTA_CAP} hoje
          </span>
        </div>
      </div>

      <span
        className={`shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[1.2px] ${
          n.accessScope === 'full'
            ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
            : 'bg-white/10 text-[#9CA3AF]'
        }`}
      >
        {n.accessScope === 'full' ? 'FULL' : 'OWN'}
      </span>

      <div className="flex items-center gap-1 text-[10px] flex-wrap">
        {n.permissions.agenda !== false ? (
          <span className="bg-[#10B981]/15 text-[#10B981] px-1.5 py-0.5 rounded uppercase tracking-[0.5px]">
            Agenda
          </span>
        ) : null}
        {n.permissions.pacientes !== false ? (
          <span className="bg-[#3B82F6]/15 text-[#3B82F6] px-1.5 py-0.5 rounded uppercase tracking-[0.5px]">
            Pacientes
          </span>
        ) : null}
        {n.permissions.financeiro !== false ? (
          <span className="bg-[#8B5CF6]/15 text-[#8B5CF6] px-1.5 py-0.5 rounded uppercase tracking-[0.5px]">
            Financeiro
          </span>
        ) : null}
        {n.permissions.b2b !== false ? (
          <span className="bg-[#C9A96E]/15 text-[#C9A96E] px-1.5 py-0.5 rounded uppercase tracking-[0.5px]">
            B2B
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        <button
          type="button"
          className="b2b-btn b2b-btn-xs"
          onClick={onEdit}
          disabled={busy}
          title="Editar"
        >
          ✎
        </button>
        <button
          type="button"
          className="b2b-btn b2b-btn-xs"
          onClick={onResetQuota}
          disabled={busy || !n.professionalId}
          title="Resetar quota do dia"
          style={{ color: '#F59E0B' }}
        >
          ↻
        </button>
        <button
          type="button"
          className="b2b-btn b2b-btn-xs b2b-btn b2b-btn-danger"
          onClick={onRemove}
          disabled={busy}
          title="Remover"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function ProfessionalForm({
  draft,
  professionals,
  saving,
  onChange,
  onChangePerm,
  onChangeMsg,
  onSelectProfessional,
  onSave,
  onCancel,
}: {
  draft: EditDraft
  professionals: ProfessionalProfileDTO[]
  saving: boolean
  onChange: <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => void
  onChangePerm: (key: Category, value: boolean) => void
  onChangeMsg: (key: string, subscribed: boolean) => void
  onSelectProfessional: (profId: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = draft.mode === 'register'
  return (
    <>
      <header className="b2b-modal-hdr">
        <h2>{isNew ? 'Cadastrar Profissional' : `Editar — ${draft.professional_name}`}</h2>
        <button
          type="button"
          className="b2b-close"
          onClick={onCancel}
          aria-label="Fechar"
        >
          ×
        </button>
      </header>

      <div className="b2b-modal-body">
        {isNew ? (
          <label className="b2b-field">
            <span className="b2b-field-lbl">Profissional</span>
            <select
              className="b2b-input"
              value={draft.professional_id}
              onChange={(e) => onSelectProfessional(e.target.value)}
            >
              <option value="">— escolha —</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} — {p.phone}
                  {p.specialty ? ` · ${p.specialty}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="b2b-field">
          <span className="b2b-field-lbl">Telefone</span>
          <input
            type="text"
            className="b2b-input"
            value={draft.phone}
            readOnly={!isNew || !!draft.professional_id}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder={
              isNew && !draft.professional_id
                ? 'Auto ao selecionar profissional'
                : undefined
            }
            style={
              !isNew || !!draft.professional_id ? { background: 'rgba(255,255,255,0.04)' } : undefined
            }
          />
        </label>

        <label className="b2b-field">
          <span className="b2b-field-lbl">Escopo de acesso</span>
          <select
            className="b2b-input"
            value={draft.access_scope}
            onChange={(e) => onChange('access_scope', e.target.value as 'own' | 'full')}
          >
            <option value="own">Próprio (só dados do profissional)</option>
            <option value="full">Completo (todos os dados)</option>
          </select>
        </label>

        <div className="b2b-field">
          <span className="b2b-field-lbl">
            Permissões + Mensagens automáticas
          </span>
          <p
            style={{
              fontSize: 11,
              color: 'var(--b2b-text-muted)',
              margin: '0 0 8px',
              lineHeight: 1.4,
            }}
          >
            Cada categoria controla ACESSO ao módulo + MENSAGENS automáticas que o
            profissional recebe via WhatsApp. Expanda pra ver as mensagens de cada.
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--b2b-border)',
              borderRadius: 8,
            }}
          >
            <PermCheckbox
              label="Agenda"
              hint="Agenda, horários livres, lembretes de consulta"
              messages={PERMISSION_MESSAGES.agenda}
              accentColor="#10B981"
              checked={draft.permissions.agenda}
              onChange={(v) => onChangePerm('agenda', v)}
              isMsgSubscribed={(k) => isMsgSubscribed(draft.permissions, k)}
              onMsgChange={onChangeMsg}
            />
            <PermCheckbox
              label="Pacientes"
              hint="Busca, saldo, histórico, NPS, follow-ups"
              messages={PERMISSION_MESSAGES.pacientes}
              accentColor="#3B82F6"
              checked={draft.permissions.pacientes}
              onChange={(v) => onChangePerm('pacientes', v)}
              isMsgSubscribed={(k) => isMsgSubscribed(draft.permissions, k)}
              onMsgChange={onChangeMsg}
            />
            <PermCheckbox
              label="Financeiro"
              hint="Receita, comissão, meta, custo IA"
              messages={PERMISSION_MESSAGES.financeiro}
              accentColor="#8B5CF6"
              checked={draft.permissions.financeiro}
              onChange={(v) => onChangePerm('financeiro', v)}
              isMsgSubscribed={(k) => isMsgSubscribed(draft.permissions, k)}
              onMsgChange={onChangeMsg}
            />
            <PermCheckbox
              label="B2B"
              hint="Parcerias, vouchers, candidaturas, NPS de parceiras"
              messages={PERMISSION_MESSAGES.b2b}
              accentColor="#C9A96E"
              checked={draft.permissions.b2b}
              onChange={(v) => onChangePerm('b2b', v)}
              isMsgSubscribed={(k) => isMsgSubscribed(draft.permissions, k)}
              onMsgChange={onChangeMsg}
            />
          </div>
        </div>
      </div>

      <div className="b2b-form-actions" style={{ padding: '14px 24px' }}>
        <button
          type="button"
          className="b2b-btn b2b-btn b2b-btn"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="b2b-btn b2b-btn-primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Salvando…' : isNew ? 'Cadastrar' : 'Salvar'}
        </button>
      </div>
    </>
  )
}

function PermCheckbox({
  label,
  hint,
  messages,
  accentColor,
  checked,
  onChange,
  isMsgSubscribed,
  onMsgChange,
}: {
  label: string
  hint: string
  messages?: MessageDef[]
  accentColor?: string
  checked: boolean
  onChange: (v: boolean) => void
  isMsgSubscribed: (key: string) => boolean
  onMsgChange: (key: string, subscribed: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const accent = accentColor || 'var(--b2b-champagne)'
  // Conta quantas msgs estao silenciadas pra mostrar no botao expand
  const mutedCount = messages
    ? messages.filter((m) => !isMsgSubscribed(m.key)).length
    : 0
  const totalMsgs = messages?.length ?? 0
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 6,
        background: checked ? `${accent}10` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${checked ? `${accent}55` : 'rgba(255,255,255,0.05)'}`,
        transition: 'all 200ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{
            width: 16,
            height: 16,
            accentColor: accent,
            flexShrink: 0,
            marginTop: 2,
            cursor: 'pointer',
          }}
          aria-label={label}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: checked ? accent : 'var(--b2b-ivory)',
                cursor: 'pointer',
              }}
              onClick={() => onChange(!checked)}
            >
              {label}
            </span>
            {messages && totalMsgs > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setExpanded((p) => !p)
                }}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase',
                  color: mutedCount > 0 ? '#F59E0B' : '#9CA3AF',
                  background: 'transparent',
                  border: `1px solid ${mutedCount > 0 ? '#F59E0B40' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 4,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
                title={
                  mutedCount > 0
                    ? `${totalMsgs - mutedCount}/${totalMsgs} mensagens ativas`
                    : `${totalMsgs} mensagens automaticas`
                }
              >
                {expanded
                  ? '▾ msg'
                  : mutedCount > 0
                    ? `▸ ${totalMsgs - mutedCount}/${totalMsgs} msg`
                    : `▸ ${totalMsgs} msg`}
              </button>
            ) : null}
          </div>
          <div
            style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginTop: 1 }}
          >
            {hint}
          </div>
          {expanded && messages && (
            <div
              style={{
                margin: '10px 0 0',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {messages.map((m) => {
                const sub = isMsgSubscribed(m.key)
                const disabled = !checked
                return (
                  <label
                    key={m.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 6px',
                      borderRadius: 4,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                      transition: 'background 120ms',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sub && !disabled}
                      disabled={disabled}
                      onChange={(e) => onMsgChange(m.key, e.target.checked)}
                      style={{
                        width: 13,
                        height: 13,
                        accentColor: accent,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                      }}
                      aria-label={m.label}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        color: sub && !disabled ? 'var(--b2b-ivory, #F5F0E8)' : '#7A7165',
                        textDecoration: !sub && !disabled ? 'line-through' : 'none',
                        lineHeight: 1.4,
                      }}
                    >
                      {m.label}
                    </span>
                  </label>
                )
              })}
              {!checked ? (
                <div
                  style={{
                    fontSize: 9.5,
                    color: '#7A7165',
                    marginTop: 4,
                    fontStyle: 'italic',
                    paddingLeft: 6,
                  }}
                >
                  ative o módulo acima para liberar as mensagens
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
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
      className="b2b-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="b2b-modal">{children}</div>
    </div>
  )
}
