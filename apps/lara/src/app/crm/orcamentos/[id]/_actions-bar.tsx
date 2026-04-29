'use client'

/**
 * ActionsBar do detalhe /crm/orcamentos/[id] · botoes de transicao de status
 * + share + soft-delete (admin/owner).
 *
 * State machine UI:
 *   draft       → Marcar enviado | Editar | Compartilhar | Excluir
 *   sent        → Marcar visualizado* | Marcar aprovado | Marcar perdido | Compartilhar
 *   viewed      → Marcar aprovado | Marcar perdido | Compartilhar
 *   followup    → Marcar aprovado | Marcar perdido | Compartilhar
 *   negotiation → Marcar aprovado | Marcar perdido | Compartilhar
 *   approved    → (terminal) Compartilhar | Excluir
 *   lost        → (terminal) Excluir
 *
 * *Marcar visualizado eh automatico no acesso ao link publico · botao manual
 *  removido v1 (ainda fica viewed quando paciente abre).
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  ConfirmDialog,
  Modal,
  FormField,
  Textarea,
  useToast,
} from '@clinicai/ui'
import {
  Send,
  Check,
  X as XIcon,
  Share2,
  Trash2,
  Edit3,
} from 'lucide-react'
import type { OrcamentoDTO } from '@clinicai/repositories'
import {
  markOrcamentoSentAction,
  markOrcamentoApprovedAction,
  markOrcamentoLostAction,
  softDeleteOrcamentoAction,
} from '../../_actions/orcamento.actions'
import { ShareOrcamentoModal } from './_share-modal'

interface ActionsBarProps {
  orcamento: OrcamentoDTO
  /** Telefone E.164 (sem +) do paciente/lead vinculado · null = sem WhatsApp */
  phoneE164: string | null
  /** Nome (1o nome usado na msg WA) · null = "Olá!" */
  recipientName: string | null
  /** Role do usuario · gate pra excluir (owner|admin only) */
  userRole: string | null | undefined
}

export function OrcamentoActionsBar({
  orcamento,
  phoneE164,
  recipientName,
  userRole,
}: ActionsBarProps) {
  const router = useRouter()
  const toast = useToast()

  const [shareOpen, setShareOpen] = React.useState(false)
  const [approveOpen, setApproveOpen] = React.useState(false)
  const [lostOpen, setLostOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<null | 'send' | 'approve' | 'lost' | 'delete'>(
    null,
  )
  const [lostReason, setLostReason] = React.useState('')

  const isTerminal = orcamento.status === 'approved' || orcamento.status === 'lost'
  const canEdit = !isTerminal
  const canMarkSent = orcamento.status === 'draft'
  const canMarkApproved = !isTerminal && orcamento.status !== 'draft'
  const canMarkLost = !isTerminal
  const canDelete = userRole === 'owner' || userRole === 'admin'

  async function handleMarkSent() {
    setBusy('send')
    try {
      const r = await markOrcamentoSentAction({ orcamentoId: orcamento.id })
      if (r.ok) {
        toast.success('Marcado como enviado')
        router.refresh()
      } else {
        toast.error('Falha ao marcar como enviado')
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleApprove() {
    setBusy('approve')
    try {
      const r = await markOrcamentoApprovedAction({ orcamentoId: orcamento.id })
      if (r.ok) {
        toast.success('Orçamento aprovado!')
        setApproveOpen(false)
        router.refresh()
      } else {
        toast.error('Falha ao aprovar')
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleLost() {
    if (lostReason.trim().length < 2) {
      toast.error('Motivo obrigatório (mínimo 2 caracteres)')
      return
    }
    setBusy('lost')
    try {
      const r = await markOrcamentoLostAction({
        orcamentoId: orcamento.id,
        reason: lostReason.trim(),
      })
      if (r.ok) {
        toast.success('Orçamento marcado como perdido')
        setLostOpen(false)
        setLostReason('')
        router.refresh()
      } else {
        toast.error('Falha ao marcar como perdido')
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    setBusy('delete')
    try {
      const r = await softDeleteOrcamentoAction({ orcamentoId: orcamento.id })
      if (r.ok) {
        toast.success('Orçamento excluído')
        router.push('/crm/orcamentos')
      } else if (r.error === 'forbidden') {
        toast.error('Você não tem permissão pra excluir')
      } else {
        toast.error('Falha ao excluir')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/crm/orcamentos/${orcamento.id}/editar`)}
          >
            <Edit3 className="h-4 w-4" />
            Editar
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShareOpen(true)}
        >
          <Share2 className="h-4 w-4" />
          Compartilhar
        </Button>

        {canMarkSent && (
          <Button
            size="sm"
            onClick={handleMarkSent}
            disabled={busy !== null}
          >
            <Send className="h-4 w-4" />
            {busy === 'send' ? 'Enviando…' : 'Marcar enviado'}
          </Button>
        )}

        {canMarkApproved && (
          <Button
            size="sm"
            onClick={() => setApproveOpen(true)}
            disabled={busy !== null}
          >
            <Check className="h-4 w-4" />
            Aprovar
          </Button>
        )}

        {canMarkLost && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLostOpen(true)}
            disabled={busy !== null}
          >
            <XIcon className="h-4 w-4" />
            Perdido
          </Button>
        )}

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={busy !== null}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        )}
      </div>

      <ShareOrcamentoModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        orcamentoId={orcamento.id}
        phoneE164={phoneE164}
        recipientName={recipientName}
        orcamentoTitle={orcamento.title}
      />

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Aprovar orçamento?"
        description="Marca como aprovado e registra a data. Não promove o lead a paciente automaticamente — você ainda decide isso depois."
        confirmLabel="Aprovar"
        confirmVariant="default"
        onConfirm={handleApprove}
      />

      <Modal
        open={lostOpen}
        onOpenChange={(o) => !busy && setLostOpen(o)}
        title="Marcar como perdido"
        description="Registra o motivo (obrigatório pra audit + aprendizado de objeções)."
        dismissable={!busy}
        className="max-w-md"
      >
        <FormField
          label="Motivo da perda"
          htmlFor="lost-reason"
          hint="Ex: preço, sem decisão, escolheu concorrente, etc."
        >
          <Textarea
            id="lost-reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            rows={3}
            placeholder="Motivo…"
            disabled={busy !== null}
          />
        </FormField>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setLostOpen(false)}
            disabled={busy !== null}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleLost}
            disabled={busy !== null || lostReason.trim().length < 2}
          >
            {busy === 'lost' ? 'Salvando…' : 'Marcar perdido'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Excluir orçamento?"
        description="Soft-delete · audit preservado. Visível só pra admins via DB. Tem certeza?"
        confirmLabel="Excluir"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </>
  )
}
