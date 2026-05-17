'use client'

/**
 * BlockTimeButton · CRM_FUNCTIONALITY_MULTI_AGENT Lote 3 · Agente B (P1.2).
 *
 * Botão na toolbar da agenda que abre o BlockTimeModal. Wrapper fino · apenas
 * controla open state + delega pro modal. Renderizado em /crm/agenda/page.tsx.
 *
 * Pra criar block-time real, ver block-time-modal.tsx.
 */

import * as React from 'react'
import { BlockTimeModal, type BlockTimeProfessional } from './block-time-modal'

interface BlockTimeButtonProps {
  /** Lista de profissionais ativos (vinda do server component pai). */
  professionals: BlockTimeProfessional[]
  /** Data default (YYYY-MM-DD) · usa anchor da agenda. */
  defaultDate: string
}

export function BlockTimeButton({
  professionals,
  defaultDate,
}: BlockTimeButtonProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Reservar horário (almoço, intervalo, manutenção, etc)"
        className="btn-outline"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Bloquear horário
      </button>

      <BlockTimeModal
        open={open}
        onOpenChange={setOpen}
        professionals={professionals}
        defaultDate={defaultDate}
      />
    </>
  )
}
