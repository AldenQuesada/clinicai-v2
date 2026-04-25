/**
 * /estudio/combos · CRUD do catalogo de combos de voucher.
 *
 * Espelha "Padroes" do clinic-dashboard antigo · cada combo tem label,
 * description, is_default (apenas 1 por clinica), is_active e sort_order.
 *
 * Usado como source-of-truth pelo wizard de cadastro de parceria + emit
 * voucher single/bulk · combo marcado is_default vira pre-select.
 */

import { Plus, Star, Trash2 } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { saveComboAction, deleteComboAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CombosPage() {
  const { repos } = await loadMiraServerContext()
  const combos = await repos.b2bVoucherCombos.list()

  const active = combos.filter((c) => c.isActive)
  const inactive = combos.filter((c) => !c.isActive)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[820px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="pb-2 border-b border-white/10">
          <span className="eyebrow text-[#C9A96E]">Estúdio · Combos</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
            Catálogo de combos de voucher
          </h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Combos editáveis · 1 marcado como default vira pre-select no wizard.
          </p>
        </div>

        {/* Novo combo */}
        <details className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04]">
          <summary className="cursor-pointer px-3.5 py-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-[#C9A96E] hover:bg-[#C9A96E]/[0.06] rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Novo combo
          </summary>
          <form
            action={saveComboAction}
            className="px-3.5 pb-3.5 pt-3 flex flex-col gap-3 border-t border-[#C9A96E]/15"
          >
            <Field label="Label" required>
              <input
                name="label"
                required
                placeholder="Véu de Noiva + Anovator A5"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>
            <Field label="Descrição (interno)">
              <input
                name="description"
                placeholder="Pacote premium pré-noiva"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Marcar como default">
                <select
                  name="is_default"
                  defaultValue="false"
                  className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
                >
                  <option value="false">Não</option>
                  <option value="true">Sim</option>
                </select>
              </Field>
              <Field label="Ativo">
                <select
                  name="is_active"
                  defaultValue="true"
                  className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </Field>
              <Field label="Sort order">
                <input
                  name="sort_order"
                  type="number"
                  defaultValue={100}
                  min={0}
                  step={10}
                  className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50"
                />
              </Field>
            </div>
            <div className="flex items-center pt-1">
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
              >
                Criar combo
              </button>
            </div>
          </form>
        </details>

        {/* Lista combos ativos */}
        <section className="flex flex-col gap-2">
          <span className="eyebrow text-[#9CA3AF]">Ativos ({active.length})</span>
          {active.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
              Nenhum combo ativo · cadastre um acima.
            </div>
          ) : (
            active.map((c) => (
              <ComboRow key={c.id} combo={c} />
            ))
          )}
        </section>

        {/* Inativos collapsible */}
        {inactive.length > 0 && (
          <details>
            <summary className="cursor-pointer eyebrow text-[#6B7280] hover:text-[#F5F0E8] py-2 px-1">
              Inativos ({inactive.length})
            </summary>
            <div className="flex flex-col gap-2 mt-2">
              {inactive.map((c) => (
                <ComboRow key={c.id} combo={c} />
              ))}
            </div>
          </details>
        )}
      </div>
    </main>
  )
}

function ComboRow({
  combo,
}: {
  combo: {
    id: string
    label: string
    description: string | null
    isDefault: boolean
    isActive: boolean
    sortOrder: number
  }
}) {
  const inactive = !combo.isActive
  return (
    <details
      className={`rounded-lg border bg-white/[0.02] hover:border-white/14 transition-colors ${
        inactive ? 'border-white/10 opacity-60' : 'border-white/10'
      }`}
    >
      <summary className="cursor-pointer px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] rounded-lg transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-medium text-[#F5F0E8]">{combo.label}</span>
            {combo.isDefault && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[1.2px] px-1.5 py-0.5 rounded bg-[#C9A96E]/15 text-[#C9A96E]">
                <Star className="w-2.5 h-2.5" />
                default
              </span>
            )}
            {inactive && (
              <span className="text-[9px] font-bold uppercase tracking-[1.2px] px-1.5 py-0.5 rounded bg-white/5 text-[#9CA3AF]">
                inativo
              </span>
            )}
          </div>
          {combo.description && (
            <div className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">{combo.description}</div>
          )}
        </div>
        <span className="font-mono text-[10px] text-[#6B7280] shrink-0">#{combo.sortOrder}</span>
      </summary>

      <form
        action={saveComboAction}
        className="px-3.5 pb-3.5 pt-3 flex flex-col gap-3 border-t border-[#C9A96E]/15 bg-[#C9A96E]/[0.04] rounded-b-lg"
      >
        <input type="hidden" name="id" value={combo.id} />
        <Field label="Label" required>
          <input
            name="label"
            required
            defaultValue={combo.label}
            className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
          />
        </Field>
        <Field label="Descrição">
          <input
            name="description"
            defaultValue={combo.description ?? ''}
            className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Default">
            <select
              name="is_default"
              defaultValue={combo.isDefault ? 'true' : 'false'}
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            >
              <option value="false">Não</option>
              <option value="true">Sim</option>
            </select>
          </Field>
          <Field label="Ativo">
            <select
              name="is_active"
              defaultValue={combo.isActive ? 'true' : 'false'}
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </Field>
          <Field label="Sort">
            <input
              name="sort_order"
              type="number"
              defaultValue={combo.sortOrder}
              min={0}
              step={10}
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50"
            />
          </Field>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
          >
            Salvar
          </button>
          <DeleteForm id={combo.id} />
        </div>
      </form>
    </details>
  )
}

function DeleteForm({ id }: { id: string }) {
  return (
    <form action={deleteComboAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] border border-[#FCA5A5]/30 text-[#FCA5A5] hover:bg-[#EF4444]/8 transition-colors"
      >
        <Trash2 className="w-3 h-3" />
        Remover
      </button>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="eyebrow text-[#9CA3AF]">
        {label}
        {required && <span className="text-[#FCA5A5] ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
