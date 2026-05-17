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

interface ProfessionalOption {
  id: string
  name: string
}

interface AgendaFiltersProps {
  /** Lista de profissionais ativos · select "Todos profissionais" */
  professionals: ReadonlyArray<ProfessionalOption>
  /** Valores distintos de `consult_type` no dataset carregado · pode ser []. */
  consultTypeOptions: readonly string[]
  /** Valores distintos de `origem` no dataset carregado · pode ser []. */
  origemOptions: readonly string[]
  current: {
    status: string | null
    professional: string | null
    paymentStatus: string | null
    consultType: string | null
    origem: string | null
  }
}

export function AgendaFilters({
  professionals,
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

  return (
    <div className="agenda-filter-bar mb-4">
      <span className="agenda-filter-bar-label">Filtros:</span>

      <select
        aria-label="Filtrar por status"
        className="agenda-filter-select"
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

      {/* Profissional · ordem legacy (agenda-smart.js L525) · 2º select */}
      <select
        aria-label="Filtrar por profissional"
        className="agenda-filter-select"
        value={current.professional ?? ''}
        onChange={(e) => updateParam('prof', e.target.value)}
      >
        <option value="">Todos profissionais</option>
        {professionals.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por tipo de consulta"
        className="agenda-filter-select"
        value={current.consultType ?? ''}
        onChange={(e) => updateParam('ct', e.target.value)}
        disabled={consultTypeOptions.length === 0}
        title={
          consultTypeOptions.length === 0
            ? 'Nenhum tipo de consulta encontrado no período selecionado · amplie o intervalo'
            : 'Filtrar por tipo de consulta'
        }
      >
        <option value="">Tipo de consulta</option>
        {consultTypeOptions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por status financeiro"
        className="agenda-filter-select"
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
        className="agenda-filter-select"
        value={current.origem ?? ''}
        onChange={(e) => updateParam('og', e.target.value)}
        disabled={origemOptions.length === 0}
        title={
          origemOptions.length === 0
            ? 'Nenhuma origem encontrada no período selecionado · amplie o intervalo'
            : 'Filtrar por origem do lead'
        }
      >
        <option value="">Origem</option>
        {origemOptions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      {/* Avaliação · placeholder visual disabled (R3_CRM_LIGHT_4 contrato Alden).
          `eval_type` existe mas sem enum canônico · sem fonte de opções.
          Renderizado pra manter paridade visual de 6 selects · zero lógica. */}
      <select
        aria-label="Filtrar por tipo de avaliação · em preparação"
        className="agenda-filter-select"
        disabled
        title="Tipo de avaliação · em preparação · enum canônico de eval_type ainda não definido (gap registrado)"
      >
        <option value="">Avaliação</option>
      </select>
    </div>
  )
}
