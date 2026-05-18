'use client'

/**
 * ProcedureItemsBlock · CRM_PARITY_R2.
 *
 * Bloco multi-procedimento + multi-pagamento para o wizard de novo
 * agendamento. Espelha legacy `_apptProcs[]` + `_apptPagamentos[]`.
 *
 * Modo: opt-in. Quando o usuário aciona "Múltiplos procedimentos", esse
 * componente assume a entrada de itens + pagamentos e calcula totalizador
 * + diff visual. Submit do form pai consome `items` e `payments` quando
 * houver, e cai no caminho legacy (single value + paymentMethod) caso
 * contrário (dual-write).
 *
 * Não fala com server · validações finais ocorrem em Zod + DB CHECK.
 */

import React from 'react'
import { Money } from '@clinicai/utils'

type PaymentMethodValue =
  | 'pix'
  | 'dinheiro'
  | 'debito'
  | 'credito'
  | 'parcelado'
  | 'entrada_saldo'
  | 'boleto'
  | 'link'
  | 'cortesia'
  | 'convenio'

type PaymentRowStatus = 'pendente' | 'pago' | 'cancelado'

export interface ProcedureItemDraft {
  procedureId: string | null
  procedureName: string
  quantity: number
  unitPrice: number
  discountAmount: number
  isCourtesy: boolean
  courtesyReason: string
  isReturn: boolean
  returnIntervalDays: number | null
}

export interface PaymentDraft {
  paymentMethod: PaymentMethodValue
  amount: number
  installments: number | null
  dueDate: string | null
  status: PaymentRowStatus
  notes: string
}

export interface ProcedureCatalogOption {
  id: string
  nome: string
  preco: number | null
  precoPromo: number | null
}

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<{ value: PaymentMethodValue; label: string }> = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'parcelado', label: 'Parcelado' },
  { value: 'entrada_saldo', label: 'Entrada + Saldo' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'link', label: 'Link Pagamento' },
  { value: 'cortesia', label: 'Cortesia' },
  { value: 'convenio', label: 'Convênio' },
]

const PAYMENT_STATUS_ROW_OPTIONS: ReadonlyArray<{ value: PaymentRowStatus; label: string }> = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
  { value: 'cancelado', label: 'Cancelado' },
]

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function emptyItem(): ProcedureItemDraft {
  return {
    procedureId: null,
    procedureName: '',
    quantity: 1,
    unitPrice: 0,
    discountAmount: 0,
    isCourtesy: false,
    courtesyReason: '',
    isReturn: false,
    returnIntervalDays: null,
  }
}

function emptyPayment(): PaymentDraft {
  return {
    paymentMethod: 'pix',
    amount: 0,
    installments: null,
    dueDate: null,
    status: 'pendente',
    notes: '',
  }
}

function itemGross(it: ProcedureItemDraft): number {
  return Money.round2(it.unitPrice * it.quantity)
}
function itemNet(it: ProcedureItemDraft): number {
  if (it.isCourtesy) return 0
  return Money.round2(Math.max(0, itemGross(it) - it.discountAmount))
}

export interface ProcedureItemsBlockProps {
  items: ProcedureItemDraft[]
  payments: PaymentDraft[]
  catalog: ReadonlyArray<ProcedureCatalogOption>
  onItemsChange: (items: ProcedureItemDraft[]) => void
  onPaymentsChange: (payments: PaymentDraft[]) => void
  disabled?: boolean
}

