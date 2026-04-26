'use client'

/**
 * LgpdClient · espelho de `b2b-lgpd-panel.ui.js`.
 *
 * 4 toggles de consentimento + Export JSON + Anonimizar (modal confirm com
 * motivo obrigatorio).
 *
 * Mutations via Server Actions em ../lgpd-actions.ts.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ConsentEntry, ConsentType } from '@clinicai/repositories'
import {
  setConsentAction,
  exportLgpdDataAction,
  anonymizePartnershipAction,
} from '../lgpd-actions'

const CONSENT_TYPES: Array<{ key: ConsentType; label: string }> = [
  { key: 'comm', label: 'Comunicacoes via WhatsApp/email' },
  { key: 'analytics', label: 'Analytics agregado e benchmarks' },
  { key: 'data_sharing', label: 'Compartilhamento com parceiros' },
  { key: 'marketing', label: 'Comunicacao de marketing' },
]

export function LgpdClient({
  partnershipId,
  partnershipName,
  initialConsents,
  canManage,
}: {
  partnershipId: string
  partnershipName: string
  initialConsents: Partial<Record<ConsentType, ConsentEntry>>
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [consents, setConsents] = useState(initialConsents)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reason, setReason] = useState('')

  function onToggle(type: ConsentType, granted: boolean) {
    if (!canManage) return
    startTransition(async () => {
      const r = await setConsentAction(partnershipId, type, granted)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setConsents((prev) => ({
        ...prev,
        [type]: {
          granted,
          source: 'ui_admin',
          updated_at: new Date().toISOString(),
          notes: null,
        },
      }))
      setFeedback(granted ? `Consentimento concedido (${type}).` : `Consentimento revogado (${type}).`)
    })
  }

  function onExport() {
    startTransition(async () => {
      const r = await exportLgpdDataAction(partnershipId)
      if (!r.ok || !r.data) {
        setFeedback(`Erro: ${r.error || 'falha no export'}`)
        return
      }
      const blob = new Blob([JSON.stringify(r.data, null, 2)], {
        type: 'application/json',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const safeName = partnershipName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      a.download = `lgpd-export-${safeName}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      setFeedback('Export gerado · arquivo .json baixado.')
    })
  }

  function onAnonymize() {
    if (reason.trim().length < 5) {
      setFeedback('Motivo precisa ter ao menos 5 caracteres.')
      return
    }
    startTransition(async () => {
      const r = await anonymizePartnershipAction(partnershipId, reason.trim())
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback(`Parceria anonimizada · novo nome: ${r.new_name}.`)
      setConfirmOpen(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="b2b-sec-title" style={{ marginTop: 0 }}>LGPD · Compliance</h3>
        <span className="text-[11px] text-[var(--b2b-text-muted)]">
          Consentimentos, exportacao e anonimizacao
        </span>
      </div>

      {/* Consents */}
      <div
        className="flex flex-col gap-2 p-3"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
        }}
      >
        {CONSENT_TYPES.map((t) => {
          const c = consents[t.key]
          const checked = c?.granted === true
          const since = c?.updated_at
            ? new Date(c.updated_at).toLocaleDateString('pt-BR')
            : null
          return (
            <label
              key={t.key}
              className="flex items-baseline gap-2 cursor-pointer"
              style={{ opacity: !canManage || pending ? 0.6 : 1 }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!canManage || pending}
                onChange={(e) => onToggle(t.key, e.target.checked)}
              />
              <span className="text-[12.5px]" style={{ color: 'var(--b2b-ivory)' }}>
                {t.label}
                {since ? (
                  <small className="ml-2 text-[10px] text-[var(--b2b-text-muted)]">
                    · desde {since}
                  </small>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="b2b-btn"
          onClick={onExport}
          disabled={pending}
        >
          {pending ? 'Gerando...' : 'Exportar dados (.json)'}
        </button>
        {canManage ? (
          <button
            type="button"
            className="b2b-btn"
            style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444' }}
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
          >
            Anonimizar parceria
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--b2b-text-muted)]" style={{ lineHeight: 1.5 }}>
        Anonimizacao e <strong>irreversivel</strong>: nome, contatos, narrativas
        viram placeholder. Agregados (vouchers, NPS, audit) sao preservados.
      </p>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}

      {/* Modal de confirmacao */}
      {confirmOpen ? (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', zIndex: 100 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false)
          }}
        >
          <div
            className="b2b-card b2b-card-gold w-[90%] max-w-md"
            style={{ background: '#0a0a0a' }}
          >
            <h3
              className="text-[18px] font-semibold mb-2"
              style={{ color: '#EF4444', fontFamily: "'Cormorant Garamond', serif" }}
            >
              Anonimizar parceria
            </h3>
            <p className="text-[12.5px] mb-3" style={{ color: 'var(--b2b-ivory)', lineHeight: 1.5 }}>
              Esta acao e <strong>irreversivel</strong>. Nome, contatos e
              narrativas viram placeholder. Vouchers, NPS scores e audit log
              sao preservados.
            </p>
            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Motivo (minimo 5 caracteres) *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="b2b-input"
                placeholder="Ex.: Pedido formal LGPD via email do dia X"
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                className="b2b-btn"
                onClick={() => {
                  setConfirmOpen(false)
                  setReason('')
                }}
                disabled={pending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="b2b-btn"
                style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444' }}
                onClick={onAnonymize}
                disabled={pending || reason.trim().length < 5}
              >
                {pending ? 'Anonimizando...' : 'Anonimizar agora'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
