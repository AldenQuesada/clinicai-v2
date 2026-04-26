/**
 * MiraFooter · brandbook · assina o sistema no rodape do (authed) layout.
 *
 * Mudou de top header pra footer (pedido Alden 2026-04-26 · top precisa
 * mostrar contexto operacional, brand vai pro rodape pra dar peso simbolico).
 *
 * Estrutura:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  M·I·R·A   Sistema operacional de parcerias da clinica     │
 *   │  THE PARTNERSHIP OPERATING SYSTEM FOR CLINICS  by Alden Quesada │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Server Component puro · zero estado.
 */

export function MiraFooter() {
  return (
    <footer className="shrink-0 border-t border-[#C9A96E]/15 bg-[#0F0D0A] px-5 py-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-[#C9A96E] text-[18px] leading-none"
            style={{ fontWeight: 300, letterSpacing: '2.5px' }}
          >
            M·I·R·A
          </span>
          <span className="text-[11px] text-[#B5A894] italic">
            Sistema operacional de parcerias da clínica
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span
            className="text-[9px] uppercase text-[#7A7165]"
            style={{ letterSpacing: '3px', fontWeight: 500 }}
          >
            The Partnership Operating System for Clinics
          </span>
          <span className="text-[9px] uppercase text-[#7A7165] hidden md:inline" style={{ letterSpacing: '2.5px' }}>
            by
          </span>
          <span className="font-display text-[12.5px] text-[#DFC5A0] leading-none">
            Alden Quesada
          </span>
        </div>
      </div>
    </footer>
  )
}
