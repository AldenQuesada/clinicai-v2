/**
 * Tab Automacao · 2 blocos lado a lado (pedido Alden 2026-04-26).
 *
 * ESQUERDA · ⚙️ Padroes · defaults numericos voucher (cap_brl, validity_days,
 *           lead_days, cost_brl) · clinic_data b2b_voucher_defaults
 * DIREITA  · ⏰ Rotinas · 11 cron jobs Mira (digest/alert/reminder/suggestion)
 *           toggle on/off + ultimas runs · mira_cron_jobs + mira_cron_runs
 *
 * Substitui /estudio/padroes e /b2b/config/rotinas (ambos redirect 308 pra
 * /configuracoes?tab=automacao).
 *
 * Server fetch paralelo · reusa Server Action de Padroes (form) e Client
 * Component RotinasClient direto (zero duplicacao).
 */

import { Save } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import {
  getVoucherDefaults,
  saveVoucherDefaultsAction,
} from '../estudio/padroes/actions'
import { RotinasClient } from '../b2b/config/rotinas/RotinasClient'

export async function AutomacaoTab() {
  const { repos } = await loadMiraServerContext()
  const [defaults, jobs] = await Promise.all([
    getVoucherDefaults(),
    repos.miraCronRegistry.list().catch(() => []),
  ])

  return (
    <div
      className="cfg-automacao-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
        gap: 16,
        alignItems: 'start',
      }}
    >
      <section className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-w-0">
        <header>
          <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
            ⚙️ Padrões · voucher
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            Defaults numéricos aplicados ao voucher quando combo não tem override (cap, validade, antecedência, custo)
          </p>
        </header>
        <form
          action={saveVoucherDefaultsAction}
          className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-3 flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              Aplicado a partir do próximo voucher emitido
            </span>
          </div>
        </form>
      </section>

      <section className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-w-0">
        <header>
          <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
            ⏰ Rotinas · cron Mira
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            Liga/desliga os {jobs.length} jobs proativos (digests, alertas, reminders, sugestões)
          </p>
        </header>
        <RotinasClient initialJobs={jobs} />
      </section>
    </div>
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
