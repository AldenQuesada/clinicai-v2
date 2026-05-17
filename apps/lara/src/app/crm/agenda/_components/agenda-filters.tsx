'use client'

/**
 * AgendaFilters · 4 selects URL-driven · R3_CRM_3B.3.
 *
 * Filtros adicionais espelhando legacy (apenas com campos REAIS confirmados
 * no schema V2 · audit 2026-05-17):
 *
 *   1. Status            · enum canônico AppointmentStatus (11 valores)
 *   2. Tipo de consulta  · consult_type (string · sem enum · distinct do dataset)
 *   3. Financeiro        · payment_status (enum AppointmentPaymentStatus · 5 valores)
 *   4. Origem            · origem (string · sem enum · distinct do dataset)
 *
 * Avaliação (eval_type) ficou de fora · campo existe mas sem enum canônico claro
 * · não inventamos enum · reportado como gap se Alden quiser depois.
 *
 * Padrão idêntico ao `ProfessionalFilter` (URL-driven via useRouter).
 */

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  type AppointmentPaymentStatus,
} from '@clinicai/repositories'

const STATUS_VALUES: readonly AppointmentStatus[] = [
  'agendado',
  'aguardando_confirmacao',
  'confirmado',
  'aguardando',
  'na_clinica',
  'em_atendimento',
  'finalizado',
  'remarcado',
  'cancelado',
  'no_show',
  'bloqueado',
]

const PAYMENT_STATUS_LABELS: Record<AppointmentPaymentStatus, string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  pago: 'Pago',
  cortesia: 'Cortesia',
  isento: 'Isento',
}

const PAYMENT_STATUS_VALUES: readonly AppointmentPaymentStatus[] = [
  'pendente',
  'parcial',
  'pago',
  'cortesia',
  'isento',
]

interface AgendaFiltersProps {
  /** Valores distintos de `consult_type` no dataset carregado · pode ser []. */
  consultTypeOptions: readonly string[]
  /** Valores distintos de `origem` no dataset carregado · pode ser []. */
  origemOptions: readonly string[]
  current: {
    status: string | null
    paymentStatus: string | null
    consultType: string | null
    origem: string | null
  }
}

export function AgendaFilters({
  consultTypeOptions,
  origemOptions,
  current,
}: AgendaFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params?.toString() ?? '')
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  const selectClass =
    'h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
        Filtros:
      </span>

      <select
        aria-label="Filtrar por status"
        className={selectClass}
        value={current.status ?? ''}
        onChange={(e) => updateParam('status', e.target.value)}
      >
        <option value="">Todos status</option>
        {STATUS_VALUES.map((s) => (
          <option key={s} value={s}>
            {APPOINTMENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por tipo de consulta"
        className={selectClass}
        value={current.consultType ?? ''}
        onChange={(e) => updateParam('ct', e.target.value)}
        disabled={consultTypeOptions.length === 0}
        title={
          consultTypeOptions.length === 0
            ? 'Sem tipos no período carregado'
            : 'Tipo de consulta'
        }
      >
        <option value="">Todos tipos</option>
        {consultTypeOptions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por status financeiro"
        className={selectClass}
        value={current.paymentStatus ?? ''}
        onChange={(e) => updateParam('ptm', e.target.value)}
      >
        <option value="">Financeiro</option>
        {PAYMENT_STATUS_VALUES.map((v) => (
          <option key={v} value={v}>
            {PAYMENT_STATUS_LABELS[v]}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por origem"
        className={selectClass}
        value={current.origem ?? ''}
        onChange={(e) => updateParam('og', e.target.value)}
        disabled={origemOptions.length === 0}
        title={
          origemOptions.length === 0
            ? 'Sem origens no período carregado'
            : 'Origem'
        }
      >
        <option value="">Todas origens</option>
        {origemOptions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      {/* Avaliação: campo `eval_type` existe mas sem enum canônico claro · não
          implementado neste bloco · REVIEW_FIELD_NOT_AVAILABLE_IN_CURRENT_DATASET */}
    </div>
  )
}
