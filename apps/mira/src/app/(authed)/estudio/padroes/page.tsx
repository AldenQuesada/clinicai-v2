/**
 * /estudio/padroes · defaults numericos B2B da clinica.
 *
 * Quatro campos editaveis (cap_brl, validity_days, lead_days, cost_brl)
 * persistidos em clinic_data.b2b_voucher_defaults · usados como base pelos
 * fluxos de voucher quando combo nao especifica override.
 */

import { Save } from 'lucide-react'
import { getVoucherDefaults, saveVoucherDefaultsAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function PadroesPage() {
  const defaults = await getVoucherDefaults()

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[640px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="pb-2 border-b border-white/10">
          <span className="eyebrow text-[#C9A96E]">Estúdio · Padrões</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
            Padrões da clínica
          </h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Valores aplicados aos vouchers B2B quando o combo não tem override próprio.
          </p>
        </div>

        <form
          action={saveVoucherDefaultsAction}
          className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <NumField
              name="cap_brl"
              label="Cap por voucher (R$)"
              hint="Valor máximo coberto pela cortesia"
              defaultValue={defaults.cap_brl}
              min={0}
              step={10}
            />
            <NumField
              name="cost_brl"
              label="Custo médio (R$)"
              hint="Custo interno estimado · usado em ROI"
              defaultValue={defaults.cost_brl}
              min={0}
              step={10}
            />
            <NumField
              name="validity_days"
              label="Validade (dias)"
              hint="Voucher expira N dias após emissão"
              defaultValue={defaults.validity_days}
              min={1}
              step={1}
            />
            <NumField
              name="lead_days"
              label="Antecedência (dias)"
              hint="Reminder de expiração N dias antes"
              defaultValue={defaults.lead_days}
              min={0}
              step={1}
            />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
            >
              <Save className="w-3 h-3" />
              Salvar padrões
            </button>
            <span className="text-[10px] text-[#6B7280]">
              Mudança aplicada a partir do próximo voucher emitido
            </span>
          </div>
        </form>
      </div>
    </main>
  )
}

function NumField({
  name,
  label,
  hint,
  defaultValue,
  min,
  step,
}: {
  name: string
  label: string
  hint: string
  defaultValue: number
  min: number
  step: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="eyebrow text-[#9CA3AF]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min={min}
        step={step}
        defaultValue={defaultValue}
        className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-sm text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50"
      />
      <span className="text-[10px] text-[#6B7280]">{hint}</span>
    </div>
  )
}
