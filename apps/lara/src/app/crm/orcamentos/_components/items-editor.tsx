'use client'

/**
 * ItemsEditor · controle de items[] + discount com auto-compute de subtotal
 * por linha + total agregado.
 *
 * Shape do item bate com OrcamentoItemSchema (Zod) ·
 * { name, qty, unitPrice, subtotal, procedureCode? }.
 *
 * Decisoes v1:
 *   - Subtotal por linha = qty * unitPrice (calculado, nao editavel)
 *   - Cortesia → unitPrice=0 (nao tem flag separada por enquanto)
 *   - procedureCode opcional (catalogo de procedimentos vem em Camada 10)
 *   - Total = max(0, sum(items.subtotal) - discount)
 *
 * Pattern legacy (procs-payments-block.js): mesma estrutura, sem cortesia
 * com motivo, sem parcelamento (parcelamento vai em payments[] depois).
 */

import * as React from 'react'
import { Button, FormField, Input } from '@clinicai/ui'
import { Plus, Trash2 } from 'lucide-react'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export interface OrcamentoItemDraft {
  name: string
  qty: number
  unitPrice: number
  procedureCode?: string | null
}

export interface ItemsEditorState {
  items: OrcamentoItemDraft[]
  discount: number
}

interface ItemsEditorProps {
  value: ItemsEditorState
  onChange: (next: ItemsEditorState) => void
  disabled?: boolean
}

export function computeTotals(state: ItemsEditorState): {
  subtotal: number
  total: number
  itemsWithSubtotal: Array<OrcamentoItemDraft & { subtotal: number }>
} {
  const itemsWithSubtotal = state.items.map((it) => ({
    ...it,
    subtotal: Math.max(0, (it.qty || 0) * (it.unitPrice || 0)),
  }))
  const subtotal = itemsWithSubtotal.reduce((s, it) => s + it.subtotal, 0)
  const total = Math.max(0, subtotal - (state.discount || 0))
  return { subtotal, total, itemsWithSubtotal }
}

export function ItemsEditor({ value, onChange, disabled }: ItemsEditorProps) {
  const { subtotal, total, itemsWithSubtotal } = computeTotals(value)

  function updateItem(idx: number, patch: Partial<OrcamentoItemDraft>) {
    const next = value.items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    onChange({ ...value, items: next })
  }

  function removeItem(idx: number) {
    onChange({ ...value, items: value.items.filter((_, i) => i !== idx) })
  }

  function addItem() {
    onChange({
      ...value,
      items: [
        ...value.items,
        { name: '', qty: 1, unitPrice: 0, procedureCode: null },
      ],
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {value.items.length === 0 && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Nenhum item · adicione pelo menos 1 procedimento.
          </p>
        )}
        {value.items.map((it, i) => (
          <div
            key={i}
            className="grid grid-cols-12 items-end gap-2 rounded-md border border-[var(--border)] p-2"
          >
            <div className="col-span-12 md:col-span-5">
              <FormField label={i === 0 ? 'Procedimento' : ''} htmlFor={`item-${i}-name`}>
                <Input
                  id={`item-${i}-name`}
                  value={it.name}
                  onChange={(e) => updateItem(i, { name: e.target.value })}
                  placeholder="Ex: Lipo HD abdome"
                  disabled={disabled}
                />
              </FormField>
            </div>
            <div className="col-span-3 md:col-span-1">
              <FormField label={i === 0 ? 'Qty' : ''} htmlFor={`item-${i}-qty`}>
                <Input
                  id={`item-${i}-qty`}
                  type="number"
                  min={1}
                  step={1}
                  value={it.qty || ''}
                  onChange={(e) =>
                    updateItem(i, { qty: parseInt(e.target.value, 10) || 0 })
                  }
                  disabled={disabled}
                />
              </FormField>
            </div>
            <div className="col-span-5 md:col-span-3">
              <FormField label={i === 0 ? 'Unitário' : ''} htmlFor={`item-${i}-price`}>
                <Input
                  id={`item-${i}-price`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={it.unitPrice || ''}
                  onChange={(e) =>
                    updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })
                  }
                  disabled={disabled}
                />
              </FormField>
            </div>
            <div className="col-span-3 text-right md:col-span-2">
              <div className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
                {i === 0 ? 'Subtotal' : ''}
              </div>
              <div className="mt-2 text-sm text-[var(--foreground)]">
                {BRL.format(itemsWithSubtotal[i].subtotal)}
              </div>
            </div>
            <div className="col-span-1 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(i)}
                disabled={disabled}
                aria-label="Remover item"
              >
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addItem}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Adicionar item
      </Button>

      <div className="grid grid-cols-1 gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-2">
        <FormField label="Desconto (R$)" htmlFor="orc-discount" hint="Aplica sobre o subtotal · 0 se não houver">
          <Input
            id="orc-discount"
            type="number"
            min={0}
            step="0.01"
            value={value.discount || ''}
            onChange={(e) =>
              onChange({ ...value, discount: parseFloat(e.target.value) || 0 })
            }
            disabled={disabled}
          />
        </FormField>
        <div className="flex flex-col justify-end text-right">
          <div className="text-xs text-[var(--muted-foreground)]">
            Subtotal: {BRL.format(subtotal)}
          </div>
          {value.discount > 0 && (
            <div className="text-xs text-rose-300">
              Desconto: − {BRL.format(value.discount)}
            </div>
          )}
          <div className="font-display-italic text-2xl text-[var(--primary)]">
            Total: {BRL.format(total)}
          </div>
        </div>
      </div>
    </div>
  )
}
