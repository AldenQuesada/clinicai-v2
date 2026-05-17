'use client'

/**
 * MesaCardActions · BLOCO 3.2D · client component.
 *
 * Botões de mutação inline no card da Mesa Operacional. Cada bucket habilita
 * apenas as ações seguras pra ele:
 *
 *   - lead        · Perder (motivo obrigatório)
 *   - agendado    · Chegou + Cancelar (motivo obrigatório se permitido) + Perder
 *   - paciente    · (sem mutação · só links via mesa-card)
 *   - orcamento   · (sem mutação · só links via mesa-card)
 *   - paciente_orcamento · (sem mutação · só links via mesa-card)
 *   - perdido     · Recuperar (motivo obrigatório)
 *   - arquivado   · read-only (lead_archive/unarchive não existem)
 *
 * Usa Modal do @clinicai/ui · useTransition pra loading · useToast pra
 * feedback. Sem provider externo, sem WhatsApp automático.
 */

import { useState, useTransition } from 'react'
import { Modal, Button, useToast } from '@clinicai/ui'
import type { MesaCard } from '@clinicai/repositories'
import {
  markLeadLostFromMesaAction,
  recoverLeadFromMesaAction,
  markArrivedFromMesaAction,
  cancelAppointmentFromMesaAction,
} from '../_actions'

interface Props {
  card: MesaCard
}

// Status de appointment em que "Chegou" faz sentido (state machine canon)
const ATTEND_ALLOWED_STATUSES = new Set([
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
])

// Status em que "Cancelar" é bloqueado (terminal)
const CANCEL_BLOCKED_STATUSES = new Set([
  'finalizado',
  'cancelado',
  'no_show',
  'bloqueado',
])

export function MesaCardActions({ card }: Props) {
  const showLost = card.bucket === 'lead' || card.bucket === 'agendado'
  const showRecover = card.bucket === 'perdido'
  const showAttend =
    card.bucket === 'agendado' &&
    !!card.appointmentId &&
    !!card.appointmentStatus &&
    ATTEND_ALLOWED_STATUSES.has(card.appointmentStatus)
  const showCancel =
    card.bucket === 'agendado' &&
    !!card.appointmentId &&
    !!card.appointmentStatus &&
    !CANCEL_BLOCKED_STATUSES.has(card.appointmentStatus)

  // Bucket arquivado é read-only · não renderiza nada
  if (!showLost && !showRecover && !showAttend && !showCancel) return null

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-dashed border-[var(--border)] pt-1.5">
      {showAttend ? <AttendButton card={card} /> : null}
      {showCancel ? <CancelButton card={card} /> : null}
      {showRecover ? <RecoverButton card={card} /> : null}
      {showLost ? <LostButton card={card} /> : null}
    </div>
  )
}

// ─── Marcar chegada · sem motivo · 1 clique + confirm ──────────────────────

function AttendButton({ card }: Props) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const handle = () => {
    if (!card.appointmentId) return
    if (!confirm(`Confirmar chegada de ${card.name ?? 'paciente'}?`)) return
    startTransition(async () => {
      const r = await markArrivedFromMesaAction({
        appointmentId: card.appointmentId,
      })
      toast.fromResult(r, {
        successMsg: r.ok && r.data.idempotentSkip
          ? 'Chegada já registrada (sem mudança)'
          : 'Chegada registrada',
        errorMessages: {
          invalid_input: 'Dados inválidos para registrar chegada',
          forbidden: 'Sem permissão pra registrar chegada',
        },
      })
    })
  }

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      disabled={pending}
      onClick={handle}
      className="h-6 px-2 text-[10px]"
    >
      {pending ? 'Registrando…' : 'Chegou'}
    </Button>
  )
}

// ─── Cancelar appointment · modal motivo ──────────────────────────────────

function CancelButton({ card }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const submit = () => {
    const motivo = reason.trim()
    if (motivo.length < 3) {
      toast.warning('Motivo precisa ter no mínimo 3 caracteres')
      return
    }
    if (!card.appointmentId) return
    startTransition(async () => {
      const r = await cancelAppointmentFromMesaAction({
        appointmentId: card.appointmentId,
        motivo,
      })
      toast.fromResult(r, {
        successMsg: 'Agendamento cancelado',
        errorMessages: {
          invalid_input: 'Motivo inválido',
          cancel_failed: 'Não foi possível cancelar (verifique status)',
        },
      })
      if (r.ok) {
        setOpen(false)
        setReason('')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-6 px-2 text-[10px]"
      >
        Cancelar
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o)
        }}
        title={`Cancelar agendamento · ${card.name ?? '(sem nome)'}`}
        description="Motivo do cancelamento será registrado no histórico. Esta ação altera o status para 'cancelado' e desbloqueia o slot da agenda."
        dismissable={!pending}
      >
        <ReasonForm
          value={reason}
          onChange={setReason}
          placeholder="Ex: paciente remarcou, conflito de horário..."
        />
        <ModalFooter
          pending={pending}
          onCancel={() => setOpen(false)}
          onConfirm={submit}
          confirmLabel="Cancelar agendamento"
          confirmVariant="destructive"
        />
      </Modal>
    </>
  )
}

