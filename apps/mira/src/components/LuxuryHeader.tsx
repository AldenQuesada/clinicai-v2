/**
 * LuxuryHeader · row 0 · brandbook full · acima do main nav.
 *
 * Design tokens (cravados no globals.css):
 *   - Cormorant Garamond 300 italic gold pra a "M" + nome
 *   - Champagne #C9A96E accent
 *   - Ivory #F5F0E8 text
 *   - Eyebrow letterspacing 4px
 *   - Background layered #0F0D0A
 *
 * Estrutura:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  M·I·R·A · Sistema operacional de parcerias da clinica  │
 *   │  The Partnership Operating System for Clinics    by Alden Quesada │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Server Component puro · zero estado.
 */

export function LuxuryHeader() {
  return (
    <div className="border-b border-[#C9A96E]/20 bg-gradient-to-b from-[#0F0D0A] to-[#0F0D0A]/95 px-5 py-3.5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-3">
            <span
              className="font-display text-[#C9A96E] text-[26px] leading-none tracking-[3px]"
              style={{ fontWeight: 300 }}
            >
              M·I·R·A
            </span>
            <span className="text-[12.5px] text-[#B5A894] italic">
              Sistema operacional de parcerias da clínica
            </span>
          </div>
          <span
            className="text-[10px] uppercase tracking-[3.5px] text-[#7A7165] mt-0.5"
            style={{ fontWeight: 500 }}
          >
            The Partnership Operating System for Clinics
          </span>
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-[9.5px] uppercase tracking-[2.5px] text-[#7A7165]">
            by
          </span>
          <span className="font-display text-[14px] text-[#DFC5A0] leading-none">
            Alden Quesada
          </span>
        </div>
      </div>
    </div>
  )
}
