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
 * Visual: usa b2b-action-card global (b2b-detail.css).
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
        className={`b2b-action-card${pending ? ' b2b-action-card-primary' : ''}`}
        title={`Aplica template "${KIND_LABEL[kind]}" da clinica`}
      >
        {pending ? (
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
        ) : (
          <Lightbulb className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
        )}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="b2b-action-card-title flex items-center gap-1.5">
            <span>{pending ? 'Aplicando...' : 'Aplicar Playbook'}</span>
            <span
              className="text-[8.5px] uppercase tracking-[1px] px-1.5 py-[1px] rounded font-bold"
              style={{
                background: 'rgba(201,169,110,0.18)',
                color: 'var(--b2b-champagne)',
              }}
            >
              {KIND_LABEL[kind]}
            </span>
          </div>
          <div className="b2b-action-card-sub">
            Cria tasks + content padrão + metas operacionais. Idempotente.
          </div>
        </div>
      </button>
      {localMsg ? (
        <div className="sm:col-span-2 b2b-feedback">{localMsg}</div>
      ) : null}
    </>
  )
}