// ─── Marcar lead perdido · modal motivo ───────────────────────────────────

function LostButton({ card }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const submit = () => {
    const value = reason.trim()
    if (value.length < 3) {
      toast.warning('Motivo precisa ter no mínimo 3 caracteres')
      return
    }
    startTransition(async () => {
      const r = await markLeadLostFromMesaAction({
        leadId: card.leadId,
        reason: value,
      })
      toast.fromResult(r, {
        successMsg: 'Lead marcado como perdido',
        errorMessages: {
          invalid_input: 'Motivo inválido (mín 3 caracteres)',
          forbidden: 'Sem permissão para esta ação',
        },
      })
      if (r.ok) {
        setOpen(false)
        setReason('')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-6 px-2 text-[10px]"
      >
        Perder
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o)
        }}
        title={`Marcar perdido · ${card.name ?? '(sem nome)'}`}
        description="O lead vai pra lifecycle 'perdido' preservando a phase atual em lost_from_phase. Operação é reversível via Recuperação."
        dismissable={!pending}
      >
        <ReasonForm
          value={reason}
          onChange={setReason}
          placeholder="Ex: sem interesse, optou por concorrente, preço, sem retorno..."
        />
        <ModalFooter
          pending={pending}
          onCancel={() => setOpen(false)}
          onConfirm={submit}
          confirmLabel="Marcar perdido"
          confirmVariant="destructive"
        />
      </Modal>
    </>
  )
}

// ─── Recuperar lead perdido · modal motivo ────────────────────────────────

function RecoverButton({ card }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const submit = () => {
    const value = reason.trim()
    if (value.length < 3) {
      toast.warning('Motivo precisa ter no mínimo 3 caracteres')
      return
    }
    startTransition(async () => {
      const r = await recoverLeadFromMesaAction({
        leadId: card.leadId,
        reason: value,
        // toPhase default 'lead' · UI futura pode oferecer 'agendado'/'orcamento'
      })
      toast.fromResult(r, {
        successMsg: 'Lead recuperado e voltou pra fila',
        errorMessages: {
          invalid_input: 'Motivo inválido (mín 3 caracteres)',
          forbidden: 'Apenas owner/admin/recepcionista podem recuperar',
        },
      })
      if (r.ok) {
        setOpen(false)
        setReason('')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-6 px-2 text-[10px]"
      >
        Recuperar
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o)
        }}
        title={`Recuperar lead · ${card.name ?? '(sem nome)'}`}
        description="Lead volta pra phase 'lead' com lifecycle 'ativo'. lost_from_phase é preservado no histórico."
        dismissable={!pending}
      >
        <ReasonForm
          value={reason}
          onChange={setReason}
          placeholder="Ex: respondeu, mudou de ideia, indicação..."
        />
        <ModalFooter
          pending={pending}
          onCancel={() => setOpen(false)}
          onConfirm={submit}
          confirmLabel="Recuperar"
          confirmVariant="default"
        />
      </Modal>
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function ReasonForm({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="mt-3 flex flex-col gap-1">
      <label
        htmlFor="mesa-reason"
        className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]"
      >
        Motivo (obrigatório · mín 3 caracteres)
      </label>
      <textarea
        id="mesa-reason"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={500}
        className="min-h-[72px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      />
      <p className="text-[10px] text-[var(--muted-foreground)]">
        {value.trim().length}/500
      </p>
    </div>
  )
}

function ModalFooter({
  pending,
  onCancel,
  onConfirm,
  confirmLabel,
  confirmVariant,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  confirmVariant: 'default' | 'destructive'
}) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={onCancel}
      >
        Voltar
      </Button>
      <Button
        type="button"
        variant={confirmVariant}
        size="sm"
        disabled={pending}
        onClick={onConfirm}
      >
        {pending ? 'Enviando…' : confirmLabel}
      </Button>
    </div>
  )
}
