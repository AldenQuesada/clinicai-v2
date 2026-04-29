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
import { Check, Play, CheckCheck, Trash2 } from 'lucide-react'
import {
  changeAppointmentStatusAction,
  attendAppointmentAction,
  finalizeAppointmentAction,
  cancelAppointmentAction,
  markNoShowAction,
  softDeleteAppointmentAction,
} from '@/app/crm/_actions/appointment.actions'

interface AppointmentActionsProps {
  appointmentId: string
  currentStatus: string
  hasLead: boolean
  role: string | null | undefined
  /** Status pra dropdown change · ja filtrado no server (sem na_clinica/finalizado) */
  lightTransitions: ReadonlyArray<string>
  canAttend: boolean
  canFinalize: boolean
  isTerminal: boolean
}

const ALLOWED_DELETE_ROLES = ['owner', 'admin']

export function AppointmentActions({
  appointmentId,
  currentStatus,
  hasLead,
  role,
  lightTransitions,
  canAttend,
  canFinalize,
  isTerminal,
}: AppointmentActionsProps) {
  const router = useRouter()
  const { fromResult, success } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [openCancel, setOpenCancel] = React.useState(false)
  const [openNoShow, setOpenNoShow] = React.useState(false)
  const [openFinalize, setOpenFinalize] = React.useState(false)
  const [openDelete, setOpenDelete] = React.useState(false)

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

      {/* Modal Finalizar · 3 outcomes */}
      <FinalizeWizard
        open={openFinalize}
        onOpenChange={setOpenFinalize}
        appointmentId={appointmentId}
        hasLead={hasLead}
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

// ── Finalize wizard · outcome paciente|orcamento|perdido ────────────────────

interface FinalizeWizardProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  appointmentId: string
  hasLead: boolean
  onSuccess: () => void
}

function FinalizeWizard({
  open,
  onOpenChange,
  appointmentId,
  hasLead,
  onSuccess,
}: FinalizeWizardProps) {
  const { fromResult, success, warning } = useToast()
  const [outcome, setOutcome] = React.useState<
    'paciente' | 'orcamento' | 'perdido'
  >('paciente')
  const [value, setValue] = React.useState('')
  const [paymentStatus, setPaymentStatus] = React.useState<
    'pendente' | 'parcial' | 'pago' | 'isento'
  >('pago')
  const [notes, setNotes] = React.useState('')
  const [lostReason, setLostReason] = React.useState('')
  const [orcSubtotal, setOrcSubtotal] = React.useState('')
  const [orcDiscount, setOrcDiscount] = React.useState('0')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setError(null)
    }
  }, [open])

  async function handle() {
    if (outcome === 'perdido' && (!lostReason.trim() || lostReason.trim().length < 2)) {
      setError('Motivo obrigatório quando outcome=perdido')
      return
    }
    if (outcome === 'orcamento') {
      const sub = parseFloat(orcSubtotal)
      if (isNaN(sub) || sub <= 0) {
        setError('Subtotal do orçamento obrigatório (>0)')
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
        lostReason: outcome === 'perdido' ? lostReason : null,
        orcamentoItems:
          outcome === 'orcamento'
            ? [
                {
                  name: notes || 'Procedimento finalizado',
                  qty: 1,
                  unitPrice: parseFloat(orcSubtotal),
                  subtotal: parseFloat(orcSubtotal),
                },
              ]
            : null,
        orcamentoSubtotal:
          outcome === 'orcamento' ? parseFloat(orcSubtotal) : null,
        orcamentoDiscount:
          outcome === 'orcamento' ? parseFloat(orcDiscount) || 0 : 0,
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
        success(
          r.data.outcome === 'paciente'
            ? 'Lead promovido a paciente!'
            : r.data.outcome === 'orcamento'
              ? 'Orçamento criado!'
              : 'Lead marcado como perdido',
        )
      }
      onOpenChange(false)
      onSuccess()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Finalizar consulta"
      description="Escolha o outcome · vai gerar paciente, orçamento ou marcar perdido."
      dismissable={!busy}
      className="max-w-xl"
    >
      <div className="space-y-4">
        <FormField label="Outcome" htmlFor="fin-outcome" required>
          <Select
            id="fin-outcome"
            value={outcome}
            onChange={(e) =>
              setOutcome(
                e.target.value as 'paciente' | 'orcamento' | 'perdido',
              )
            }
            disabled={!hasLead}
          >
            <option value="paciente">Virou paciente · promove lead</option>
            <option value="orcamento">Gerou orçamento · cria proposta</option>
            <option value="perdido">Lead perdido · marca lost</option>
          </Select>
          {!hasLead && (
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              Sem lead vinculado · finalizar só fecha o appointment.
            </p>
          )}
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

        {outcome === 'orcamento' && (
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

        {outcome === 'perdido' && (
          <FormField
            label="Motivo da perda"
            htmlFor="lost-reason"
            required
            error={error ?? undefined}
          >
            <Textarea
              id="lost-reason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </FormField>
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

        {error && outcome !== 'perdido' && (
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
          <Button onClick={handle} disabled={busy}>
            {busy ? 'Finalizando…' : 'Finalizar consulta'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
