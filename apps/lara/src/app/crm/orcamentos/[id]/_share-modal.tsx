'use client'

/**
 * ShareOrcamentoModal · gera/recupera share_token e mostra link copiavel +
 * botao WhatsApp pre-preenchido.
 *
 * Pattern legacy (orcamento.html): URL canonica `/orcamento/<token>` ·
 * sem JWT · server lookup via service_role. Token idempotente · re-abrir
 * modal nao gera novo (preserva link enviado pro paciente).
 *
 * v1: sem dependencia do og.miriandpaula.com.br worker · preview
 * WhatsApp menos rico mas funcional.
 */

import * as React from 'react'
import { Button, Modal, useToast } from '@clinicai/ui'
import { Copy, MessageCircle, Loader2 } from 'lucide-react'
import { ensureShareTokenAction } from '../../_actions/orcamento.actions'

interface ShareOrcamentoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orcamentoId: string
  /** Numero de telefone (E.164 sem +, ex: 5573988887777) · null = sem WhatsApp */
  phoneE164: string | null
  /** Nome (primeiro nome) pra mensagem · null = "Olá!" */
  recipientName: string | null
  /** Titulo do orcamento pra mensagem · null = "seu orçamento" */
  orcamentoTitle: string | null
}

export function ShareOrcamentoModal({
  open,
  onOpenChange,
  orcamentoId,
  phoneE164,
  recipientName,
  orcamentoTitle,
}: ShareOrcamentoModalProps) {
  const toast = useToast()
  const [token, setToken] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || token || loading) return
    setLoading(true)
    setError(null)
    ensureShareTokenAction({ orcamentoId })
      .then((r) => {
        if (r.ok) setToken(r.data.shareToken)
        else setError('Falha ao gerar link de compartilhamento.')
      })
      .catch(() => setError('Erro inesperado.'))
      .finally(() => setLoading(false))
  }, [open, orcamentoId, token, loading])

  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://m.miriandpaula.com.br'
  const shareUrl = token ? `${baseUrl}/orcamento/${token}` : ''

  const firstName = (recipientName ?? '').trim().split(/\s+/)[0] || ''
  const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!'
  const titleText = orcamentoTitle?.trim() || 'seu orçamento'
  const message = `${greeting} Aqui está o orçamento "${titleText}" que preparei pra você. ${shareUrl}\n\nQualquer dúvida, é só me chamar. — Mirian`

  const waUrl = phoneE164
    ? `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`

  async function copyLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('Link copiado!')
    } catch {
      toast.error('Falha ao copiar')
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Compartilhar orçamento"
      description="Link público sem login · paciente abre e visualiza."
      className="max-w-lg"
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-[var(--muted-foreground)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Gerando link…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {token && (
          <>
            <div>
              <label className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
                Link público
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--foreground)]"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-[var(--border)] bg-[var(--card)]/40 p-3">
              <div className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
                Pré-visualização da mensagem
              </div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-[var(--foreground)]">
                {message}
              </pre>
            </div>

            {!phoneE164 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                Paciente sem telefone cadastrado · botão abre WhatsApp em branco
                pra você escolher o destinatário.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <Button>
                  <MessageCircle className="h-4 w-4" />
                  Abrir WhatsApp
                </Button>
              </a>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
