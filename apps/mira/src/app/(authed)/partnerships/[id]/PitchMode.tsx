'use client'

/**
 * PitchMode · modal fullscreen pra apresentar pra parceira em reuniao.
 *
 * Mirror funcional do `b2b-pitch-mode.ui.js` legacy + adaptado pra ser
 * PERSONALIZADO pra essa parceria (em vez de generico do programa).
 *
 * 7 slides:
 *   1. Capa            · Círculo Mirian + nome da parceria + IG handle
 *   2. Pillar + DNA    · pilares + 3 notas + score agregado
 *   3. Volume          · vouchers emitidos / convertidos no lifetime
 *   4. Top conversoes  · primeiros nomes que viraram pacientes (privacidade)
 *   5. ROI             · valor gerado vs custo
 *   6. Proximos passos · sugestao Mira
 *   7. Obrigada        · fechamento
 *
 * Navegacao: ESC fecha · setas ←/→ · dots clickaveis · Space toggle
 * auto-advance (default OFF · 6s/slide). NUNCA audio (cilada).
 *
 * CSS: classes .pitch-* (definidas inline via styled-jsx pra encapsular).
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { GrowthPanel, B2BPartnershipDTO } from '@clinicai/repositories'

interface Slide {
  eyebrow: string
  titleHtml: string
  subtitle: string
}

export interface PitchModeProps {
  partnership: B2BPartnershipDTO
  data: GrowthPanel
  /** Primeiros nomes (mascarados pra privacidade) das pacientes que viraram clientes pagantes. */
  topConversions?: string[]
  onClose: () => void
}

