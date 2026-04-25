/**
 * /vouchers/novo · emit single voucher rapido.
 *
 * Reusa infra de queue · 1 item enfileira + redirect pra batch tracking.
 * Mesmo padrao visual do bulk page · gold-tinted form, max-w-[640px].
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { emitVoucherSingleAction } from './actions'

export const dynamic = 'force-dynamic'

function localNowInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function VoucherNovoPage() {
  const { ctx, repos } = await loadMiraServerContext()
  const partnerships = await repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' })

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[640px] mx-auto px-6 py-6 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/8">
          <div className="flex items-center gap-3">
            <Link
              href="/vouchers"
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div>
              <h1 className="font-display text-xl text-[#F5F0E8]">Emitir voucher</h1>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Single · entra na fila + dispatch automatico (mesma infra do bulk)
              </p>
            </div>
          </div>
          <Link
            href="/vouchers/bulk"
            className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:text-[#C9A96E] hover:border-[#C9A96E]/40 transition-colors"
          >
            Lote (bulk)
          </Link>
        </div>

        <form
          action={emitVoucherSingleAction}
          className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3.5"
        >
          <Field label="Parceria" id="v-partner" required>
            <select
              id="v-partner"
              name="partnership_id"
              required
              defaultValue=""
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            >
              <option value="" disabled>
                Selecionar parceria ativa…
              </option>
              {partnerships.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {partnerships.length === 0 && (
              <span className="text-[10px] text-[#FCA5A5]">
                Nenhuma parceria ativa · cadastra uma em Estúdio › Cadastrar parceria
              </span>
            )}
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nome da convidada" id="v-name" required>
              <input
                id="v-name"
                name="name"
                type="text"
                required
                placeholder="Ana"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>

            <Field label="Telefone (BR)" id="v-phone" required>
              <input
                id="v-phone"
                name="phone"
                type="tel"
                required
                placeholder="(44) 99876-5432"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>
          </div>

          <Field label="Combo (opcional)" id="v-combo">
            <input
              id="v-combo"
              name="combo"
              type="text"
              placeholder="Limpeza de pele + Olheiras"
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            />
          </Field>

          <Field label="Agendar pra (opcional · default agora)" id="v-sched">
            <input
              id="v-sched"
              name="scheduled_at"
              type="datetime-local"
              defaultValue={localNowInput()}
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            />
          </Field>

          <div className="flex items-center gap-2 pt-2 border-t border-white/8">
            <button
              type="submit"
              disabled={partnerships.length === 0}
              className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Enfileirar e disparar
            </button>
            <span className="text-[10px] text-[#6B7280]">
              Voucher entra na queue · dispatch acontece no proximo cron (~1min)
            </span>
          </div>
        </form>
      </div>
    </main>
  )
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string
  id: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="eyebrow text-[#9CA3AF]">
        {label}
        {required && <span className="text-[#FCA5A5] ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
