'use client'

/**
 * AppointmentActions · barra de acoes da pagina de detalhe.
 *
 * Renderiza dropdown de status leve + botoes attend/finalize quando
 * aplicavel + soft-delete admin only.
 *
 * Confirma cancel/no-show via prompt simples (Camada 8b promove pra Modal).
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  ConfirmDialog,
  Modal,
  FormField,
  Input,
  Select,
  Textarea,
  useToast,
} from '@clinicai/ui'
import { APPOINTMENT_STATUS_LABELS } from '@clinicai/repositories'
import { Play, Stethoscope, CheckCheck, Trash2, UserX } from 'lucide-react'
import {
  changeAppointmentStatusAction,
  attendAppointmentAction,
  finalizeAppointmentAction,
  cancelAppointmentAction,
  markNoShowAction,
  softDeleteAppointmentAction,
} from '@/app/crm/_actions/appointment.actions'
import { markLeadLostAction } from '@/app/crm/_actions/lead.actions'

interface AppointmentActionsProps {
  appointmentId: string
  currentStatus: string
  hasLead: boolean
  /** CRM_PHASE_2J.1 · leadId pra fluxo Marcar como perdido */
  leadId: string | null
  role: string | null | undefined
  /** Status pra dropdown change · ja filtrado no server (sem na_clinica/em_atendimento/finalizado) */
  lightTransitions: ReadonlyArray<string>
  canAttend: boolean
  /** CRM_PHASE_2H · paciente esta na_clinica, libera iniciar atendimento */
  canStartAttendance: boolean
  canFinalize: boolean
  isTerminal: boolean
  /** CRM_PHASE_2I.1 · hard gate clinico (warning bloqueia · override admin liberado) */
  clinicalGateStatus?: 'ok' | 'warning'
  anamnesisStatus?: 'none' | 'draft' | 'complete' | 'archived'
  consentSigned?: boolean
  /** CRM_PHASE_2J.1 · lead ainda ativo comercialmente · libera Marcar como perdido */
  canMarkLeadLost?: boolean
}

const OVERRIDE_ALLOWED_ROLES = new Set(['owner', 'admin'])

const ALLOWED_DELETE_ROLES = ['owner', 'admin']

