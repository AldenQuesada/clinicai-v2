'use client'

/**
 * ActionSection · 4 botoes 1-clique pra aumentar conversao da parceria.
 *
 * Foco: cada acao reduz friction da parceria emitir + receber vouchers
 * de qualidade (= mais conversao no funnel).
 *
 * Acoes nesta versao (P1):
 *   📋 Aplicar Playbook · cria tasks/contents/metas iniciais (mig 800-22)
 *   📄 Dossie PDF       · gera HTML imprimivel pra apresentar interno
 *   🔗 Link painel      · copia URL publico do painel da parceira
 *   🎟 Emitir voucher    · navega pra tab Vouchers
 *
 * Visual luxury · b2b-action-card + b2b-insight pra sugestoes.
 */

import Link from 'next/link'
import { useState } from 'react'
import { FileText, Link2, Ticket, Check } from 'lucide-react'
import type { GrowthPanel, B2BPartnershipDTO } from '@clinicai/repositories'
import { ApplyPlaybookButton } from './ApplyPlaybookButton'

const PAINEL_BASE =
  process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

export function ActionSection({
  data,
  partnership,
}: {
  data: GrowthPanel
  partnership: B2BPartnershipDTO
}) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const painelUrl = `${PAINEL_BASE}/parceiro.html?slug=${encodeURIComponent(partnership.slug)}`

  function copyPainelUrl() {
    navigator.clipboard
      .writeText(painelUrl)
      .then(() => {
        setCopied(true)
        setFeedback('Link copiado · cola no WhatsApp da parceira')
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => setFeedback(`Copie manualmente: ${painelUrl}`))
  }

  // Suggestions baseadas nos dados (Insights P1 sem IA · regra-baseado)
  const suggestions: { icon: string; text: string; tone: 'warn' | 'ok' | 'opportunity' }[] = []

  if (data.trend.direction === 'worsening') {
    suggestions.push({
      icon: '⚠',
      text: `Saúde piorou nos últimos 90d (${data.trend.first} → ${data.trend.current}). Considere ligar pra parceira ou aplicar playbook de retenção.`,
      tone: 'warn',
    })
  }

  if (data.cost.over_cap) {
    suggestions.push({
      icon: '🚦',
      text: 'Custo acumulado já passou do teto mensal. Pause emissão de novos vouchers ou ajuste o cap em Configurações → Padrões.',
      tone: 'warn',
    })
  }

  if (data.conversion_lifetime.conv_pct < 15 && data.conversion_lifetime.vouchers_total >= 5) {
    suggestions.push({
      icon: '📉',
      text: `Conversão baixa (${data.conversion_lifetime.conv_pct.toFixed(1)}%). Reveja combo configurado · talvez não case com perfil das beneficiárias.`,
      tone: 'opportunity',
    })
  }

  if (data.nps.score != null && data.nps.score >= 8) {
    suggestions.push({
      icon: '🌟',
      text: `NPS ${data.nps.score} excelente. Use Pitch Mode na próxima reunião pra reforçar parceria + propor upgrade de combo.`,
      tone: 'ok',
    })
  }

  if (data.impact.score >= 70) {
    suggestions.push({
      icon: '💎',
      text: 'Score de impacto alto. Considere marcar como parceria de imagem (Configurações da parceria) pra entrar nos alertas premium.',
      tone: 'opportunity',
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">💡 Ação</span>
        <span className="text-[11.5px] text-[var(--b2b-text-muted)]">
          O que fazer agora pra aumentar conversão?
        </span>
      </div>

      {/* Acoes 1-click · grid 2x2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ApplyPlaybookButton
          partnership={partnership}
          onResult={(msg) => setFeedback(msg)}
        />

        <Link
          href={`/partnerships/${partnership.id}?tab=vouchers`}
          className="b2b-action-card b2b-action-card-primary"
        >
          <Ticket className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">Emitir voucher novo</div>
            <div className="b2b-action-card-sub">
              Pula direto pro form em Vouchers
            </div>
          </div>
        </Link>

        <button type="button" onClick={copyPainelUrl} className="b2b-action-card">
          {copied ? (
            <Check className="w-5 h-5" style={{ color: '#10B981', flexShrink: 0 }} />
          ) : (
            <Link2 className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">
              {copied ? 'Link copiado!' : 'Link do painel da parceira'}
            </div>
            <div className="b2b-action-card-sub truncate" style={{ maxWidth: 280 }}>
              {painelUrl}
            </div>
          </div>
        </button>

        <Link
          href={`/partnerships/${partnership.id}/dossie`}
          target="_blank"
          rel="noopener"
          className="b2b-action-card"
        >
          <FileText className="w-5 h-5" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="b2b-action-card-title">Dossiê PDF</div>
            <div className="b2b-action-card-sub">
              Abre os 6 slides em nova aba e dispara o diálogo de impressão
            </div>
          </div>
        </Link>
      </div>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}

      {/* Sugestoes (Insights P1 · regra-baseado) */}
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-2 mt-2">
          <div className="text-[10px] uppercase tracking-[1.6px] font-bold text-[var(--b2b-text-muted)]">
            Sugestões pra essa parceria
          </div>
          {suggestions.map((s, i) => (
            <div key={i} className="b2b-insight" data-tone={s.tone}>
              <span className="b2b-insight-icon">{s.icon}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
