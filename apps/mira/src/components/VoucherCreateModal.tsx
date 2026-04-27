'use client'

/**
 * VoucherCreateModal · overlay flutuante pra criar voucher rapido.
 *
 * Pedido Alden 2026-04-27: "Novo voucher" do NewMenu deve abrir modal,
 * nao navegar pra /vouchers/novo (page). Mesmo padrao do modal interno
 * de partnerships/[id] tab Vouchers · b2b-overlay/b2b-modal · ESC fecha.
 *
 * Carrega lista de parcerias ativas via Server Action quando abre.
 */

import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import {
  listEnrichedPartnershipsAction,
  listAllCombosAction,
} from '@/app/(authed)/vouchers/novo/actions'
import { SingleVoucherForm, type PartnershipOption } from '@/app/(authed)/vouchers/novo/SingleVoucherForm'

export function VoucherCreateModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [partnerships, setPartnerships] = useState<PartnershipOption[]>([])
  const [combos, setCombos] = useState<string[]>([])
  const [loading, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Fetch lazy quando abre · partnerships + combos em paralelo
  useEffect(() => {
    if (!open) return
    setError(null)
    startTransition(async () => {
      try {
        const [list, comboList] = await Promise.all([
          listEnrichedPartnershipsAction(),
          listAllCombosAction(),
        ])
        setPartnerships(list)
        setCombos(comboList)
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
          maxWidth: 720,
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
            padding: '14px 20px',
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
              Voucher · novo
            </div>
            <h2
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 24,
                fontWeight: 500,
                margin: '4px 0 0',
                lineHeight: 1.1,
              }}
            >
              Emitir{' '}
              <em style={{ color: 'var(--b2b-gold, #C9A96E)', fontStyle: 'italic' }}>
                voucher
              </em>
            </h2>
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

        <div style={{ padding: '20px 28px 32px' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>
              Carregando parcerias…
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
            <SingleVoucherForm partnerships={partnerships} combos={combos} />
          )}
        </div>
      </div>
    </div>
  )
}
