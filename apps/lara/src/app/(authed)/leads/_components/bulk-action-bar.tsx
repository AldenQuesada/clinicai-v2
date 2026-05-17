'use client'

/**
 * BLOCO 3.4B · Banner sticky de bulk actions em /leads.
 *
 * Aparece quando `selectedCount > 0`. Botões:
 *   - Mudar fase em lote (RPC atômica)
 *   - Marcar perdido em lote (loop · partial result)
 *   - Exportar selecionados (server action · CSV BOM UTF-8)
 *   - Limpar seleção
 *
 * Visual `b2b-*` themed pra consistência com LeadsClient. Cada botão tem
 * loading próprio (useTransition). Modais controlados localmente.
 *
 * `bulkAddLeadTagsAction` deliberadamente FORA · vide bulk-modals.tsx +
 * `apps/lara/docs/OUT_P0_TAGS.md` (tags livres pausadas em prod).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Download, UserX, X } from 'lucide-react'
import type { LeadPhase } from '@clinicai/repositories'
import {
  bulkChangeLeadPhaseAction,
  bulkMarkLeadsLostAction,
  exportLeadsCsvAction,
} from '../actions'
import { BulkChangePhaseModal, BulkLostModal } from './bulk-modals'

const PHASE_LABEL: Record<LeadPhase, string> = {
  lead: 'Lead',
  agendado: 'Agendado',
  paciente: 'Paciente',
  orcamento: 'Orçamento',
}

type ModalKind = 'phase' | 'lost' | null

interface Props {
  selectedIds: string[]
  onClearSelection: () => void
  /** Toast no LeadsClient · injetado pra coerência com toast já existente. */
  onToast: (msg: string, tone?: 'ok' | 'err') => void
  /** Re-render lista após sucesso (clear seleção + router.refresh). */
  onAfterSuccess?: () => void
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke num tick depois pra dar tempo do browser começar o download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BulkActionBar({
  selectedIds,
  onClearSelection,
  onToast,
  onAfterSuccess,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [modal, setModal] = useState<ModalKind>(null)
  const [pendingPhase, setPendingPhase] = useState(false)
  const [pendingLost, setPendingLost] = useState(false)
  const [pendingExport, setPendingExport] = useState(false)

  const count = selectedIds.length
  const busy = pendingPhase || pendingLost || pendingExport

  async function handleChangePhase(toPhase: LeadPhase, reason: string) {
    setPendingPhase(true)
    try {
      const r = await bulkChangeLeadPhaseAction({
        ids: selectedIds,
        toPhase,
        reason: reason || undefined,
      })
      if (!r.ok) {
        onToast(r.error || 'Falha ao mudar fase em lote', 'err')
        return
      }
      const d = r.data ?? { updated: 0, total: count }
      if (d.updated === d.total) {
        onToast(`${d.updated} leads movidos para ${PHASE_LABEL[toPhase]}`)
      } else {
        onToast(
          `${d.updated}/${d.total} movidos · ${d.total - d.updated} pulados (transição inválida)`,
          'err',
        )
      }
      setModal(null)
      onClearSelection()
      onAfterSuccess?.()
      startTransition(() => router.refresh())
    } finally {
      setPendingPhase(false)
    }
  }

  async function handleMarkLost(reason: string) {
    setPendingLost(true)
    try {
      const r = await bulkMarkLeadsLostAction({
        ids: selectedIds,
        reason,
      })
      if (!r.ok) {
        onToast(r.error || 'Falha ao marcar perdido', 'err')
        return
      }
      const d = r.data ?? { updated: 0, failed: 0, total: count, failedIds: [] }
      if (d.failed === 0) {
        onToast(`${d.updated} leads marcados como perdido`)
      } else if (d.updated > 0) {
        onToast(
          `${d.updated}/${d.total} marcados · ${d.failed} falharam (ver console)`,
          'err',
        )
        console.warn('[bulkMarkLost] failed IDs:', d.failedIds)
      } else {
        onToast(`Nenhum lead marcado · ${d.failed} falharam (ver console)`, 'err')
        console.warn('[bulkMarkLost] all failed:', d.failedIds)
      }
      setModal(null)
      if (d.updated > 0) {
        onClearSelection()
        onAfterSuccess?.()
        startTransition(() => router.refresh())
      }
    } finally {
      setPendingLost(false)
    }
  }

  async function handleExportSelected() {
    setPendingExport(true)
    try {
      const r = await exportLeadsCsvAction({ ids: selectedIds })
      if (!r.ok) {
        if (r.error === 'empty_export') {
          onToast('Nenhum lead correspondente aos IDs selecionados', 'err')
        } else {
          onToast(r.error || 'Falha ao exportar CSV', 'err')
        }
        return
      }
      const data = r.data
      if (!data) {
        onToast('Resposta vazia do export', 'err')
        return
      }
      downloadCsv(data.csv, data.filename)
      onToast(`${data.count} leads exportados`)
    } finally {
      setPendingExport(false)
    }
  }

  return (
    <>
      <div
        role="region"
        aria-label="Ações em lote"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          marginBottom: 12,
          padding: '10px 16px',
          background:
            'linear-gradient(135deg, rgba(201,169,110,0.18), rgba(201,169,110,0.08))',
          border: '1px solid rgba(201,169,110,0.40)',
          borderRadius: 8,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'var(--b2b-champagne)',
          }}
        >
          {count} {count === 1 ? 'selecionado' : 'selecionados'}
        </span>

        <button
          type="button"
          onClick={onClearSelection}
          disabled={busy}
          className="b2b-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--b2b-text-dim)',
          }}
        >
          <X size={11} />
          Limpar
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => setModal('phase')}
          disabled={busy}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowRight size={12} />
          {pendingPhase ? 'Movendo...' : 'Mudar fase'}
        </button>

        <button
          type="button"
          onClick={() => setModal('lost')}
          disabled={busy}
          className="b2b-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--b2b-red)',
            borderColor: 'rgba(217,122,122,0.40)',
          }}
        >
          <UserX size={12} />
          {pendingLost ? 'Marcando...' : 'Marcar perdido'}
        </button>

        <button
          type="button"
          onClick={handleExportSelected}
          disabled={busy}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Download size={12} />
          {pendingExport ? 'Exportando...' : 'Exportar selecionados'}
        </button>
      </div>

      {modal === 'phase' && (
        <BulkChangePhaseModal
          selectedCount={count}
          busy={pendingPhase}
          onCancel={() => setModal(null)}
          onConfirm={handleChangePhase}
        />
      )}

      {modal === 'lost' && (
        <BulkLostModal
          selectedCount={count}
          busy={pendingLost}
          onCancel={() => setModal(null)}
          onConfirm={handleMarkLost}
        />
      )}
    </>
  )
}
