'use client'

/**
 * WowActionsSection · sec 12 do modal admin legacy.
 *
 * Acoes premium 1-clique. Pedido Alden 2026-04-26: tirar "Em breve" das
 * funcoes que ja temos suporte (NPS · Senders · Certificado redirecionam
 * pra fluxo existente). IA conteudo fica pra fase 2 (edge function).
 *
 * Aparece na tab Crescer acima das metas operacionais.
 */

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { FileText, Link2, Zap, Phone, BarChart3, Award, Check } from 'lucide-react'
import type { B2BPartnershipDTO } from '@clinicai/repositories'
import { issueNpsLinkAction } from '../wow-actions'

const PAINEL_BASE =
  process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

export function WowActionsSection({
  partnership,
}: {
  partnership: B2BPartnershipDTO
}) {
  const [copied, setCopied] = useState(false)
  const [npsCopied, setNpsCopied] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const showCert =
    partnership.status === 'closed' ||
    partnership.status === 'review' ||
    partnership.status === 'paused'
  const showNps = partnership.status === 'active'

  const painelUrl = `${PAINEL_BASE}/parceiro.html?slug=${encodeURIComponent(partnership.slug)}`

  function copyPanel() {
    navigator.clipboard
      .writeText(painelUrl)
      .then(() => {
        setCopied(true)
        setFeedback('Link copiado · cola no WhatsApp da parceira')
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => setFeedback(`Copie manualmente: ${painelUrl}`))
  }

  function issueNps() {
    startTransition(async () => {
      const r = await issueNpsLinkAction(partnership.id)
      if (!r.ok || !r.url) {
        setFeedback(`Erro: ${r.error || 'nao foi possivel gerar link NPS'}`)
        return
      }
      try {
        await navigator.clipboard.writeText(r.url)
        setNpsCopied(true)
        setFeedback('Link NPS gerado e copiado · envie pra parceira responder')
        setTimeout(() => setNpsCopied(false), 2500)
      } catch {
        setFeedback(`Link NPS: ${r.url}`)
      }
    })
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="b2b-sec-title" style={{ marginTop: 0 }}>Acoes premium</h3>
        <span className="text-[11px] text-[var(--b2b-text-muted)]">
          Efeito WOW · 1-clique
        </span>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <Link
          href={`/partnerships/${partnership.id}/dossie`}
          target="_blank"
          rel="noopener"
          className="b2b-action-card"
        >
          <FileText className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">Dossie PDF</div>
            <div className="b2b-action-card-sub">Luxo · pra reuniao</div>
          </div>
        </Link>

        <button type="button" className="b2b-action-card text-left" onClick={copyPanel}>
          {copied ? (
            <Check className="w-5 h-5" style={{ color: '#10B981', flexShrink: 0 }} />
          ) : (
            <Link2 className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">
              {copied ? 'Link copiado!' : 'Painel do parceiro'}
            </div>
            <div className="b2b-action-card-sub truncate">Link publico · read-only</div>
          </div>
        </button>

        {/* Senders WhatsApp · redireciona pra Channels (UI canonica de
            quem-envia-o-que · funciona desde 2026-04-26). */}
        <Link
          href="/configuracoes?tab=channels"
          className="b2b-action-card"
        >
          <Phone className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">WhatsApp autorizados</div>
            <div className="b2b-action-card-sub">Configurar canais Mira</div>
          </div>
        </Link>

        {showNps ? (
          <button
            type="button"
            className="b2b-action-card text-left"
            onClick={issueNps}
            disabled={pending}
            title="Gera token NPS publico e copia URL"
          >
            {npsCopied ? (
              <Check className="w-5 h-5" style={{ color: '#10B981', flexShrink: 0 }} />
            ) : (
              <BarChart3 className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
            )}
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="b2b-action-card-title">
                {npsCopied ? 'Link NPS copiado!' : 'Link NPS'}
              </div>
              <div className="b2b-action-card-sub">
                {pending ? 'Gerando...' : 'Pesquisa quarterly · copia URL'}
              </div>
            </div>
          </button>
        ) : null}

        {showCert ? (
          <Link
            href={`/partnerships/${partnership.id}/dossie`}
            target="_blank"
            rel="noopener"
            className="b2b-action-card"
          >
            <Award className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="b2b-action-card-title">Certificado</div>
              <div className="b2b-action-card-sub">Dossiê PDF · imprime</div>
            </div>
          </Link>
        ) : null}

        {/* IA conteudo · unico que ainda eh "Em breve" · edge function
            do clinic-dashboard nao foi portada · TODO fase 2. */}
        <button
          type="button"
          className="b2b-action-card text-left"
          disabled
          title="Edge function Claude Haiku nao portada ainda · TODO fase 2"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
        >
          <Zap className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">IA conteúdo</div>
            <div className="b2b-action-card-sub">Em breve · fase 2</div>
          </div>
        </button>
      </div>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}
    </section>
  )
}
