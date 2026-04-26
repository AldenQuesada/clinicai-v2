'use client'

/**
 * DossieAutoprint · client tiny que dispara window.print() ao montar.
 *
 * Por que existe: a rota /partnerships/[id]/dossie eh um server component
 * (fetch + render). Pra abrir o dialogo de print do browser sem clique
 * extra, precisamos de um sliver de client component.
 *
 * Estrategia:
 *   1. Espera document.fonts.ready (Cormorant Garamond eh display=swap, se
 *      imprimir antes da fonte carregar, sai com fallback Georgia · feio).
 *   2. Pequeno delay extra pra layout/imagens estabilizarem.
 *   3. window.print() · usuario salva como PDF no dialogo nativo.
 *
 * Reimprimir: botao manual "Imprimir/Salvar PDF" tambem renderizado pra
 * caso o autoprint seja bloqueado por popup-blocker / 2nd run.
 */

import { useEffect, useState } from 'react'

export function DossieAutoprint() {
  const [printed, setPrinted] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function go() {
      try {
        // 1. Espera fontes carregarem (Cormorant + Inter)
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready
        }
      } catch {
        /* ignore · alguns browsers nao suportam document.fonts.ready */
      }
      // 2. Delay extra pra layout final assentar
      await new Promise((r) => setTimeout(r, 600))
      if (cancelled) return
      // 3. Print
      try {
        window.print()
        setPrinted(true)
      } catch {
        /* ignore · se bloqueou, usuario clica botao manual */
      }
    }

    void go()
    return () => {
      cancelled = true
    }
  }, [])

  function manualPrint() {
    window.print()
    setPrinted(true)
  }

  return (
    <div className="dossie-toolbar">
      <button type="button" onClick={manualPrint} className="dossie-print-btn">
        {printed ? 'Imprimir / Salvar PDF de novo' : 'Imprimir / Salvar PDF'}
      </button>
      <span className="dossie-toolbar-hint">
        Dica · no diálogo do browser, escolha &ldquo;Salvar como PDF&rdquo; e ative
        &ldquo;Gráficos em segundo plano&rdquo;.
      </span>

      <style jsx>{`
        .dossie-toolbar {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          font-family: 'Inter', sans-serif;
        }
        .dossie-print-btn {
          background: #c9a96e;
          color: #1a1814;
          border: none;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          transition: background 200ms ease;
        }
        .dossie-print-btn:hover {
          background: #d4b785;
        }
        .dossie-toolbar-hint {
          background: rgba(0, 0, 0, 0.7);
          color: #b5a894;
          font-size: 10px;
          padding: 6px 10px;
          border-radius: 6px;
          max-width: 260px;
          text-align: right;
          line-height: 1.4;
        }
        @media print {
          .dossie-toolbar {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
