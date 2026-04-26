/**
 * /partnerships/[id]/dossie · versao imprimivel dos 6 slides do PitchMode.
 *
 * Server component · fetch partnership + growth panel · renderiza HTML
 * estatico otimizado pra `window.print()` (acionado pelo DossieAutoprint).
 *
 * Decisoes:
 *   - Strategy A (HTML + window.print) escolhida em vez de puppeteer
 *     porque zera deps, zera cold start e o browser do usuario faz o
 *     PDF nativamente. Mesmo conteudo do PitchMode, sem modal.
 *   - Conteudo dos slides duplicado do PitchMode.tsx (apos avaliar
 *     refactor concluimos que extrair em compartilhado complica mais
 *     do que duplica · sao ~100 linhas de markup com computed values).
 *   - Print CSS @page A4 landscape · cada `<section>` ocupa pagina
 *     inteira via `page-break-after: always` + min-height 100vh.
 *   - Tema escuro preservado · usuario precisa marcar "Graficos em
 *     segundo plano" no dialogo do browser (hint visivel na toolbar).
 *   - Header/sidebar do (authed) layout escondido por @media print
 *     (ajuste no body via globals seria invasivo · escondemos
 *     `header` direto e fazemos overlay full-bleed).
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import type { GrowthPanel, B2BPartnershipDTO } from '@clinicai/repositories'
import { DossieAutoprint } from '../DossieAutoprint'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

interface SlideContent {
  eyebrow: string
  titleHtml: string
  subtitle: string
}

function buildSlides(
  partnership: B2BPartnershipDTO,
  data: GrowthPanel,
): SlideContent[] {
  const c = data.conversion_lifetime
  const cost = data.cost
  const nps = data.nps
  const pitch = data.pitch_stats

  const ticket = 800 // valor médio estimado por procedimento pago (mesmo do PitchMode)
  const valorGerado = c.vouchers_purchased * ticket
  const roi =
    cost.vouchers_brl > 0
      ? Math.round(((valorGerado - cost.vouchers_brl) / cost.vouchers_brl) * 100)
      : 0

  return [
    {
      eyebrow: 'Clínica Mirian de Paula',
      titleHtml: `Círculo<br><em>Mirian</em><br><span class="pitch-partner">${escapeHtml(partnership.name)}</span>`,
      subtitle:
        'Uma rede de marcas que compartilham nosso cuidado. Sua marca está nesse círculo.',
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
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default async function DossiePage({ params }: PageProps) {
  const { id } = await params
  const { ctx, repos } = await loadMiraServerContext()

  const partnership = await repos.b2bPartnerships.getById(id)
  if (!partnership || partnership.clinicId !== ctx.clinic_id) {
    notFound()
  }

  const data = await repos.b2bGrowth.panel(partnership.id).catch(() => null)
  if (!data || !data.ok) {
    return (
      <div className="dossie-empty">
        <p>
          Sem dados de crescimento ainda pra gerar o dossiê.
          {data?.error ? ` (${data.error})` : ''}
        </p>
        <Link href={`/partnerships/${id}?tab=crescer`}>Voltar pra parceria</Link>
        <style>{`
          .dossie-empty {
            min-height: 60vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            color: #B5A894;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
          }
          .dossie-empty a {
            color: #C9A96E;
            text-decoration: underline;
            font-size: 12px;
          }
        `}</style>
      </div>
    )
  }

  const slides = buildSlides(partnership, data)
  const totalSlides = slides.length
  const dataNow = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="dossie-root">
      <DossieAutoprint />

      {slides.map((slide, i) => (
        <section key={i} className="dossie-page">
          <div className="dossie-bg" />

          <div className="dossie-slide">
            <div className="dossie-eyebrow">{slide.eyebrow}</div>
            <h1
              className="dossie-title"
              dangerouslySetInnerHTML={{ __html: slide.titleHtml }}
            />
            <p className="dossie-subtitle">{slide.subtitle}</p>
          </div>

          <div className="dossie-footer">
            <span className="dossie-footer-left">
              {partnership.name} · Dossiê
            </span>
            <span className="dossie-footer-right">
              {i + 1} / {totalSlides} · {dataNow}
            </span>
          </div>
        </section>
      ))}

      {/* Estilos de tela e impressao · usa <style> nao styled-jsx pq queremos
          aplicar regras de @page e @media print que styled-jsx nao escopa bem.
          Globals do app + body do (authed) layout sao reset via @media print
          escondendo `header` (AppHeader) e qualquer toolbar.
          Forcamos -webkit-print-color-adjust:exact pra preservar fundo escuro. */}
      <style>{`
        .dossie-root {
          background: #0F0D0A;
          color: #F5F0E8;
          font-family: 'Cormorant Garamond', Georgia, serif;
          width: 100%;
        }

        .dossie-page {
          position: relative;
          width: 100%;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0F0D0A;
          color: #F5F0E8;
          font-family: 'Cormorant Garamond', Georgia, serif;
          overflow: hidden;
          padding: 60px 80px;
          page-break-after: always;
          break-after: page;
        }
        .dossie-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        .dossie-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 30% 20%, rgba(201,169,110,0.18) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(138,158,136,0.12) 0%, transparent 50%);
          pointer-events: none;
          z-index: 0;
        }

        .dossie-slide {
          position: relative;
          z-index: 1;
          max-width: 900px;
          text-align: center;
          margin: auto 0;
        }

        .dossie-eyebrow {
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #C9A96E;
          margin-bottom: 32px;
        }

        .dossie-title {
          font-size: clamp(48px, 7vw, 96px);
          font-weight: 300;
          line-height: 1.05;
          margin: 0;
          color: #F5F0E8;
          letter-spacing: -0.02em;
        }
        .dossie-title em {
          font-style: italic;
          color: #C9A96E;
          font-weight: 400;
        }
        .dossie-title small {
          display: block;
          font-size: clamp(14px, 1.4vw, 22px);
          font-family: 'Inter', sans-serif;
          font-weight: 400;
          color: #9CA3AF;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-top: 16px;
        }
        .dossie-title .pitch-stat {
          display: inline-block;
          font-size: clamp(72px, 11vw, 144px);
          color: #C9A96E;
          font-weight: 400;
          font-variant-numeric: tabular-nums;
        }
        .dossie-title .pitch-partner {
          display: block;
          margin-top: 24px;
          font-size: clamp(20px, 2.4vw, 32px);
          font-family: 'Inter', sans-serif;
          font-weight: 300;
          color: #B5A894;
          letter-spacing: 1px;
          font-style: normal;
        }

        .dossie-subtitle {
          margin: 32px auto 0;
          max-width: 640px;
          font-family: 'Inter', sans-serif;
          font-size: clamp(15px, 1.4vw, 18px);
          font-weight: 300;
          color: #B5A894;
          line-height: 1.6;
          letter-spacing: 0.3px;
        }

        .dossie-footer {
          position: absolute;
          left: 60px;
          right: 60px;
          bottom: 32px;
          display: flex;
          justify-content: space-between;
          font-family: 'Inter', sans-serif;
          font-size: 10px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #6B7280;
          z-index: 1;
        }

        @page {
          size: A4 landscape;
          margin: 0;
        }

        @media print {
          html, body {
            background: #0F0D0A !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Esconder o AppHeader e qualquer chrome do (authed) layout */
          body > div > header,
          body header,
          nav {
            display: none !important;
          }
          /* O (authed) layout usa flex column h-screen overflow-hidden · resetar
             pra que o body cresca conforme o conteudo do dossie */
          body > div {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
          }
          body > div > div {
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
          }
          main {
            display: block !important;
            overflow: visible !important;
            height: auto !important;
          }

          .dossie-root,
          .dossie-page {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          .dossie-page {
            min-height: auto;
            height: 100vh;
            page-break-after: always;
            break-after: page;
          }
          .dossie-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>
    </div>
  )
}