export function AppointmentActions({
  appointmentId,
  currentStatus,
  hasLead,
  leadId,
  role,
  lightTransitions,
  canAttend,
  canStartAttendance,
  canFinalize,
  isTerminal,
  clinicalGateStatus = 'warning',
  anamnesisStatus = 'none',
  consentSigned = false,
  canMarkLeadLost = false,
}: AppointmentActionsProps) {
  const router = useRouter()
  const { fromResult, success } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [openCancel, setOpenCancel] = React.useState(false)
  const [openNoShow, setOpenNoShow] = React.useState(false)
  const [openFinalize, setOpenFinalize] = React.useState(false)
  const [openDelete, setOpenDelete] = React.useState(false)
  // CRM_PHASE_2J.1 · Marcar como perdido (lead lost dedicated · fora do FinalizeWizard)
  const [openLeadLost, setOpenLeadLost] = React.useState(false)

  async function handleChangeStatus(newStatus: string) {
    if (newStatus === 'cancelado') {
      setOpenCancel(true)
      return
    }
    if (newStatus === 'no_show') {
      setOpenNoShow(true)
      return
    }
    setBusy(true)
    try {
      const r = await changeAppointmentStatusAction({
        appointmentId,
        newStatus,
      })
      if (!r.ok) {
        fromResult(r)
        return
      }
      success(`Status alterado pra ${APPOINTMENT_STATUS_LABELS[r.data.toStatus as keyof typeof APPOINTMENT_STATUS_LABELS] ?? r.data.toStatus}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleAttend() {
    setBusy(true)
    try {
      const r = await attendAppointmentAction({ appointmentId })
      if (!r.ok) {
        fromResult(r)
        return
      }
      success(
        r.data.idempotentSkip
          ? 'Já estava marcado · sem mudança'
          : 'Chegada registrada · paciente na clínica',
      )
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // CRM_PHASE_2H · iniciar atendimento (na_clinica → em_atendimento).
  // Reusa changeAppointmentStatusAction · zero WhatsApp · zero envio.
  async function handleStartAttendance() {
    setBusy(true)
    try {
      const r = await changeAppointmentStatusAction({
        appointmentId,
        newStatus: 'em_atendimento',
      })
      if (!r.ok) {
        fromResult(r)
        return
      }
      success('Atendimento iniciado · paciente em consulta')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleSoftDelete() {
    const r = await softDeleteAppointmentAction({ appointmentId })
    if (!r.ok) {
      fromResult(r)
      return
    }
    success('Agendamento removido')
    router.push('/crm/agenda')
    router.refresh()
  }

  return (
    <>
      {/* Quick action: attend (paciente chegou) */}
      {canAttend && (
        <Button onClick={handleAttend} disabled={busy} size="sm">
          <Play className="h-4 w-4" />
          Marcar chegada
        </Button>
      )}

      {/* CRM_PHASE_2H · Quick action: iniciar atendimento */}
      {canStartAttendance && (
        <Button
          onClick={handleStartAttendance}
          disabled={busy}
          size="sm"
          variant="default"
        >
          <Stethoscope className="h-4 w-4" />
          Iniciar atendimento
        </Button>
      )}

      {/* Quick action: finalizar (consulta acabou) */}
      {canFinalize && (
        <Button
          onClick={() => setOpenFinalize(true)}
          disabled={busy}
          size="sm"
          variant="default"
        >
          <CheckCheck className="h-4 w-4" />
          Finalizar consulta
        </Button>
      )}

      {/* Dropdown de status leve · cancel/no-show abrem modal */}
      {!isTerminal && lightTransitions.length > 0 && (
        <select
          aria-label="Mudar status"
          disabled={busy}
          value=""
          onChange={(e) => {
            if (e.target.value) handleChangeStatus(e.target.value)
            e.target.value = ''
          }}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs text-[var(--foreground)]"
        >
          <option value="">Mudar status…</option>
          {lightTransitions.map((s) => (
            <option key={s} value={s}>
              → {APPOINTMENT_STATUS_LABELS[s as keyof typeof APPOINTMENT_STATUS_LABELS] ?? s}
            </option>
          ))}
        </select>
      )}

      {/* Cancel + no-show direto (mesmo se nao na lightTransitions, pra UX
          consistente) · abrem modal */}
      {!isTerminal && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenCancel(true)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenNoShow(true)}
            disabled={busy}
          >
            Não compareceu
          </Button>
        </>
      )}

      {/* CRM_PHASE_2J.1 · Marcar como perdido (lead lost dedicado · fora do
          FinalizeWizard · lifecycle comercial, NÃO phase clínica) */}
      {canMarkLeadLost && leadId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpenLeadLost(true)}
          disabled={busy}
        >
          <UserX className="h-4 w-4" />
          Marcar como perdido
        </Button>
      )}

      {/* Soft-delete admin only */}
      {role && ALLOWED_DELETE_ROLES.includes(role) && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setOpenDelete(true)}
          disabled={busy}
        >
          <Trash2 className="h-4 w-4" />
          Remover
        </Button>
      )}

      {/* Modal Cancelar · motivo obrigatorio */}
      <CancelModal
        open={openCancel}
        onOpenChange={setOpenCancel}
        onConfirm={async (motivo) => {
          const r = await cancelAppointmentAction({ appointmentId, motivo })
          if (!r.ok) {
            fromResult(r)
            return
          }
          success('Agendamento cancelado')
          router.refresh()
        }}
      />

      {/* Modal No-show · motivo obrigatorio */}
      <NoShowModal
        open={openNoShow}
        onOpenChange={setOpenNoShow}
        onConfirm={async (motivo) => {
          const r = await markNoShowAction({ appointmentId, motivo })
          if (!r.ok) {
            fromResult(r)
            return
          }
          success('Marcado como não compareceu')
          router.refresh()
        }}
      />

      {/* CRM_PHASE_2J.1 · Modal Marcar como perdido (lead lost) */}
      {leadId && (
        <LeadLostModal
          open={openLeadLost}
          onOpenChange={setOpenLeadLost}
          onConfirm={async (reason) => {
            const r = await markLeadLostAction({ leadId, reason })
            if (!r.ok) {
              fromResult(r)
              return
            }
            success('Lead marcado como perdido · fora da fila ativa (histórico preservado)')
            router.refresh()
          }}
        />
      )}

      {/* Modal Finalizar · 3 outcomes · CRM_PHASE_2I.1 hard gate + override */}
      <FinalizeWizard
        open={openFinalize}
        onOpenChange={setOpenFinalize}
        appointmentId={appointmentId}
        hasLead={hasLead}
        clinicalGateStatus={clinicalGateStatus}
        anamnesisStatus={anamnesisStatus}
        consentSigned={consentSigned}
        canOverrideGate={
          typeof role === 'string' && OVERRIDE_ALLOWED_ROLES.has(role)
        }
        onSuccess={() => {
          router.refresh()
        }}
      />

      {/* ConfirmDialog Soft-delete */}
      <ConfirmDialog
        open={openDelete}
        onOpenChange={setOpenDelete}
        title="Remover agendamento?"
        description="Soft-delete · esconde do calendário mas preserva histórico/audit. Apenas admins."
        confirmLabel="Sim, remover"
        confirmVariant="destructive"
        onConfirm={handleSoftDelete}
      />
    </>
  )
}

// ── Cancel modal · motivo textarea ─────────────────────────────────────────

function CancelModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setMotivo('')
      setError(null)
    }
  }, [open])

  async function handle() {
    if (!motivo.trim() || motivo.trim().length < 2) {
      setError('Motivo obrigatório (mín. 2 caracteres)')
      return
    }
    setBusy(true)
    try {
      await onConfirm(motivo.trim())
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Cancelar agendamento"
      description="Por favor, informe o motivo do cancelamento."
      dismissable={!busy}
    >
      <FormField
        label="Motivo"
        htmlFor="cancel-motivo"
        required
        error={error ?? undefined}
      >
        <Textarea
          id="cancel-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Ex: Paciente solicitou remarcar"
          autoFocus
        />
      </FormField>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          Voltar
        </Button>
        <Button variant="destructive" onClick={handle} disabled={busy}>
          {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
        </Button>
      </div>
    </Modal>
  )
}

function NoShowModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = React.useState('Paciente não compareceu')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) setError(null)
  }, [open])

  async function handle() {
    if (!motivo.trim() || motivo.trim().length < 2) {
      setError('Motivo obrigatório')
      return
    }
    setBusy(true)
    try {
      await onConfirm(motivo.trim())
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Marcar como não compareceu"
      description="O paciente não veio · registre o motivo."
      dismissable={!busy}
    >
      <FormField
        label="Motivo / observação"
        htmlFor="noshow-motivo"
        required
        error={error ?? undefined}
      >
        <Textarea
          id="noshow-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          maxLength={500}
          autoFocus
        />
      </FormField>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          Voltar
        </Button>
        <Button variant="destructive" onClick={handle} disabled={busy}>
          {busy ? 'Salvando…' : 'Marcar no-show'}
        </Button>
      </div>
    </Modal>
  )
}

// ── CRM_PHASE_2J.1 · Lead Lost modal · perda comercial dedicada ─────────────
//
// 'perdido' É lifecycle_status, NÃO phase clínica. Por isso é fluxo separado
// do FinalizeWizard (que só emite paciente/orcamento/paciente_orcamento).
//
// Motivos predefinidos cobrem ~95% dos casos · "Outro" exige observação.
// String final enviada ao RPC `lead_lost(p_lead_id, p_reason)` é composta
// "{reason_label}: {notes}" quando há observação · senão só label.

const LEAD_LOST_REASONS = [
  { value: 'sem_resposta', label: 'Sem resposta' },
  { value: 'preco', label: 'Preço acima do orçamento' },
  { value: 'desistiu', label: 'Desistiu / não quer mais' },
  { value: 'sem_interesse', label: 'Não tinha interesse real' },
  { value: 'reagendara_futuro', label: 'Reagendará no futuro' },
  { value: 'fora_perfil', label: 'Fora do perfil da clínica' },
  { value: 'outro', label: 'Outro motivo (observação obrigatória)' },
] as const

function LeadLostModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reasonCode, setReasonCode] = React.useState<string>('sem_resposta')
  const [notes, setNotes] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setReasonCode('sem_resposta')
      setNotes('')
      setError(null)
    }
  }, [open])

  const requiresNotes = reasonCode === 'outro'

  async function handle() {
    setError(null)
    if (requiresNotes && notes.trim().length < 2) {
      setError('Observação obrigatória quando motivo é "Outro"')
      return
    }
    const label =
      LEAD_LOST_REASONS.find((r) => r.value === reasonCode)?.label ?? reasonCode
    const composed = notes.trim().length > 0 ? `${label}: ${notes.trim()}` : label

    setBusy(true)
    try {
      await onConfirm(composed)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Marcar como perdido"
      description="Tira o lead da fila ativa · histórico preservado · isto NÃO finaliza a consulta clinicamente."
      dismissable={!busy}
    >
      <div className="space-y-3">
        <div
          role="note"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <strong>Atenção:</strong> "perdido" é um status comercial
          (lifecycle), não clínico. Isto move o lead para a aba de Recuperação
          e remove da fila ativa do CRM. Histórico, anamnese e consentimento
          permanecem intactos.
        </div>

        <FormField label="Motivo" htmlFor="lost-reason" required>
          <Select
            id="lost-reason"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          >
            {LEAD_LOST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label={requiresNotes ? 'Observação (obrigatória)' : 'Observação (opcional)'}
          htmlFor="lost-notes"
          required={requiresNotes}
          error={error ?? undefined}
        >
          <Textarea
            id="lost-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={
              requiresNotes
                ? 'Descreva o motivo específico…'
                : 'Detalhes adicionais (opcional)'
            }
          />
        </FormField>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={handle} disabled={busy}>
            {busy ? 'Marcando…' : 'Confirmar perda'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Finalize wizard · outcome paciente|orcamento|perdido ────────────────────

interface FinalizeWizardProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  appointmentId: string
  hasLead: boolean
  /** CRM_PHASE_2I.1 · gate clinico · warning BLOQUEIA submit (exceto override admin) */
  clinicalGateStatus: 'ok' | 'warning'
  anamnesisStatus: 'none' | 'draft' | 'complete' | 'archived'
  consentSigned: boolean
  /** Apenas owner/admin pode usar override do hard gate */
  canOverrideGate: boolean
  onSuccess: () => void
}

/**
 * CRM_PHASE_2J · 3 outcomes oficiais expostos pela UI:
 *  - 'paciente'            · lead vira paciente (lead_to_paciente)
 *  - 'orcamento'           · lead vira orcamento (lead_to_orcamento)
 *  - 'paciente_orcamento'  · paciente E orcamento (sequencial atomico no RPC)
 *
 * 'perdido' NAO nasce da finalizacao · path dedicado via lead_lost
 * (acao separada · futuro botao "Marcar como perdido" no card do lead).
 */
type FinalizeUiOutcome = 'paciente' | 'orcamento' | 'paciente_orcamento'

function FinalizeWizard({
  open,
  onOpenChange,
  appointmentId,
  hasLead,
  clinicalGateStatus,
  anamnesisStatus,
  consentSigned,
  canOverrideGate,
  onSuccess,
}: FinalizeWizardProps) {
  const { fromResult, success, warning } = useToast()
  const [outcome, setOutcome] = React.useState<FinalizeUiOutcome>('paciente')
  const [value, setValue] = React.useState('')
  const [paymentStatus, setPaymentStatus] = React.useState<
    'pendente' | 'parcial' | 'pago' | 'isento'
  >('pago')
  const [notes, setNotes] = React.useState('')
  const [orcSubtotal, setOrcSubtotal] = React.useState('')
  const [orcDiscount, setOrcDiscount] = React.useState('0')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // CRM_PHASE_2I.1 · override admin
  const [overrideRequested, setOverrideRequested] = React.useState(false)
  const [overrideReason, setOverrideReason] = React.useState('')

  const needsOrcamento =
    outcome === 'orcamento' || outcome === 'paciente_orcamento'

  // Hard gate: warning bloqueia submit a menos que override valido seja preenchido
  const gateBlocking = clinicalGateStatus === 'warning'
  const overrideValid =
    overrideRequested && overrideReason.trim().length >= 5
  const submitBlocked = gateBlocking && !overrideValid

  React.useEffect(() => {
    if (!open) {
      setError(null)
      setOverrideRequested(false)
      setOverrideReason('')
    }
  }, [open])

  async function handle() {
    if (needsOrcamento) {
      const sub = parseFloat(orcSubtotal)
      if (isNaN(sub) || sub <= 0) {
        setError('Subtotal do orçamento obrigatório (>0)')
        return
      }
    }

    if (gateBlocking) {
      if (!canOverrideGate) {
        setError('Gate clínico bloqueia · sem permissão para override (só owner/admin)')
        return
      }
      if (!overrideRequested) {
        setError('Marque "Finalizar com override" e preencha o motivo')
        return
      }
      if (overrideReason.trim().length < 5) {
        setError('Motivo do override obrigatório (mínimo 5 caracteres)')
        return
      }
    }

    setBusy(true)
    try {
      const r = await finalizeAppointmentAction({
        appointmentId,
        outcome,
        value: value ? parseFloat(value) : null,
        paymentStatus,
        notes: notes || null,
        lostReason: null,
        orcamentoItems: needsOrcamento
          ? [
              {
                name: notes || 'Procedimento finalizado',
                qty: 1,
                unitPrice: parseFloat(orcSubtotal),
                subtotal: parseFloat(orcSubtotal),
              },
            ]
          : null,
        orcamentoSubtotal: needsOrcamento ? parseFloat(orcSubtotal) : null,
        orcamentoDiscount: needsOrcamento
          ? parseFloat(orcDiscount) || 0
          : 0,
        // CRM_PHASE_2I.1 · override (server revalida is_admin())
        clinicalOverride: gateBlocking && overrideRequested,
        clinicalOverrideReason:
          gateBlocking && overrideRequested ? overrideReason.trim() : null,
      })
      if (!r.ok) {
        fromResult(r)
        return
      }
      if (!r.data.subCallOk) {
        warning(
          `Consulta finalizada · mas conversão "${r.data.outcome}" falhou. Verifique manualmente.`,
        )
      } else {
        const msg =
          r.data.outcome === 'paciente'
            ? 'Lead promovido a paciente!'
            : r.data.outcome === 'orcamento'
              ? 'Orçamento criado!'
              : r.data.outcome === 'paciente_orcamento'
                ? 'Lead virou paciente E orçamento criado!'
                : 'Consulta finalizada'
        success(msg)
      }
      onOpenChange(false)
      onSuccess()
    } finally {
      setBusy(false)
    }
  }

  // CRM_PHASE_2I.1 · hard gate clinico (warning BLOQUEIA · override admin libera)
  const anamnesisLabel =
    anamnesisStatus === 'complete'
      ? 'completa'
      : anamnesisStatus === 'draft'
        ? 'em rascunho'
        : 'não preenchida'

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Finalizar consulta"
      description="Escolha o desfecho · paciente, orçamento ou paciente + orçamento."
      dismissable={!busy}
      className="max-w-xl"
    >
      <div className="space-y-4">
        {gateBlocking && (
          <div
            role="alert"
            className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-900 dark:text-red-200"
          >
            <strong>Finalização bloqueada · gate clínico:</strong>
            <ul className="mt-1 list-disc pl-5">
              {anamnesisStatus !== 'complete' && (
                <li>Anamnese {anamnesisLabel} (precisa estar completa)</li>
              )}
              {!consentSigned && <li>Consentimento informado não registrado</li>}
            </ul>
            <p className="mt-1">
              Preencha pelo painel clínico acima OU use override admin abaixo
              (somente owner/admin).
            </p>
          </div>
        )}

        {gateBlocking && canOverrideGate && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-2">
            <label className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
              <input
                type="checkbox"
                checked={overrideRequested}
                onChange={(e) => setOverrideRequested(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong>Finalizar mesmo assim (override admin):</strong> ciente
                que anamnese e/ou consentimento estão pendentes · justificativa
                obrigatória abaixo (mín. 5 caracteres) · ficará registrada no
                audit trail.
              </span>
            </label>
            {overrideRequested && (
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Motivo do override (ex: paciente recorrente · consentimento já assinado fisicamente · etc)"
                className="w-full"
              />
            )}
          </div>
        )}

        {gateBlocking && !canOverrideGate && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Você não tem permissão para override (somente owner/admin). Preencha
            anamnese + consentimento pelo painel clínico para liberar a finalização.
          </p>
        )}

        <FormField label="Desfecho" htmlFor="fin-outcome" required>
          <Select
            id="fin-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as FinalizeUiOutcome)}
            disabled={!hasLead}
          >
            <option value="paciente">
              Virou paciente · promove lead
            </option>
            <option value="orcamento">
              Gerou orçamento · cria proposta
            </option>
            <option value="paciente_orcamento">
              Paciente + orçamento · vira paciente E gera proposta
            </option>
          </Select>
          {!hasLead && (
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              Sem lead vinculado · finalizar só fecha o appointment.
            </p>
          )}
          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
            Lead perdido? Use a ação dedicada no card do lead · não nasce
            de finalização de consulta.
          </p>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Valor cobrado" htmlFor="fin-value">
            <Input
              id="fin-value"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </FormField>
          <FormField label="Status pagamento" htmlFor="fin-payment">
            <Select
              id="fin-payment"
              value={paymentStatus}
              onChange={(e) =>
                setPaymentStatus(
                  e.target.value as 'pendente' | 'parcial' | 'pago' | 'isento',
                )
              }
            >
              <option value="pago">Pago</option>
              <option value="parcial">Parcial</option>
              <option value="pendente">Pendente</option>
              <option value="isento">Isento (cortesia)</option>
            </Select>
          </FormField>
        </div>

        {needsOrcamento && (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Subtotal orçamento" htmlFor="orc-subtotal" required>
              <Input
                id="orc-subtotal"
                type="number"
                min="0"
                step="0.01"
                value={orcSubtotal}
                onChange={(e) => setOrcSubtotal(e.target.value)}
                placeholder="0,00"
              />
            </FormField>
            <FormField label="Desconto" htmlFor="orc-discount">
              <Input
                id="orc-discount"
                type="number"
                min="0"
                step="0.01"
                value={orcDiscount}
                onChange={(e) => setOrcDiscount(e.target.value)}
                placeholder="0,00"
              />
            </FormField>
          </div>
        )}

        <FormField label="Notas (opcional)" htmlFor="fin-notes">
          <Textarea
            id="fin-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </FormField>

        {error && (
          <p className="text-xs text-[var(--destructive)]" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Voltar
          </Button>
          <Button onClick={handle} disabled={busy || submitBlocked}>
            {busy
              ? 'Finalizando…'
              : gateBlocking && overrideRequested
                ? 'Finalizar com override'
                : 'Finalizar consulta'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
