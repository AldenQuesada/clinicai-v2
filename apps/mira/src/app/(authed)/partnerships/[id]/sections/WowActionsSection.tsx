'use client'

/**
 * WowActionsSection · sec 12 do modal admin legacy.
 *
 * Acoes premium 1-clique. Pedido Alden 2026-04-26: tirar "Em breve" das
 * funcoes que ja temos suporte. IA conteudo agora destravada · server
 * action chama Claude Haiku via @clinicai/ai/anthropic (cost-controlled).
 *
 * Aparece na tab Crescer acima das metas operacionais.
 */

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { FileText, Link2, Zap, Phone, BarChart3, Award, Check, Copy, X } from 'lucide-react'
import type { B2BPartnershipDTO } from '@clinicai/repositories'
import { issueNpsLinkAction } from '../wow-actions'
import { generatePartnerContentAction, type AiContentKind } from '../ai-actions'

const PAINEL_BASE =
  process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

const AI_KIND_LABEL: Record<AiContentKind, string> = {
  post: 'Post Instagram',
  story: 'Story Instagram',
  reels: 'Roteiro Reels',
  email: 'Email parceira',
}

const AI_KIND_HINT: Record<AiContentKind, string> = {
  post: '1-2 paragrafos · CTA suave',
  story: '1 frase forte · vibe instantanea',
  reels: 'gancho + 2-3 beats · CTA',
  email: 'saudacao calorosa · proximo passo',
}

const AI_ERROR_FRIENDLY: Record<string, string> = {
  api_key_missing: 'API key da Anthropic nao configurada · pede pra Alden adicionar ANTHROPIC_API_KEY',
  budget_exceeded: 'Budget do dia excedido · tente amanha ou ajusta limite',
  empty_completion: 'IA nao retornou conteudo · tenta de novo',
  not_found: 'Parceria nao encontrada',
  invalid_kind: 'Tipo de conteudo invalido',
}