/** Mascara: "Maria Silva" → "Maria S." Usa só primeiro nome + inicial sobrenome. */
function maskName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`
}

export function PitchMode({
  partnership,
  data,
  topConversions = [],
  onClose,
}: PitchModeProps) {
  const [slide, setSlide] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)

  const c = data.conversion_lifetime
  const cost = data.cost
  const nps = data.nps
  const pitch = data.pitch_stats

  // ROI estimativa simples · ticket medio R$ 800
  const ticket = 800
  const valorGerado = c.vouchers_purchased * ticket
  const roi =
    cost.vouchers_brl > 0
      ? Math.round(((valorGerado - cost.vouchers_brl) / cost.vouchers_brl) * 100)
      : 0

  // DNA
  const dnaParts: { label: string; v: number | null }[] = [
    { label: 'Excelência', v: partnership.dnaExcelencia },
    { label: 'Estética', v: partnership.dnaEstetica },
    { label: 'Propósito', v: partnership.dnaProposito },
  ]
  const hasDna = dnaParts.some((d) => d.v != null)
  const dnaScore = partnership.dnaScore

  const igHandle = useMemo(() => {
    const raw = partnership.contactInstagram
    if (!raw) return null
    return raw.startsWith('@') ? raw : `@${raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')}`
  }, [partnership.contactInstagram])

  const SLIDES: Slide[] = [
    // 1 · Capa
    {
      eyebrow: 'Clínica Mirian de Paula',
      titleHtml: `Círculo<br><em>Mirian</em><br><span class="pitch-partner">${escapeHtml(partnership.name)}</span>${
        igHandle
          ? `<span class="pitch-ig">${escapeHtml(igHandle)}</span>`
          : ''
      }`,
      subtitle:
        'Uma rede de marcas que compartilham nosso cuidado. Sua marca está nesse círculo.',
    },
    // 2 · Pillar + DNA
    {
      eyebrow: partnership.pillar
        ? `Pilar · ${partnership.pillar}`
        : 'DNA da parceria',
      titleHtml: hasDna
        ? `DNA<br><span class="pitch-stat">${
            dnaScore != null ? dnaScore.toFixed(1) : '—'
          }</span><small>de 10</small>`
        : 'DNA<br><em>em avaliação</em>',
      subtitle: hasDna
        ? `Excelência ${fmt(partnership.dnaExcelencia)} · Estética ${fmt(
            partnership.dnaEstetica,
          )} · Propósito ${fmt(
            partnership.dnaProposito,
          )}. As três dimensões que definem se uma marca cabe no círculo.`
        : 'Vamos avaliar juntas as 3 dimensões: Excelência, Estética e Propósito. Sem isso, não tem círculo.',
    },
    // 3 · Volume mensal
    {
      eyebrow: 'Sua performance',
      titleHtml: `<span class="pitch-stat">${c.vouchers_purchased}</span><small>convidadas viraram pacientes</small>`,
      subtitle: `De ${c.vouchers_total} vouchers emitidos, ${c.vouchers_redeemed} foram resgatados e ${c.vouchers_purchased} viraram clientes pagantes da Clínica. Conversão: ${c.conv_pct.toFixed(1)}%.`,
    },
    // 4 · Top conversoes (nomes mascarados)
    {
      eyebrow: 'Histórias reais',
      titleHtml:
        topConversions.length > 0
          ? `Já <em>cuidamos</em><br>de ${topConversions.length}<br><small>convidadas suas</small>`
          : 'Plantando<br><em>presença</em>',
      subtitle:
        topConversions.length > 0
          ? `${topConversions
              .slice(0, 6)
              .map(maskName)
              .filter(Boolean)
              .join(' · ')}${
              topConversions.length > 6 ? ` · +${topConversions.length - 6}` : ''
            }. Cada nome é uma história · não um número.`
          : 'A semente está plantada. À medida que as próximas convidadas chegarem e cuidarem da pele, esse slide se enche de nomes reais.',
    },
    // 5 · ROI / impacto financeiro
    {
      eyebrow: 'Valor gerado',
      titleHtml: `<span class="pitch-stat">R$ ${(valorGerado / 1000).toFixed(0)}<small>k</small></span>`,
      subtitle:
        roi > 0
          ? `Estimamos R$ ${valorGerado.toLocaleString('pt-BR')} em receita pra Clínica via essa parceria. ROI estimado: +${roi}%. Trabalho da sua marca, traduzido em números.`
          : valorGerado > 0
            ? `Estimamos R$ ${valorGerado.toLocaleString('pt-BR')} em receita gerada — ainda recuperando custo. À medida que mais convidadas pagarem, o ROI vira.`
            : `Estamos no início — ${c.vouchers_total} vouchers já emitidos. À medida que mais convidadas pagarem, o valor escala. A parceria está plantada.`,
    },
    // 6 · Proximos passos · sugestao Mira
    {
      eyebrow: 'Próximos passos',
      titleHtml: 'Vamos<br>crescer<br><em>juntas?</em>',
      subtitle: nextStepHint(c, cost, nps),
    },
    // 7 · Obrigada
    {
      eyebrow: 'Sua presença, nosso círculo',
      titleHtml: `Obrigada,<br><em>parceria</em> 💎`,
      subtitle:
        'Continuamos juntas no próximo ciclo. A Clínica Mirian de Paula agradece sua confiança no programa.',
    },
  ]

  const totalSlides = SLIDES.length

  const goNext = useCallback(() => {
    setSlide((s) => Math.min(totalSlides - 1, s + 1))
  }, [totalSlides])

  const goPrev = useCallback(() => {
    setSlide((s) => Math.max(0, s - 1))
  }, [])

  // Keyboard controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === ' ') {
        // Space alterna auto-advance · NAO avanca direto (era o comportamento
        // antigo · pedido Alden 2026-04-26: Space toggle, setas avancam)
        e.preventDefault()
        setAutoPlay((p) => !p)
        return
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, goNext, goPrev])

  // Auto-advance · 6s por slide quando ligado · pausa no ultimo
  useEffect(() => {
    if (!autoPlay) return
    if (slide >= totalSlides - 1) return
    const id = window.setTimeout(() => goNext(), 6000)
    return () => window.clearTimeout(id)
  }, [autoPlay, slide, totalSlides, goNext])

  const current = SLIDES[slide] || SLIDES[0]

  return (
    <div className="pitch-overlay" key={slide}>
      <div className="pitch-bg" />

      <div className="pitch-slide">
        <div className="pitch-eyebrow">{current.eyebrow}</div>
        <h1
          className="pitch-title"
          dangerouslySetInnerHTML={{ __html: current.titleHtml }}
        />
        <p className="pitch-subtitle">{current.subtitle}</p>
      </div>

      <div className="pitch-bottom">
        <div className="pitch-dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              className={'pitch-dot' + (i === slide ? ' active' : '')}
              onClick={() => setSlide(i)}
              aria-label={`Ir pro slide ${i + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAutoPlay((p) => !p)}
          className={'pitch-auto' + (autoPlay ? ' active' : '')}
          title="Espaço alterna auto-avanço · 6s por slide"
        >
          {autoPlay ? '❚❚ Auto' : '▶ Auto'}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="pitch-exit"
          title="ESC sai"
        >
          Sair
        </button>
      </div>

      <div className="pitch-hints">
        <span>← / → navegar</span>
        <span>·</span>
        <span>Espaço auto</span>
        <span>·</span>
        <span>ESC sair</span>
      </div>

      <button
        type="button"
        className="pitch-close"
        onClick={onClose}
        aria-label="Fechar"
      >
        ×
      </button>

      {slide > 0 ? (
        <button
          type="button"
          className="pitch-prev"
          onClick={goPrev}
          aria-label="Anterior"
        >
          ‹
        </button>
      ) : null}

      {slide < totalSlides - 1 ? (
        <button
          type="button"
          className="pitch-next"
          onClick={goNext}
          aria-label="Próximo"
        >
          ›
        </button>
      ) : null}

      <div className="pitch-counter">
        {slide + 1} / {totalSlides}
      </div>

      <style jsx>{`
        @keyframes pitchFadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pitchBgPulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 0.8; }
        }

        .pitch-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0F0D0A;
          color: #F5F0E8;
          font-family: 'Cormorant Garamond', Georgia, serif;
          overflow: hidden;
        }

        .pitch-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 30% 20%, rgba(201,169,110,0.18) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(138,158,136,0.12) 0%, transparent 50%);
          animation: pitchBgPulse 8s ease-in-out infinite;
          pointer-events: none;
        }

        .pitch-slide {
          position: relative;
          z-index: 1;
          max-width: 900px;
          padding: 0 80px;
          text-align: center;
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          animation: pitchFadeIn 400ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .pitch-eyebrow {
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #C9A96E;
          margin-bottom: 32px;
        }

        .pitch-title {
          font-size: clamp(48px, 8vw, 96px);
          font-weight: 300;
          line-height: 1.05;
          margin: 0;
          color: #F5F0E8;
          letter-spacing: -0.02em;
        }

        .pitch-title :global(em) {
          font-style: italic;
          color: #C9A96E;
          font-weight: 400;
        }

        .pitch-title :global(small) {
          display: block;
          font-size: clamp(14px, 1.5vw, 22px);
          font-family: 'Inter', sans-serif;
          font-weight: 400;
          color: #9CA3AF;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-top: 16px;
        }

        .pitch-title :global(.pitch-stat) {
          display: inline-block;
          font-size: clamp(72px, 12vw, 144px);
          color: #C9A96E;
          font-weight: 400;
          font-variant-numeric: tabular-nums;
        }

        .pitch-title :global(.pitch-partner) {
          display: block;
          margin-top: 24px;
          font-size: clamp(20px, 2.5vw, 32px);
          font-family: 'Inter', sans-serif;
          font-weight: 300;
          color: #B5A894;
          letter-spacing: 1px;
          font-style: normal;
        }

        .pitch-title :global(.pitch-ig) {
          display: block;
          margin-top: 8px;
          font-size: clamp(13px, 1.4vw, 16px);
          font-family: 'Inter', sans-serif;
          font-weight: 400;
          color: #C9A96E;
          letter-spacing: 1.2px;
          font-style: normal;
        }

        .pitch-subtitle {
          margin: 32px auto 0;
          max-width: 640px;
          font-family: 'Inter', sans-serif;
          font-size: clamp(15px, 1.5vw, 18px);
          font-weight: 300;
          color: #B5A894;
          line-height: 1.6;
          letter-spacing: 0.3px;
        }

        .pitch-bottom {
          position: absolute;
          bottom: 64px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 24px;
          z-index: 2;
        }

        .pitch-dots {
          display: flex;
          gap: 12px;
        }
        .pitch-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(245, 240, 232, 0.2);
          border: none;
          cursor: pointer;
          padding: 0;
          transition: all 200ms ease;
        }
        .pitch-dot:hover {
          background: rgba(201, 169, 110, 0.5);
        }
        .pitch-dot.active {
          background: #C9A96E;
          width: 24px;
          border-radius: 4px;
        }

        .pitch-auto,
        .pitch-exit {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(245,240,232,0.12);
          color: #B5A894;
          font-family: 'Inter', sans-serif;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 7px 14px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 200ms ease;
        }
        .pitch-auto:hover,
        .pitch-exit:hover {
          background: rgba(201,169,110,0.12);
          border-color: rgba(201,169,110,0.4);
          color: #C9A96E;
        }
        .pitch-auto.active {
          background: rgba(201,169,110,0.18);
          border-color: rgba(201,169,110,0.5);
          color: #C9A96E;
        }
        .pitch-exit:hover {
          background: rgba(239,68,68,0.12);
          border-color: rgba(239,68,68,0.4);
          color: #FCA5A5;
        }

        .pitch-hints {
          position: absolute;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          font-family: 'Inter', sans-serif;
          font-size: 9px;
          font-weight: 400;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #6B7280;
          z-index: 2;
        }

        .pitch-close,
        .pitch-prev,
        .pitch-next {
          position: absolute;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(245, 240, 232, 0.1);
          color: #B5A894;
          cursor: pointer;
          z-index: 2;
          transition: all 200ms ease;
          font-family: 'Inter', sans-serif;
          padding: 0;
        }

        .pitch-close {
          top: 32px;
          right: 32px;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          font-size: 24px;
          line-height: 1;
        }
        .pitch-close:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.4);
          color: #FCA5A5;
        }

        .pitch-prev,
        .pitch-next {
          top: 50%;
          transform: translateY(-50%);
          width: 56px;
          height: 56px;
          border-radius: 50%;
          font-size: 32px;
          font-weight: 300;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pitch-prev:hover,
        .pitch-next:hover {
          background: rgba(201, 169, 110, 0.15);
          border-color: rgba(201, 169, 110, 0.4);
          color: #C9A96E;
        }
        .pitch-prev { left: 40px; }
        .pitch-next { right: 40px; }

        .pitch-counter {
          position: absolute;
          top: 32px;
          left: 32px;
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 400;
          letter-spacing: 2px;
          color: #6B7280;
          font-variant-numeric: tabular-nums;
          z-index: 2;
        }

        @media (max-width: 640px) {
          .pitch-slide { padding: 0 32px; }
          .pitch-prev { left: 12px; width: 44px; height: 44px; font-size: 24px; }
          .pitch-next { right: 12px; width: 44px; height: 44px; font-size: 24px; }
          .pitch-close { top: 16px; right: 16px; width: 36px; height: 36px; font-size: 20px; }
          .pitch-counter { top: 16px; left: 16px; }
          .pitch-bottom { gap: 12px; bottom: 80px; }
          .pitch-hints { bottom: 44px; }
        }
      `}</style>
    </div>
  )
}

function fmt(v: number | null): string {
  return v == null ? '—' : v.toFixed(1)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function nextStepHint(
  c: GrowthPanel['conversion_lifetime'],
  cost: GrowthPanel['cost'],
  nps: GrowthPanel['nps'],
): string {
  if (c.vouchers_total < 5) {
    return 'Próximo passo: emitir mais vouchers. Quanto mais convidadas conhecerem a Clínica, mais histórias de cuidado.'
  }
  if (c.conv_pct < 20) {
    return 'Próximo passo: ajustar combo do voucher. A conversão pode crescer com uma oferta mais alinhada ao seu público.'
  }
  if (cost.over_cap) {
    return 'Próximo passo: revisar cap mensal — sua parceria está rodando além do teto. Sinal de que vale ampliar.'
  }
  if (nps.score == null) {
    return 'Próximo passo: trimestralmente vamos pedir seu NPS. Sua voz ajusta o programa pra você.'
  }
  return 'A parceria está saudável. Continuar entregando excelência · ampliar combo se demanda crescer.'
}
