'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Mail, MessageCircle, CheckCircle2 } from 'lucide-react'
import { trackEvent } from '@/lib/utils/trackEvent'

interface Props {
  flipbookId: string
  /** Página em que o modal disparou. Vai pro `source_page` na tabela. */
  currentPage: number
  /** Header mostrado no modal · default "Continue lendo". */
  title?: string
  /** Se true, mostra botão de fechar (X). Default true. */
  dismissible?: boolean
  onClose: () => void
  onSubmitted?: () => void
}

/**
 * Modal mid-book pra captura de email + WhatsApp opcional.
 * - Submete pra POST /api/leads
 * - Dispara trackEvent shown/dismissed/submitted (funnel)
 * - Mostra success state in-place após submit (não fecha imediato)
 */
export function LeadCaptureModal({
  flipbookId, currentPage, title = 'Continue lendo', dismissible = true, onClose, onSubmitted,
}: Props) {
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [optIn, setOptIn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Track shown uma vez no mount
  useEffect(() => {
    trackEvent({
      flipbookId,
      kind: 'lead_capture_shown',
      pageNumber: currentPage,
    })
  }, [flipbookId, currentPage])

  function handleClose() {
    if (!done) {
      trackEvent({
        flipbookId,
        kind: 'lead_capture_dismissed',
        pageNumber: currentPage,
      })
    }
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flipbook_id: flipbookId,
          email: email.trim(),
          whatsapp: whatsapp.trim() || undefined,
          opt_in_marketing: optIn,
          source_page: currentPage,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.error === 'invalid' ? 'verifique os dados' : 'falha ao enviar · tente de novo')
        setBusy(false)
        return
      }
      trackEvent({
        flipbookId,
        kind: 'lead_capture_submitted',
        pageNumber: currentPage,
        metadata: { has_whatsapp: !!whatsapp.trim(), opt_in_marketing: optIn },
      })
      setDone(true)
      setBusy(false)
      onSubmitted?.()
      // auto-fecha após 1.6s
      setTimeout(onClose, 1600)
    } catch {
      setError('erro de rede · tente de novo')
      setBusy(false)
    }
  }

  // Esc fecha (se dismissible)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissible])

  return (
    <AnimatePresence>
      <motion.div
        key="lead-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm"
        onClick={dismissible ? handleClose : undefined}
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md bg-bg-elevated border border-gold/30 rounded-lg shadow-2xl p-6"
        >
          {dismissible && (
            <button
              onClick={handleClose}
              aria-label="Fechar"
              className="absolute top-3 right-3 p-1.5 rounded text-text-dim hover:text-gold hover:bg-bg-panel transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-gold mx-auto mb-3" strokeWidth={1.5} />
              <h2 className="font-display italic text-text text-2xl mb-2">Recebido</h2>
              <p className="font-meta text-text-muted text-xs uppercase tracking-wider">
                Boa leitura
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <div className="font-meta text-gold text-[10px] uppercase tracking-wider mb-1">
                  Página {currentPage}
                </div>
                <h2 className="font-display italic text-text text-2xl leading-tight">
                  {title}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <label className="block">
                  <span className="font-meta text-text-muted text-[10px] uppercase tracking-wider mb-1 block">
                    Email
                  </span>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" strokeWidth={1.5} />
                    <input
                      type="email"
                      required
                      autoFocus
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full bg-bg border border-border rounded px-9 py-2.5 text-text text-sm font-display outline-none focus:border-gold transition"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="font-meta text-text-muted text-[10px] uppercase tracking-wider mb-1 block">
                    WhatsApp <span className="text-text-dim normal-case">(opcional)</span>
                  </span>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" strokeWidth={1.5} />
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+55 11 9 0000 0000"
                      className="w-full bg-bg border border-border rounded px-9 py-2.5 text-text text-sm font-display outline-none focus:border-gold transition"
                    />
                  </div>
                </label>

                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={optIn}
                    onChange={(e) => setOptIn(e.target.checked)}
                    className="mt-0.5 accent-gold cursor-pointer"
                  />
                  <span className="font-meta text-text-muted text-[10px] uppercase tracking-wider leading-relaxed">
                    Aceito receber novidades e conteúdos por email/WhatsApp
                  </span>
                </label>

                {error && (
                  <p className="text-red-400 text-xs font-meta uppercase tracking-wider">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className="w-full bg-gold hover:bg-gold-light text-bg font-meta text-xs uppercase tracking-wider py-3 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Continuar lendo
                </button>
              </form>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
