'use client'

/**
 * ApplyPlaybookButton · client wrapper pra disparar applyPlaybookAction.
 *
 * Decide qual `kind` aplicar pelo status atual da parceria:
 *   - active → retention   (resgatar/manter)
 *   - review → retention   (saude piorando ou em duvida)
 *   - prospect / dna_check / contract → prospect_to_active (onboarding)
 *   - paused / closed → renewal (reativacao via novo ciclo)
 *
 * Mostra resultado inline (X tasks / Y contents / Z metas) por 4s.
 */

import { useState, useTransition } from 'react'
import { Lightbulb, Loader2 } from 'lucide-react'
import type { B2BPartnershipDTO, PlaybookKind } from '@clinicai/repositories'
import { applyPlaybookAction } from './actions'

function pickKind(status: B2BPartnershipDTO['status']): PlaybookKind {
  switch (status) {
    case 'active':
    case 'review':
      return 'retention'
    case 'paused':
    case 'closed':
      return 'renewal'
    default:
      return 'prospect_to_active'
  }
}

const KIND_LABEL: Record<PlaybookKind, string> = {
  prospect_to_active: 'onboarding',
  retention: 'retencao',
  renewal: 'renovacao',
}

export function ApplyPlaybookButton({
  partnership,
  onResult,
}: {
  partnership: B2BPartnershipDTO
  onResult?: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [localMsg, setLocalMsg] = useState<string | null>(null)
  const kind = pickKind(partnership.status)

  function handleClick() {
    setLocalMsg(null)
    startTransition(async () => {
      const r = await applyPlaybookAction(partnership.id, kind)
      let msg: string
      if (r.ok) {
        const t = r.applied_tasks ?? 0
        const c = r.applied_contents ?? 0
        const m = r.applied_metas ?? 0
        if (t === 0 && c === 0 && m === 0) {
          msg = `Playbook ${KIND_LABEL[kind]} ja estava aplicado · nada novo (idempotente).`
        } else {
          msg = `Playbook ${KIND_LABEL[kind]} aplicado · ${t} tasks, ${c} contents, ${m} metas.`
        }
      } else {
        msg = `Falha ao aplicar playbook · ${r.error || 'erro desconhecido'}`
      }
      setLocalMsg(msg)
      onResult?.(msg)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          'b2b-action-card' + (pending ? ' b2b-action-card-pending' : '')
        }
        title={`Aplica template "${KIND_LABEL[kind]}" da clinica`}
      >
        {pending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Lightbulb className="w-5 h-5" />
        )}
        <div className="flex flex-col gap-0.5 text-left">
          <div className="text-[12px] font-bold text-[#F5F0E8]">
            {pending ? 'Aplicando...' : 'Aplicar Playbook'}
            <span className="ml-1.5 text-[8px] uppercase tracking-[1px] px-1 py-px rounded bg-[#C9A96E]/15 text-[#C9A96E]">
              {KIND_LABEL[kind]}
            </span>
          </div>
          <div className="text-[10.5px] text-[#9CA3AF]">
            Cria tasks iniciais + content padrao + metas operacionais. Idempotente.
          </div>
        </div>
      </button>
      {localMsg ? (
        <div className="sm:col-span-2 text-[11px] text-[#C9A96E] bg-[#C9A96E]/10 border border-[#C9A96E]/20 rounded px-3 py-2">
          {localMsg}
        </div>
      ) : null}

      <style jsx>{`
        .b2b-action-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #f5f0e8;
          text-align: left;
          cursor: pointer;
          transition: all 200ms ease;
          width: 100%;
        }
        .b2b-action-card:hover:not(:disabled) {
          border-color: rgba(201, 169, 110, 0.4);
          background: rgba(201, 169, 110, 0.05);
          transform: translateY(-1px);
        }
        .b2b-action-card:disabled {
          opacity: 0.7;
          cursor: progress;
        }
        .b2b-action-card-pending {
          border-color: rgba(201, 169, 110, 0.4);
          background: rgba(201, 169, 110, 0.05);
        }
      `}</style>
    </>
  )
}
