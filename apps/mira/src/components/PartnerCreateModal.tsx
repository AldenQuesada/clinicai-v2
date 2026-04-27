'use client'

/**
 * PartnerCreateModal · overlay flutuante pra cadastrar parceria.
 *
 * Pedido Alden 2026-04-27: igual ao legado · TODOS os modals de "Adicionar"
 * sao overlay (regra documentada em feedback_legacy_literal.md). NewMenu
 * antes navegava pra /estudio/cadastrar (page) · agora abre aqui.
 *
 * Carrega lazy: combos + tier configs via server action.
 * Usa WizardClient (3-step) inalterado · so envelopa em overlay.
 *
 * Pagina /estudio/cadastrar continua disponivel (URL direta · share · F5).
 */

import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { WizardClient } from '@/app/(authed)/estudio/cadastrar/WizardClient'
import { loadWizardLazyDataAction, type WizardLazyData } from '@/app/(authed)/estudio/cadastrar/actions-modal'

export function PartnerCreateModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [data, setData] = useState<WizardLazyData | null>(null)
  const [loading, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    startTransition(async () => {
      try {
        const lazy = await loadWizardLazyDataAction()
        setData(lazy)
      } catch (e) {
        setError((e as Error).message || 'Falha ao carregar dados')
      }
    })
  }, [open])

  // ESC fecha
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="b2b-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        background: 'rgba(0,0,0,0.78)',
        alignItems: 'flex-start',
        paddingTop: 32,
      }}
    >
      <div
        className="b2b-modal"
        style={{
          maxWidth: 920,
          width: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          background: 'var(--b2b-bg-1, #1A1713)',
          color: 'var(--b2b-ivory, #F5F0E8)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 24px',
            borderBottom: '1px solid var(--b2b-border)',
            position: 'sticky',
            top: 0,
            zIndex: 5,
            background: 'var(--b2b-bg-1, #1A1713)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: 'var(--b2b-gold, #C9A96E)',
                fontWeight: 600,
              }}
            >
              Estúdio · cadastro
            </div>
            <h2
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 26,
                fontWeight: 500,
                margin: '4px 0 0',
                lineHeight: 1.1,
              }}
            >
              Cadastrar{' '}
              <em
                style={{
                  color: 'var(--b2b-gold, #C9A96E)',
                  fontStyle: 'italic',
                }}
              >
                parceria
              </em>
            </h2>
            <p
              style={{
                fontSize: 12,
                color: 'var(--b2b-text-dim, #B8A88E)',
                fontStyle: 'italic',
                margin: '4px 0 0',
              }}
            >
              3 passos · Identidade · Operação · Detalhes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="b2b-btn"
            style={{ padding: '4px 10px', fontSize: 11 }}
          >
            <X className="w-3 h-3 inline mr-1" /> Fechar
          </button>
        </div>

        <div style={{ padding: '24px 28px 32px' }}>
          {loading || !data ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>
              Carregando combos e tiers…
            </div>
          ) : error ? (
            <div
              role="alert"
              style={{
                padding: 12,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          ) : (
            <WizardClient
              mode="new"
              combos={data.combos}
              tierConfigs={data.tierConfigs}
            />
          )}
        </div>
      </div>
    </div>
  )
}