export function WowActionsSection({
  partnership,
}: {
  partnership: B2BPartnershipDTO
}) {
  const [copied, setCopied] = useState(false)
  const [npsCopied, setNpsCopied] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Estado da modal IA conteudo
  const [aiOpen, setAiOpen] = useState(false)
  const [aiKind, setAiKind] = useState<AiContentKind | null>(null)
  const [aiPending, startAiTransition] = useTransition()
  const [aiContent, setAiContent] = useState<string>('')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiCopied, setAiCopied] = useState(false)

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

  function openAi() {
    setAiOpen(true)
    setAiKind(null)
    setAiContent('')
    setAiError(null)
    setAiCopied(false)
  }

  function closeAi() {
    setAiOpen(false)
  }

  function generateAi(kind: AiContentKind) {
    setAiKind(kind)
    setAiContent('')
    setAiError(null)
    setAiCopied(false)
    startAiTransition(async () => {
      const r = await generatePartnerContentAction(partnership.id, kind)
      if (!r.ok || !r.content) {
        setAiError(AI_ERROR_FRIENDLY[r.error ?? ''] || `Erro: ${r.error || 'falha ao gerar'}`)
        return
      }
      setAiContent(r.content)
    })
  }

  function copyAi() {
    if (!aiContent) return
    navigator.clipboard
      .writeText(aiContent)
      .then(() => {
        setAiCopied(true)
        setTimeout(() => setAiCopied(false), 2500)
      })
      .catch(() => {
        // noop · textarea ainda mostra
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
          title="Abre dossiê em PDF luxury com 6 slides (DNA, métricas, timeline) pra apresentar em reunião."
        >
          <FileText
            className="w-5 h-5"
            style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }}
            aria-label="Documento PDF"
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">Dossie PDF</div>
            <div className="b2b-action-card-sub">Luxo · pra reuniao</div>
          </div>
        </Link>

        <button
          type="button"
          className="b2b-action-card text-left"
          onClick={copyPanel}
          title="Copia URL público read-only do painel da parceira (vouchers, indicações, NPS) pra colar no WhatsApp dela."
        >
          {copied ? (
            <Check
              className="w-5 h-5"
              style={{ color: '#10B981', flexShrink: 0 }}
              aria-label="Copiado"
            />
          ) : (
            <Link2
              className="w-5 h-5"
              style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }}
              aria-label="Link"
            />
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
          title="Configura quais números WhatsApp Mira pode usar pra enviar vouchers/NPS dessa parceria."
        >
          <Phone
            className="w-5 h-5"
            style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }}
            aria-label="Telefone"
          />
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
            title="Gera token NPS publico (válido 30d) e copia URL pra parceira responder pesquisa de satisfação 1-10."
          >
            {npsCopied ? (
              <Check
                className="w-5 h-5"
                style={{ color: '#10B981', flexShrink: 0 }}
                aria-label="Copiado"
              />
            ) : (
              <BarChart3
                className="w-5 h-5"
                style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }}
                aria-label="Pesquisa NPS"
              />
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
            title="Certificado de parceria (versão imprimível do dossiê) pra registrar histórico após encerramento ou pausa."
          >
            <Award
              className="w-5 h-5"
              style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }}
              aria-label="Certificado"
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="b2b-action-card-title">Certificado</div>
              <div className="b2b-action-card-sub">Dossiê PDF · imprime</div>
            </div>
          </Link>
        ) : null}

        {/* IA conteudo · destravado 2026-04-26 · server action chama Claude
            Haiku via @clinicai/ai/anthropic (cost-controlled). */}
        <button
          type="button"
          className="b2b-action-card text-left"
          onClick={openAi}
          title="Gera post/story/reels/email com Claude Haiku usando pillar, slogan e métricas recentes da parceria. Custo controlado por edge function."
        >
          <Zap
            className="w-5 h-5"
            style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }}
            aria-label="IA conteudo"
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">IA conteudo</div>
            <div className="b2b-action-card-sub">Post · Story · Reels · Email</div>
          </div>
        </button>
      </div>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}

      {/* Modal IA conteudo · b2b-overlay pattern padrao */}
      {aiOpen ? (
        <div
          className="b2b-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAi()
          }}
        >
          <div className="b2b-modal" role="dialog" aria-modal="true">
            <div className="b2b-modal-hdr">
              <h2>IA conteudo · {partnership.name}</h2>
              <button type="button" className="b2b-close" onClick={closeAi} aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="b2b-modal-body flex flex-col gap-4">
              <div className="text-[12px] text-[var(--b2b-text-muted)]">
                Escolhe o formato · Claude Haiku gera em 2-3s baseado em pillar, slogan
                e metricas recentes da parceria.
              </div>

              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
              >
                {(Object.keys(AI_KIND_LABEL) as AiContentKind[]).map((k) => {
                  const isActive = aiKind === k
                  const isLoading = aiPending && isActive
                  return (
                    <button
                      key={k}
                      type="button"
                      className="b2b-action-card text-left"
                      onClick={() => generateAi(k)}
                      disabled={aiPending}
                      style={
                        isActive
                          ? { borderColor: 'var(--b2b-champagne)', flexShrink: 0 }
                          : undefined
                      }
                    >
                      <Zap
                        className="w-4 h-4"
                        style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }}
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="b2b-action-card-title">{AI_KIND_LABEL[k]}</div>
                        <div className="b2b-action-card-sub">
                          {isLoading ? 'Gerando...' : AI_KIND_HINT[k]}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {aiError ? (
                <div
                  className="text-[12px] rounded-md px-3 py-2"
                  style={{
                    background: 'rgba(220,53,69,0.12)',
                    border: '1px solid rgba(220,53,69,0.35)',
                    color: '#FCA5A5',
                  }}
                >
                  {aiError}
                </div>
              ) : null}

              {aiContent ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    className="w-full text-[13px] leading-relaxed rounded-md p-3 font-sans"
                    style={{
                      background: 'var(--b2b-bg-2)',
                      border: '1px solid var(--b2b-border)',
                      color: 'var(--b2b-ivory)',
                      minHeight: 220,
                      resize: 'vertical',
                    }}
                    value={aiContent}
                    onChange={(e) => setAiContent(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="b2b-btn"
                      onClick={copyAi}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {aiCopied ? (
                        <>
                          <Check className="w-4 h-4" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
