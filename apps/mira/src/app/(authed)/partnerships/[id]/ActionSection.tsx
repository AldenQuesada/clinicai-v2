'use client'

/**
 * ActionSection · 4 botoes 1-clique pra aumentar conversao da parceria.
 *
 * Foco: cada acao reduz friction da parceria emitir + receber vouchers
 * de qualidade (= mais conversao no funnel).
 *
 * Acoes nesta versao (P1):
 *   📋 Aplicar Playbook · cria tasks/contents/metas iniciais (TODO server action)
 *   📄 Dossie PDF       · gera HTML imprimivel pra apresentar interno (TODO)
 *   🔗 Link painel      · copia URL publico do painel da parceira
 *   🎟 Emitir voucher    · navega pra tab Vouchers
 *
 * P2 (depois): IA conteudo (Claude gera ideas), Insights inline (top 3
 * recomendacoes Claude Haiku contextuais).
 */

import Link from 'next/link'
import { useState } from 'react'
import { FileText, Link2, Lightbulb, Ticket, Check } from 'lucide-react'
import type { GrowthPanel, B2BPartnershipDTO } from '@clinicai/repositories'

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
        <span className="text-[10px] uppercase tracking-[2px] font-bold text-[#C9A96E]">
          💡 Ação
        </span>
        <span className="text-[11px] text-[#9CA3AF]">
          O que fazer agora pra aumentar conversão?
        </span>
      </div>

      {/* Acoes 1-click · grid 2x2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ActionCard
          icon={<Lightbulb className="w-5 h-5" />}
          title="Aplicar Playbook"
          description="Cria tasks iniciais + content padrão + metas operacionais pra esse tipo de parceria. Idempotente — não duplica."
          tone="primary"
          disabled
          tooltip="Em breve · vamos integrar com b2b_apply_playbook RPC"
        />

        <Link
          href={`/partnerships/${partnership.id}?tab=vouchers`}
          className="b2b-action-card b2b-action-card-primary"
        >
          <Ticket className="w-5 h-5" />
          <div className="flex flex-col gap-0.5">
            <div className="text-[12px] font-bold text-[#F5F0E8]">
              Emitir voucher novo
            </div>
            <div className="text-[10.5px] text-[#9CA3AF]">
              Pula direto pro form em Vouchers
            </div>
          </div>
        </Link>

        <button
          type="button"
          onClick={copyPainelUrl}
          className="b2b-action-card"
        >
          {copied ? <Check className="w-5 h-5 text-[#10B981]" /> : <Link2 className="w-5 h-5" />}
          <div className="flex flex-col gap-0.5 text-left">
            <div className="text-[12px] font-bold text-[#F5F0E8]">
              {copied ? 'Link copiado!' : 'Link do painel da parceira'}
            </div>
            <div className="text-[10.5px] text-[#9CA3AF] truncate max-w-[280px]">
              {painelUrl}
            </div>
          </div>
        </button>

        <ActionCard
          icon={<FileText className="w-5 h-5" />}
          title="Dossiê PDF"
          description="HTML imprimível com KPIs + ROI + history. Pra anexar em proposta de renovação ou apresentar pra parceira."
          disabled
          tooltip="Em breve · b2b-detail-dossier service"
        />
      </div>

      {feedback ? (
        <div className="text-[11px] text-[#C9A96E] bg-[#C9A96E]/10 border border-[#C9A96E]/20 rounded px-3 py-2">
          {feedback}
        </div>
      ) : null}

      {/* Sugestoes (Insights P1 · regra-baseado) */}
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-2 mt-2">
          <div className="text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">
            Sugestões pra essa parceria
          </div>
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border px-3.5 py-2.5 flex items-start gap-3"
              style={{
                borderColor:
                  s.tone === 'warn'
                    ? 'rgba(239,68,68,0.3)'
                    : s.tone === 'ok'
                    ? 'rgba(16,185,129,0.3)'
                    : 'rgba(201,169,110,0.25)',
                background:
                  s.tone === 'warn'
                    ? 'rgba(239,68,68,0.05)'
                    : s.tone === 'ok'
                    ? 'rgba(16,185,129,0.05)'
                    : 'rgba(201,169,110,0.04)',
              }}
            >
              <span className="text-base shrink-0">{s.icon}</span>
              <span className="text-[12.5px] text-[#F5F0E8] leading-relaxed">
                {s.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <style jsx>{`
        .b2b-action-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #f5f0e8;
          text-align: left;
          cursor: pointer;
          transition: all 200ms ease;
          width: 100%;
        }
        .b2b-action-card:hover:not(:disabled) {
          border-color: rgba(201, 169, 110, 0.4);
          background: rgba(201, 169, 110, 0.05);
          transform: translateY(-1px);
        }
        .b2b-action-card:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .b2b-action-card-primary {
          border-color: rgba(201, 169, 110, 0.25);
          background: rgba(201, 169, 110, 0.04);
        }
      `}</style>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  description,
  tone,
  disabled,
  tooltip,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  tone?: 'primary'
  disabled?: boolean
  tooltip?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={'b2b-action-card' + (tone === 'primary' ? ' b2b-action-card-primary' : '')}
      disabled={disabled}
      title={tooltip}
      onClick={onClick}
    >
      {icon}
      <div className="flex flex-col gap-0.5 text-left">
        <div className="text-[12px] font-bold text-[#F5F0E8]">
          {title}
          {disabled ? (
            <span className="ml-1.5 text-[8px] uppercase tracking-[1px] px-1 py-px rounded bg-white/5 text-[#6B7280]">
              em breve
            </span>
          ) : null}
        </div>
        <div className="text-[10.5px] text-[#9CA3AF]">{description}</div>
      </div>
    </button>
  )
}