export function ProcedureItemsBlock({
  items,
  payments,
  catalog,
  onItemsChange,
  onPaymentsChange,
  disabled,
}: ProcedureItemsBlockProps) {
  const grossTotal = Money.sum(items.map(itemGross))
  const discountTotal = Money.sum(items.map((i) => (i.isCourtesy ? 0 : i.discountAmount)))
  const netTotal = Money.sum(items.map(itemNet))
  const paidTotal = Money.sum(
    payments.filter((p) => p.status === 'pago').map((p) => p.amount),
  )
  const pendingTotal = Money.sum(
    payments.filter((p) => p.status === 'pendente').map((p) => p.amount),
  )
  const balance = Money.sub(netTotal, paidTotal)
  const hasCourtesy = items.some((i) => i.isCourtesy)

  const totalCommitted = Money.add(paidTotal, pendingTotal)
  const overpaying = Money.gt(totalCommitted, netTotal)

  let derivedStatus: 'cortesia' | 'pendente' | 'parcial' | 'pago' = 'pendente'
  if (Money.isZero(netTotal)) {
    derivedStatus = hasCourtesy ? 'cortesia' : 'pendente'
  } else if (Money.isZero(paidTotal)) {
    derivedStatus = 'pendente'
  } else if (Money.lt(paidTotal, netTotal)) {
    derivedStatus = 'parcial'
  } else {
    derivedStatus = 'pago'
  }

  function patchItem(idx: number, patch: Partial<ProcedureItemDraft>) {
    const next = items.slice()
    next[idx] = { ...next[idx], ...patch }
    onItemsChange(next)
  }
  function addItem() {
    onItemsChange([...items, emptyItem()])
  }
  function removeItem(idx: number) {
    onItemsChange(items.filter((_, i) => i !== idx))
  }
  function patchPayment(idx: number, patch: Partial<PaymentDraft>) {
    const next = payments.slice()
    next[idx] = { ...next[idx], ...patch }
    onPaymentsChange(next)
  }
  function addPayment() {
    const seed = emptyPayment()
    if (Money.gt(balance, 0)) seed.amount = balance
    onPaymentsChange([...payments, seed])
  }
  function removePayment(idx: number) {
    onPaymentsChange(payments.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-6">
      <section className="border rounded-lg p-4 bg-white/40">
        <header className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Procedimentos</h3>
          <button
            type="button"
            onClick={addItem}
            disabled={disabled}
            className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
          >
            + Adicionar procedimento
          </button>
        </header>

        {items.length === 0 && (
          <p className="text-xs text-zinc-500 italic">
            Nenhum procedimento adicionado · usando valor único do form acima.
          </p>
        )}

        <ul className="space-y-3">
          {items.map((it, idx) => (
            <li key={idx} className="border rounded p-3 bg-white space-y-2">
              <div className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="text-xs">
                    Procedimento
                    {catalog.length > 0 ? (
                      <select
                        value={it.procedureId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null
                          const match = id ? catalog.find((c) => c.id === id) : null
                          patchItem(idx, {
                            procedureId: id,
                            procedureName: match?.nome ?? it.procedureName,
                            unitPrice:
                              match?.precoPromo ?? match?.preco ?? it.unitPrice,
                          })
                        }}
                        disabled={disabled}
                        className="w-full border rounded px-2 py-1 text-sm"
                      >
                        <option value="">— manual —</option>
                        {catalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      type="text"
                      value={it.procedureName}
                      onChange={(e) => patchItem(idx, { procedureName: e.target.value })}
                      placeholder="Nome do procedimento"
                      disabled={disabled}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </label>
                  <label className="text-xs">
                    Quantidade
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) =>
                        patchItem(idx, {
                          quantity: Math.max(1, parseInt(e.target.value || '1', 10)),
                        })
                      }
                      disabled={disabled}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    Valor unitário (R$)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) =>
                        patchItem(idx, {
                          unitPrice: Money.round2(parseFloat(e.target.value || '0')),
                        })
                      }
                      disabled={disabled || it.isCourtesy}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    Desconto (R$)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.discountAmount}
                      onChange={(e) =>
                        patchItem(idx, {
                          discountAmount: Math.max(
                            0,
                            Money.round2(parseFloat(e.target.value || '0')),
                          ),
                        })
                      }
                      disabled={disabled || it.isCourtesy}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={disabled}
                  aria-label="Remover procedimento"
                  className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="text-xs flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={it.isCourtesy}
                    onChange={(e) =>
                      patchItem(idx, {
                        isCourtesy: e.target.checked,
                        discountAmount: e.target.checked ? 0 : it.discountAmount,
                      })
                    }
                    disabled={disabled}
                  />
                  Cortesia (net = 0)
                </label>
                {it.isCourtesy && (
                  <label className="text-xs">
                    Motivo da cortesia (≥ 3 chars)
                    <input
                      type="text"
                      value={it.courtesyReason}
                      onChange={(e) => patchItem(idx, { courtesyReason: e.target.value })}
                      disabled={disabled}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </label>
                )}
                <label className="text-xs flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={it.isReturn}
                    onChange={(e) =>
                      patchItem(idx, {
                        isReturn: e.target.checked,
                        returnIntervalDays: e.target.checked
                          ? it.returnIntervalDays ?? 30
                          : null,
                      })
                    }
                    disabled={disabled}
                  />
                  Retorno (gera follow-up)
                </label>
                {it.isReturn && (
                  <label className="text-xs">
                    Intervalo de retorno (dias)
                    <input
                      type="number"
                      min={1}
                      value={it.returnIntervalDays ?? 30}
                      onChange={(e) =>
                        patchItem(idx, {
                          returnIntervalDays: Math.max(
                            1,
                            parseInt(e.target.value || '30', 10),
                          ),
                        })
                      }
                      disabled={disabled}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </label>
                )}
              </div>

              <div className="text-xs text-zinc-600 flex justify-between border-t pt-1">
                <span>Bruto: {BRL.format(itemGross(it))}</span>
                <span>Desconto: {BRL.format(it.isCourtesy ? 0 : it.discountAmount)}</span>
                <span className="font-semibold">
                  Líquido: {BRL.format(itemNet(it))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border rounded-lg p-4 bg-white/40">
        <header className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Pagamentos</h3>
          <button
            type="button"
            onClick={addPayment}
            disabled={disabled}
            className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
          >
            + Adicionar pagamento
          </button>
        </header>

        {payments.length === 0 && (
          <p className="text-xs text-zinc-500 italic">
            Nenhum pagamento registrado · usando forma única do form acima.
          </p>
        )}

        <ul className="space-y-3">
          {payments.map((p, idx) => (
            <li key={idx} className="border rounded p-3 bg-white space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="text-xs">
                  Forma
                  <select
                    value={p.paymentMethod}
                    onChange={(e) =>
                      patchPayment(idx, {
                        paymentMethod: e.target.value as PaymentMethodValue,
                      })
                    }
                    disabled={disabled}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Valor (R$)
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={p.amount}
                    onChange={(e) =>
                      patchPayment(idx, {
                        amount: Money.round2(parseFloat(e.target.value || '0')),
                      })
                    }
                    disabled={disabled}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs">
                  Status
                  <select
                    value={p.status}
                    onChange={(e) =>
                      patchPayment(idx, { status: e.target.value as PaymentRowStatus })
                    }
                    disabled={disabled}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    {PAYMENT_STATUS_ROW_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Parcelas
                  <input
                    type="number"
                    min={1}
                    value={p.installments ?? ''}
                    onChange={(e) =>
                      patchPayment(idx, {
                        installments: e.target.value
                          ? Math.max(1, parseInt(e.target.value, 10))
                          : null,
                      })
                    }
                    disabled={disabled}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs">
                  Vencimento
                  <input
                    type="date"
                    value={p.dueDate ?? ''}
                    onChange={(e) => patchPayment(idx, { dueDate: e.target.value || null })}
                    disabled={disabled}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs md:col-span-1">
                  Observação
                  <input
                    type="text"
                    value={p.notes}
                    onChange={(e) => patchPayment(idx, { notes: e.target.value })}
                    disabled={disabled}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removePayment(idx)}
                  disabled={disabled}
                  className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 disabled:opacity-50"
                >
                  Remover pagamento
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className={`border rounded-lg p-4 ${
          overpaying
            ? 'bg-red-50 border-red-200'
            : Money.isZero(balance)
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
        }`}
        aria-label="Totalizador financeiro"
      >
        <h3 className="font-semibold text-sm mb-2">Totalizador</h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div>
            <dt className="text-zinc-500">Bruto</dt>
            <dd className="font-mono">{BRL.format(grossTotal)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Desconto</dt>
            <dd className="font-mono">{BRL.format(discountTotal)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Líquido</dt>
            <dd className="font-mono font-semibold">{BRL.format(netTotal)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Pago</dt>
            <dd className="font-mono text-emerald-700">{BRL.format(paidTotal)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Pendente</dt>
            <dd className="font-mono text-amber-700">{BRL.format(pendingTotal)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Saldo</dt>
            <dd
              className={`font-mono font-semibold ${
                Money.lt(balance, 0)
                  ? 'text-red-700'
                  : Money.isZero(balance)
                    ? 'text-emerald-700'
                    : 'text-amber-700'
              }`}
            >
              {BRL.format(balance)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-zinc-500">Status derivado</dt>
            <dd className="font-semibold">{derivedStatus}</dd>
          </div>
        </dl>
        {overpaying && (
          <p role="alert" className="text-xs text-red-700 mt-2">
            Soma de pagamentos (pago + pendente) excede o líquido. Ajuste antes
            de enviar.
          </p>
        )}
      </section>
    </div>
  )
}
