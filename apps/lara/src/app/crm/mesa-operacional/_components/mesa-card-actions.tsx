'use client'

/**
 * MesaCardActions · BLOCO 3.2D · client component.
 *
 * Botões de mutação inline no card da Mesa Operacional. Cada bucket habilita
 * apenas as ações seguras pra ele:
 *
 *   - lead        · Perder · Arquivar (motivo obrigatório)
 *   - agendado    · Chegou · Cancelar (motivo se permitido) · Perder · Arquivar
 *   - paciente    · (sem mutação · só links via mesa-card)
 *   - orcamento   · (sem mutação · só links via mesa-card)
 *   - paciente_orcamento · (sem mutação · só links via mesa-card)
 *   - perdido     · Recuperar · Arquivar (motivo obrigatório)
 *   - arquivado   · Desarquivar (motivo obrigatório · ÚNICA ação)
 *
 * CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 · Agente C habilitou Arquivar (lead/
 * agendado/perdido) + Desarquivar (arquivado). Bucket arquivado deixou de
 * ser read-only após mig 875 (lead_archive/unarchive RPCs).
 *
 * Usa Modal do @clinicai/ui · useTransition pra loading · useToast pra
 * feedback. Sem provider externo, sem WhatsApp automático.
 */

import { useState, useTransition } from 'react'
import { Modal, Button, useToast } from '@clinicai/ui'
import type { MesaCard } from '@clinicai/repositories'
import {
  archiveLeadFromMesaAction,
  cancelAppointmentFromMesaAction,
  markArrivedFromMesaAction,
  markLeadLostFromMesaAction,
  recoverLeadFromMesaAction,
  unarchiveLeadFromMesaAction,
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
  // CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 · Arquivar disponível em buckets
  // ativos (lead/agendado) E em perdido (decisão humana de retirar perdido
  // da fila de Recuperação por motivo qualitativo). NÃO disponível em
  // paciente/orcamento/paciente_orcamento (esses têm trilho próprio).
  const showArchive =
    card.bucket === 'lead' ||
    card.bucket === 'agendado' ||
    card.bucket === 'perdido'
  // Desarquivar é EXCLUSIVO do bucket arquivado · única ação possível lá.
  const showUnarchive = card.bucket === 'arquivado'

  if (
    !showLost &&
    !showRecover &&
    !showAttend &&
    !showCancel &&
    !showArchive &&
    !showUnarchive
  ) {
    return null
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-dashed border-[var(--border)] pt-1.5">
      {showAttend ? <AttendButton card={card} /> : null}
      {showCancel ? <CancelButton card={card} /> : null}
      {showRecover ? <RecoverButton card={card} /> : null}
      {showLost ? <LostButton card={card} /> : null}
      {showArchive ? <ArchiveButton card={card} /> : null}
      {showUnarchive ? <UnarchiveButton card={card} /> : null}
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

// ─── Arquivar lead · CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 · modal motivo ──
// Disponível em lead / agendado / perdido. lifecycle_status='arquivado' ·
// phase preservado. Idempotente (toast distinto se já estava arquivado).

function ArchiveButton({ card }: Props) {
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
      const r = await archiveLeadFromMesaAction({
        leadId: card.leadId,
        reason: value,
      })
      toast.fromResult(r, {
        successMsg: r.ok && r.data.idempotentSkip
          ? 'Lead já estava arquivado (sem mudança)'
          : 'Lead arquivado',
        errorMessages: {
          invalid_input: 'Motivo inválido (mín 3 caracteres)',
          reason_too_short: 'Motivo precisa ter no mínimo 3 caracteres',
          lead_not_found: 'Lead não encontrado ou já excluído',
          no_clinic_in_jwt: 'Sessão sem clínica · faça login novamente',
          forbidden: 'Sem permissão para arquivar',
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
        Arquivar
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o)
        }}
        title={`Arquivar lead · ${card.name ?? '(sem nome)'}`}
        description="O lead vai pra lifecycle 'arquivado' preservando a phase atual. NÃO é exclusão · fica visível no bucket Arquivados e pode ser desarquivado a qualquer momento."
        dismissable={!pending}
      >
        <ReasonForm
          value={reason}
          onChange={setReason}
          placeholder="Ex: lead duplicado, mudou de cidade, faleceu, opt-out manual..."
        />
        <ModalFooter
          pending={pending}
          onCancel={() => setOpen(false)}
          onConfirm={submit}
          confirmLabel="Arquivar"
          confirmVariant="default"
        />
      </Modal>
    </>
  )
}

// ─── Desarquivar lead · CRM_FUNCTIONALITY_MULTI_AGENT Lote 2 · modal motivo
// Disponível APENAS no bucket arquivado. lifecycle_status='ativo' · phase
// preservado. Lead volta automaticamente ao bucket correspondente à phase
// (via crm_operational_view CASE).

function UnarchiveButton({ card }: Props) {
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
      const r = await unarchiveLeadFromMesaAction({
        leadId: card.leadId,
        reason: value,
      })
      toast.fromResult(r, {
        successMsg: 'Lead desarquivado e voltou pra mesa correta',
        errorMessages: {
          invalid_input: 'Motivo inválido (mín 3 caracteres)',
          reason_too_short: 'Motivo precisa ter no mínimo 3 caracteres',
          not_archived: 'Lead não está arquivado · recarregue a página',
          lead_not_found: 'Lead não encontrado ou já excluído',
          no_clinic_in_jwt: 'Sessão sem clínica · faça login novamente',
          forbidden: 'Sem permissão para desarquivar',
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
        Desarquivar
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o)
        }}
        title={`Desarquivar lead · ${card.name ?? '(sem nome)'}`}
        description="Lead volta pra lifecycle 'ativo' preservando a phase. Vai aparecer automaticamente no bucket correspondente à phase atual (lead/agendado/paciente/orcamento)."
        dismissable={!pending}
      >
        <ReasonForm
          value={reason}
          onChange={setReason}
          placeholder="Ex: voltou a ter interesse, contato retomado, erro no arquivamento..."
        />
        <ModalFooter
          pending={pending}
          onCancel={() => setOpen(false)}
          onConfirm={submit}
          confirmLabel="Desarquivar"
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
