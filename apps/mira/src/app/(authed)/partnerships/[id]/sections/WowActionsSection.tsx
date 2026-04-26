'use client'

/**
 * WowActionsSection · sec 12 do modal admin legacy.
 *
 * Mirror de `b2b-wow-actions.ui.js`. Barra premium de acoes 1-clique:
 *   - Dossie PDF (link interno · /partnerships/[id]/dossie)
 *   - Painel do parceiro (copia URL publico)
 *   - IA conteudo (TODO · edge function nao portada · marca Em breve)
 *   - Senders WhatsApp (TODO · UI nao portada)
 *   - Link NPS / Certificado (TODO · servicos nao portados)
 *
 * Visual b2b-wow-bar / b2b-wow-btn (ja em b2b-detail.css legado).
 *
 * Aparece na tab Crescer acima das metas operacionais.
 */

import Link from 'next/link'
import { useState } from 'react'
import { FileText, Link2, Zap, Phone, BarChart3, Award, Check } from 'lucide-react'
import type { B2BPartnershipDTO } from '@clinicai/repositories'

const PAINEL_BASE =
  process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

export function WowActionsSection({
  partnership,
}: {
  partnership: B2BPartnershipDTO
}) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

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

        <button
          type="button"
          className="b2b-action-card text-left"
          disabled
          title="Edge function de IA nao portada ainda"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
        >
          <Zap className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">IA conteudo</div>
            <div className="b2b-action-card-sub">Em breve</div>
          </div>
        </button>

        <button
          type="button"
          className="b2b-action-card text-left"
          disabled
          title="UI de senders nao portada ainda"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
        >
          <Phone className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">WhatsApp autorizados</div>
            <div className="b2b-action-card-sub">Em breve</div>
          </div>
        </button>

        {showNps ? (
          <button
            type="button"
            className="b2b-action-card text-left"
            disabled
            title="NPS service nao portado ainda"
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          >
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="b2b-action-card-title">Link NPS</div>
              <div className="b2b-action-card-sub">Em breve</div>
            </div>
          </button>
        ) : null}

        {showCert ? (
          <button
            type="button"
            className="b2b-action-card text-left"
            disabled
            title="Certificate service nao portado ainda"
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          >
            <Award className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="b2b-action-card-title">Certificado</div>
              <div className="b2b-action-card-sub">Em breve</div>
            </div>
          </button>
        ) : null}
      </div>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}
    </section>
  )
}
