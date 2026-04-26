'use client'

/**
 * PitchMode · modal fullscreen pra apresentar pra parceira em reuniao.
 *
 * Mirror funcional do `b2b-pitch-mode.ui.js` legacy + adaptado pra ser
 * PERSONALIZADO pra essa parceria (em vez de generico do programa).
 *
 * 6 slides:
 *   1. Capa            · Círculo Mirian + nome da parceria
 *   2. O que é         · Permuta de excelência
 *   3. Sua performance · KPIs reais da parceria (vouchers convertidos)
 *   4. ROI             · Valor gerado vs custo
 *   5. NPS             · Da parceria (se tem) ou da rede
 *   6. Convite         · Próximos passos
 *
 * Navegacao: ESC fecha · setas ←/→ · dots clickaveis · Space avanca.
 * CSS: classes .b2b-pitch-* (definidas inline via styled-jsx pra
 * encapsular completamente · evita conflito com globals).
 */

import { useEffect, useState, useCallback } from 'react'
import type { GrowthPanel, B2BPartnershipDTO } from '@clinicai/repositories'

interface Slide {
  eyebrow: string
  titleHtml: string
  subtitle: string
  // Stat keys preenchidos via data
  stat?: string
  statLabel?: string
}

export function PitchMode({
  partnership,
  data,
  onClose,
}: {
  partnership: B2BPartnershipDTO
  data: GrowthPanel
  onClose: () => void
}) {
  const [slide, setSlide] = useState(0)

  const c = data.conversion_lifetime
  const cost = data.cost
  const nps = data.nps
  const pitch = data.pitch_stats

  // Compute valor gerado vs custo (estimativa simples · ROI)
  const ticket = 800 // valor médio estimado por procedimento pago
  const valorGerado = c.vouchers_purchased * ticket
  const roi =
    cost.vouchers_brl > 0
      ? Math.round(((valorGerado - cost.vouchers_brl) / cost.vouchers_brl) * 100)
      : 0

  const SLIDES: Slide[] = [
    {
      eyebrow: 'Clínica Mirian de Paula',
      titleHtml: `Círculo<br><em>Mirian</em><br><span class="pitch-partner">${partnership.name}</span>`,
      subtitle: 'Uma rede de marcas que compartilham nosso cuidado. Sua marca está nesse círculo.',
    },
    {
      eyebrow: 'O que é',
      titleHtml: 'Permuta<br>de <em>excelência</em>',
      subtitle:
        'A gente entrega tratamento premium pra suas convidadas. Você entrega seu melhor pras nossas pacientes. Sem dinheiro trocando — só valor circulando.',
    },
    {
      eyebrow: 'Sua performance',
      titleHtml: `<span class="pitch-stat">${c.vouchers_purchased}</span><small>convidadas viraram pacientes</small>`,
      subtitle: `De ${c.vouchers_total} vouchers que você emitiu, ${c.vouchers_purchased} viraram clientes pagantes da Clínica. Conversão: ${c.conv_pct.toFixed(1)}%.`,
    },
    {
      eyebrow: 'Valor gerado',
      titleHtml: `<span class="pitch-stat">R$ ${(valorGerado / 1000).toFixed(0)}<small>k</small></span>`,
      subtitle:
        roi > 0
          ? `Estimamos R$ ${valorGerado.toLocaleString('pt-BR')} em receita pra Clínica via essa parceria. ROI estimado: +${roi}%. Trabalho da sua marca, traduzido em números.`
          : `Estamos no início — ${c.vouchers_total} vouchers já emitidos. À medida que mais convidadas pagarem, o valor escala. A parceria está plantada.`,
    },
    {
      eyebrow: nps.score != null ? 'Sua avaliação' : 'A rede inteira',
      titleHtml:
        nps.score != null
          ? `NPS <span class="pitch-stat">${nps.score}</span>`
          : `<span class="pitch-stat">${pitch.partnerships_count}</span><small>parcerias ativas</small>`,
      subtitle:
        nps.score != null
          ? `Sua avaliação no programa (${nps.responses} resposta(s) trimestrais). Pesquisa anônima — sua voz nunca se perde.`
          : `Você faz parte de uma rede de ${pitch.partnerships_count} marcas selecionadas pelo DNA — excelência, estética e propósito.`,
    },
    {
      eyebrow: 'Próximos passos',
      titleHtml: 'Vamos<br>crescer<br><em>juntas?</em>',
      subtitle:
        'Próximas ações: ajustar combo se conversão precisar subir, ampliar cap mensal se demanda crescer, ou apenas continuar entregando excelência. A gente costura no seu ritmo.',
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
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goNext()
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

      <div className="pitch-hints">
        <span>← / → navegar</span>
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
        @keyframes pitchSubtleZoom {
          from { transform: scale(1); }
          to   { transform: scale(1.04); }
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
          animation: pitchFadeIn 600ms cubic-bezier(0.4, 0, 0.2, 1);
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

        .pitch-dots {
          position: absolute;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 12px;
          z-index: 2;
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

        .pitch-hints {
          position: absolute;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          font-family: 'Inter', sans-serif;
          font-size: 10px;
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
        }
      `}</style>
    </div>
  )
}
